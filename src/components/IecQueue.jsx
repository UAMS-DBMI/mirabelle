import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useSelector } from "react-redux";

import {
  getCachedSizeEstimate,
  getCachedThumbnail,
  getIecThumbnail,
  getQueueRowInfo,
  getSizeEstimatesVersion,
  statusKind,
  subscribeSizeEstimates,
} from "@/lib/iecQueueData";
import { getMaskDraftIds, subscribeMaskDrafts } from "@/lib/maskDrafts";
import {
  getLoadedExamIds,
  getLoadedExamSizeBytes,
  pruneLoadedExams,
  subscribeLoadedExams,
} from "@/lib/loadedExams";
import MaterialIcon from "@/components/MaterialIcon";

import "./IecQueue.css";

// The synthetic filter key for "has an unsubmitted mask selection". Only the
// mask route ever populates drafts, so it's the only route that shows it.
const DRAFT_FILTER = "drafts";

// Compact byte size for a row: MB for exams, GB once they get big. Decoded
// in-memory size, so it runs larger than the compressed DICOM on disk.
function formatCacheSize(bytes) {
  if (!bytes || bytes <= 0) return null;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb >= 10) return `${Math.round(mb)} MB`;
  return `${mb.toFixed(1)} MB`;
}

// Rows beyond this are still listed and navigable, but not detail-enriched up
// front — a pathological VR with thousands of IECs shouldn't trigger
// thousands of background requests. Their details load when scrolled to.
const MAX_BACKGROUND_ENRICH = 400;

// The list endpoints return bare ids today; tolerate object items the same
// way the dicom route's idOf does, in case a payload grows richer.
function idOf(item) {
  if (item == null) return null;
  if (typeof item === "object") {
    return String(
      item.image_equivalence_class_id ?? item.IEC ?? item.id ?? item.value,
    );
  }
  return String(item);
}

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "done", label: "Done" },
  { key: "skipped", label: "Skipped" },
];

function IecQueueThumb({ kind, id }) {
  const holderRef = useRef(null);
  const [src, setSrc] = useState(() => getCachedThumbnail(kind, id));
  const [failed, setFailed] = useState(false);

  // Lazy-load: only rows actually scrolled into view render a thumbnail, so
  // opening a long VR doesn't download a DICOM file per row up front.
  useEffect(() => {
    if (src || failed || kind === "nifti") return undefined;
    const element = holderRef.current;
    if (!element) return undefined;
    let cancelled = false;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      getIecThumbnail(kind, id)
        .then((dataUrl) => {
          if (!cancelled) setSrc(dataUrl);
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        });
    });
    observer.observe(element);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [kind, id, src, failed]);

  return (
    <span ref={holderRef} className="iec-queue__thumb">
      {src ? <img src={src} alt="" /> : <span className="iec-queue__thumb-empty" />}
    </span>
  );
}

function IecQueueRow({
  kind,
  id,
  info,
  selected,
  hasDraft,
  loaded,
  sizeLabel,
  disabled,
  onSelect,
}) {
  const rowRef = useRef(null);

  // Keep the active exam visible while the curator navigates with the arrow
  // keys / hotkeys rather than by clicking rows.
  useEffect(() => {
    if (selected) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const kindClass = statusKind(info?.status);
  return (
    <button
      ref={rowRef}
      type="button"
      className={`iec-queue__row${selected ? " selected" : ""}`}
      onClick={() => onSelect(id)}
      // Navigating to another exam is blocked while one is loading (see the VR
      // wrappers); disable the rows so the list reads as inert, not broken.
      disabled={disabled && !selected}
      title={info?.secondary || undefined}
    >
      <span className={`iec-queue__dot ${kindClass ?? "unknown"}`} />
      <IecQueueThumb kind={kind} id={id} />
      <span className="iec-queue__text">
        <span className="iec-queue__id">
          {id}
          {hasDraft && (
            <MaterialIcon
              icon="brush"
              className="iec-queue__draft"
              title="Has an unsubmitted mask selection"
            />
          )}
        </span>
        {info && (
          <span className="iec-queue__secondary">
            <MaterialIcon
              icon={info.volumetric ? "deployed_code" : "layers"}
              className="iec-queue__type"
              title={info.volumetric ? "Volume (3D)" : "Stack (2D series)"}
            />
            {info.secondary && (
              <span className="iec-queue__secondary-text">
                {info.secondary}
              </span>
            )}
          </span>
        )}
      </span>
      {(info?.count != null || sizeLabel) && (
        <span className="iec-queue__meta">
          {info?.count != null && (
            <span className="iec-queue__count">{info.count} img</span>
          )}
          {sizeLabel && (
            <span
              className="iec-queue__size"
              title={
                sizeLabel.startsWith("~")
                  ? "Estimated size in memory once loaded"
                  : "Size in memory"
              }
            >
              {sizeLabel}
            </span>
          )}
        </span>
      )}
      {loaded && (
        <MaterialIcon
          icon="check_circle"
          className="iec-queue__loaded"
          title="Fully loaded — reopens instantly"
        />
      )}
    </button>
  );
}

/**
 * Scrollable, searchable queue of a VR's exams. Renders inside the
 * NavigationPanel card (pass it as the panel's children) rather than as its
 * own side panel. Rows enrich themselves (series, image count, status) and
 * lazy-load a middle-frame thumbnail; clicking a row navigates to that exam.
 *
 * kind selects the enrichment source: "dicom-review" | "mask" |
 * "mask-review" | "nifti" (see lib/iecQueueData.js).
 */
export default function IecQueue({
  kind,
  items,
  currentId,
  onSelect,
  idLabel = "IEC",
  hint,
}) {
  const ids = useMemo(() => (items ?? []).map(idOf).filter(Boolean), [items]);
  const [infos, setInfos] = useState({});
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  // Volume vs stack is orthogonal to status, so it's its own filter that
  // combines (AND) with the status/draft chips — e.g. "pending stacks". "all"
  // means no type filtering.
  const [typeFilter, setTypeFilter] = useState("all");
  // Independent boolean toggle: show only exams currently in the cache. Also
  // orthogonal, so it combines (AND) with the status and type filters.
  const [loadedFilter, setLoadedFilter] = useState(false);

  // Which rows have an unsubmitted mask selection. Only the mask route ever
  // records drafts, so elsewhere this stays empty and the marker/filter never
  // appear.
  const showDrafts = kind === "mask";
  const draftIds = useSyncExternalStore(
    subscribeMaskDrafts,
    getMaskDraftIds,
    getMaskDraftIds,
  );

  // Navigating to a different exam is blocked while one is still loading (see
  // the VR wrappers). Disable the non-active rows so clicks read as inert.
  const loading = useSelector((state) => state.options.loading);

  // Which exams are currently cached (reopen instantly). Re-check on every
  // navigation and load boundary — that's when the exam-LRU eviction fires —
  // so a flagged row never lies about what's still in the cache.
  const loadedIds = useSyncExternalStore(
    subscribeLoadedExams,
    getLoadedExamIds,
    getLoadedExamIds,
  );
  useEffect(() => {
    pruneLoadedExams();
  }, [loading, currentId]);

  // Re-render as pre-load size estimates resolve (each row's estimate lands
  // when its thumbnail — which downloads the metadata-bearing middle frame —
  // comes in). Only the subscription matters, so the value is unused.
  useSyncExternalStore(
    subscribeSizeEstimates,
    getSizeEstimatesVersion,
    getSizeEstimatesVersion,
  );

  // Exact in-memory size once loaded; tilde-prefixed estimate before that.
  const sizeLabelFor = (id) => {
    if (loadedIds.has(id)) {
      const label = formatCacheSize(getLoadedExamSizeBytes(id));
      if (label) return label;
    }
    const estimate = formatCacheSize(getCachedSizeEstimate(id));
    return estimate ? `~${estimate}` : null;
  };

  // Enrich rows in the background (cached + concurrency-limited in the data
  // layer, so navigation remounts don't refetch).
  useEffect(() => {
    let cancelled = false;
    if (ids.length > MAX_BACKGROUND_ENRICH) {
      console.warn(
        `[IecQueue] enriching only the first ${MAX_BACKGROUND_ENRICH} of ${ids.length} rows up front`,
      );
    }
    ids.slice(0, MAX_BACKGROUND_ENRICH).forEach((id) => {
      getQueueRowInfo(kind, id)
        .then((info) => {
          if (cancelled) return;
          setInfos((prev) => (prev[id] === info ? prev : { ...prev, [id]: info }));
        })
        .catch(() => {
          // Row renders id-only; the data layer evicts failures for retry.
        });
    });
    return () => {
      cancelled = true;
    };
  }, [kind, ids]);

  // Navigating away from an exam usually means the curator just set its
  // status — refresh that one row past the cache so its dot/counters update.
  const previousIdRef = useRef(currentId);
  useEffect(() => {
    const previousId = previousIdRef.current;
    previousIdRef.current = currentId;
    if (!previousId || previousId === currentId || !ids.includes(previousId)) {
      return undefined;
    }
    let cancelled = false;
    getQueueRowInfo(kind, previousId, { fresh: true })
      .then((info) => {
        if (!cancelled) setInfos((prev) => ({ ...prev, [previousId]: info }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [currentId, kind, ids]);

  const counts = useMemo(() => {
    const result = { pending: 0, done: 0, skipped: 0, known: 0 };
    ids.forEach((id) => {
      const kindOfRow = statusKind(infos[id]?.status);
      if (!kindOfRow) return;
      result.known += 1;
      result[kindOfRow] += 1;
    });
    return result;
  }, [ids, infos]);

  // Statuses may be genuinely unavailable (nifti) — then the dot column,
  // chips, and progress bar are omitted rather than showing everything as
  // eternally pending.
  const hasStatuses = counts.known > 0;
  const finished = counts.done + counts.skipped;

  const draftCount = useMemo(
    () =>
      showDrafts
        ? ids.reduce((total, id) => total + (draftIds.has(id) ? 1 : 0), 0)
        : 0,
    [showDrafts, ids, draftIds],
  );

  // Volume/stack tallies for the type-filter chips. Only known once a row's
  // info has enriched (volumetric is a boolean then, undefined before).
  const typeCounts = useMemo(() => {
    const result = { volume: 0, stack: 0 };
    ids.forEach((id) => {
      const volumetric = infos[id]?.volumetric;
      if (volumetric === true) result.volume += 1;
      else if (volumetric === false) result.stack += 1;
    });
    return result;
  }, [ids, infos]);
  // Only worth offering when the list actually mixes both types.
  const showTypeFilter = typeCounts.volume > 0 && typeCounts.stack > 0;

  const loadedCount = useMemo(
    () => ids.reduce((total, id) => total + (loadedIds.has(id) ? 1 : 0), 0),
    [ids, loadedIds],
  );

  // If the draft filter is active and the last draft goes away (cleared /
  // submitted), fall back to "all" so the list doesn't strand the curator on
  // an empty, no-longer-offered filter.
  useEffect(() => {
    if (statusFilter === DRAFT_FILTER && draftCount === 0) {
      setStatusFilter("all");
    }
  }, [statusFilter, draftCount]);

  // Same guard for the loaded filter: if every loaded exam is evicted while
  // it's on, turn it off rather than showing an empty, chip-less list.
  useEffect(() => {
    if (loadedFilter && loadedCount === 0) setLoadedFilter(false);
  }, [loadedFilter, loadedCount]);

  const visibleIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ids.filter((id) => {
      if (statusFilter === DRAFT_FILTER) {
        if (!draftIds.has(id)) return false;
      } else if (
        statusFilter !== "all" &&
        statusKind(infos[id]?.status) !== statusFilter
      ) {
        return false;
      }
      if (typeFilter === "volume" && infos[id]?.volumetric !== true) {
        return false;
      }
      if (typeFilter === "stack" && infos[id]?.volumetric !== false) {
        return false;
      }
      if (loadedFilter && !loadedIds.has(id)) {
        return false;
      }
      if (!q) return true;
      return `${id} ${infos[id]?.secondary ?? ""}`.toLowerCase().includes(q);
    });
  }, [
    ids,
    infos,
    query,
    statusFilter,
    typeFilter,
    loadedFilter,
    loadedIds,
    draftIds,
  ]);

  const chipCount = (key) =>
    key === "all" ? ids.length : counts[key] ?? 0;

  // Clicking the active type chip clears it (back to all types).
  const toggleTypeFilter = (type) =>
    setTypeFilter((current) => (current === type ? "all" : type));

  return (
    <div className="iec-queue">
      <div className="iec-queue__header">
        <h2>{idLabel} Queue</h2>
        {hasStatuses && (
          <span>
            {finished} of {ids.length} done
          </span>
        )}
      </div>
      <input
        className="iec-queue__search"
        type="search"
        placeholder={`Search ${idLabel} or series…`}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {(hasStatuses || draftCount > 0) && (
        <div className="iec-queue__chips">
          {STATUS_FILTERS.filter(
            ({ key }) => key === "all" || chipCount(key) > 0,
          ).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={`iec-queue__chip${statusFilter === key ? " active" : ""}`}
              onClick={() => setStatusFilter(key)}
            >
              {label} {chipCount(key)}
            </button>
          ))}
          {draftCount > 0 && (
            <button
              type="button"
              className={`iec-queue__chip iec-queue__chip--draft${statusFilter === DRAFT_FILTER ? " active" : ""}`}
              onClick={() => setStatusFilter(DRAFT_FILTER)}
            >
              <MaterialIcon icon="brush" className="iec-queue__chip-icon" />
              Active mask {draftCount}
            </button>
          )}
        </div>
      )}
      {(showTypeFilter || loadedCount > 0) && (
        <div className="iec-queue__chips">
          {showTypeFilter && (
            <>
              <button
                type="button"
                className={`iec-queue__chip iec-queue__chip--type${typeFilter === "volume" ? " active" : ""}`}
                onClick={() => toggleTypeFilter("volume")}
              >
                <MaterialIcon
                  icon="deployed_code"
                  className="iec-queue__chip-icon"
                />
                3D {typeCounts.volume}
              </button>
              <button
                type="button"
                className={`iec-queue__chip iec-queue__chip--type${typeFilter === "stack" ? " active" : ""}`}
                onClick={() => toggleTypeFilter("stack")}
              >
                <MaterialIcon icon="layers" className="iec-queue__chip-icon" />
                Stack {typeCounts.stack}
              </button>
            </>
          )}
          {loadedCount > 0 && (
            <button
              type="button"
              className={`iec-queue__chip iec-queue__chip--loaded${loadedFilter ? " active" : ""}`}
              onClick={() => setLoadedFilter((on) => !on)}
            >
              <MaterialIcon
                icon="check_circle"
                className="iec-queue__chip-icon"
              />
              Loaded {loadedCount}
            </button>
          )}
        </div>
      )}
      <div className="wrapper iec-queue__list">
        {visibleIds.map((id) => (
          <IecQueueRow
            key={id}
            kind={kind}
            id={id}
            info={infos[id]}
            selected={id === String(currentId)}
            hasDraft={showDrafts && draftIds.has(id)}
            loaded={loadedIds.has(id)}
            sizeLabel={sizeLabelFor(id)}
            disabled={loading}
            onSelect={onSelect}
          />
        ))}
        {visibleIds.length === 0 && (
          <div className="iec-queue__empty">No matches.</div>
        )}
      </div>
      {hasStatuses && (
        <div className="iec-queue__bar">
          <div
            style={{
              width: `${ids.length ? (finished / ids.length) * 100 : 0}%`,
            }}
          />
        </div>
      )}
      {hint && <div className="iec-queue__hint">{hint}</div>}
    </div>
  );
}

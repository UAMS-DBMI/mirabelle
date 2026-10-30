import React, {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
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
  getRowInfo,
  getSizeEstimatesVersion,
  peekRowInfo,
  statusKind,
  subscribeSizeEstimates,
} from "@/lib/iecExplorerData";
import { getMaskDraftIds, subscribeMaskDrafts } from "@/lib/maskDrafts";
import {
  getLoadedExamIds,
  getLoadedExamSizeBytes,
  pruneLoadedExams,
  subscribeLoadedExams,
} from "@/lib/loadedExams";
import CollapsiblePanel from "@/components/CollapsiblePanel";
import MaterialIcon from "@/components/MaterialIcon";

import "./IecExplorer.css";

// The synthetic filter key for "has an unsubmitted mask selection". Only the
// mask route ever populates drafts, so it's the only route that shows it.
const DRAFT_FILTER = "drafts";

// Rows beyond this are still listed and navigable, but not detail-enriched up
// front — a pathological VR with thousands of IECs shouldn't trigger
// thousands of background requests. Their details load when scrolled to.
const MAX_BACKGROUND_ENRICH = 400;

// The grid: two tiles a row, each a square thumbnail over a one-line caption.
// Only the rows in view (and a few either side) are rendered, so a VR with
// thousands of IECs scrolls as smoothly as one with ten.
const COLUMNS = 2;
const GAP_PX = 8;
// The caption line and the gap above it (see .iec-tile in IecExplorer.css).
const CAPTION_PX = 22;
const OVERSCAN_ROWS = 2;
// The list's inner width until it has been measured.
const DEFAULT_WIDTH_PX = 256;
// A tile asks for its thumbnail only once it has stayed on screen this long,
// so scrolling quickly past rows doesn't queue a download for each.
const THUMBNAIL_DELAY_MS = 150;

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "done", label: "Done" },
  { key: "skipped", label: "Skipped" },
];

// Compact byte size: MB for exams, GB once they get big. Decoded in-memory
// size, so it runs larger than the compressed DICOM on disk.
function formatCacheSize(bytes) {
  if (!bytes || bytes <= 0) return null;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb >= 10) return `${Math.round(mb)} MB`;
  return `${mb.toFixed(1)} MB`;
}

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

function typeIcon(volumetric) {
  return volumetric ? "deployed_code" : "layers";
}

const ExplorerTile = memo(function ExplorerTile({
  kind,
  id,
  info,
  selected,
  hasDraft,
  loaded,
  sizeLabel,
  onSelect,
}) {
  const [src, setSrc] = useState(() => getCachedThumbnail(kind, id));

  useEffect(() => {
    if (src || kind === "nifti") return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      getIecThumbnail(kind, id)
        .then((dataUrl) => {
          if (!cancelled && dataUrl) setSrc(dataUrl);
        })
        .catch(() => {
          // The data layer logs it; the tile keeps its placeholder.
        });
    }, THUMBNAIL_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [kind, id, src]);

  const status = statusKind(info?.status);
  return (
    <button
      type="button"
      className={`iec-tile${selected ? " is-selected" : ""}`}
      onClick={() => onSelect(id)}
      title={[id, info?.secondary].filter(Boolean).join(" · ")}
      aria-current={selected ? "true" : undefined}
    >
      <span className="iec-tile__image">
        {src ? (
          <img src={src} alt="" />
        ) : (
          <span
            className={`iec-tile__placeholder${
              kind === "nifti" ? "" : " is-loading"
            }`}
          >
            <MaterialIcon icon={info ? typeIcon(info.volumetric) : "image"} />
          </span>
        )}
        {status && (
          <span
            className={`iec-tile__status ${status}`}
            title={info.status || "Not yet reviewed"}
          />
        )}
        {(hasDraft || loaded) && (
          <span className="iec-tile__badges">
            {hasDraft && (
              <MaterialIcon
                icon="brush"
                className="iec-tile__draft"
                title="Has an unsubmitted mask selection"
              />
            )}
            {loaded && (
              <MaterialIcon
                icon="check_circle"
                className="iec-tile__loaded"
                title="Fully loaded — reopens instantly"
              />
            )}
          </span>
        )}
        <span className="iec-tile__label">
          <span className="iec-tile__id">{id}</span>
          {info?.count != null && (
            <span className="iec-tile__count">{info.count} img</span>
          )}
        </span>
      </span>
      <span className="iec-tile__caption">
        {info && (
          <MaterialIcon
            icon={typeIcon(info.volumetric)}
            className="iec-tile__type"
            title={info.volumetric ? "Volume (3D)" : "Stack (2D series)"}
          />
        )}
        <span className="iec-tile__series">{info?.secondary}</span>
        {sizeLabel && (
          <span
            className="iec-tile__size"
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
    </button>
  );
});

/**
 * A VR's exams as a searchable, filterable grid of thumbnails, in its own
 * collapsible card in the left column. Tiles enrich themselves (series, image
 * count, status) and lazy-load a middle-frame thumbnail; clicking one
 * navigates to that exam.
 *
 * kind selects the enrichment source: "dicom-review" | "mask" |
 * "mask-review" | "nifti" (see lib/iecExplorerData.js).
 */
export default function IecExplorer({
  kind,
  items,
  currentId,
  onSelect,
  idLabel = "IEC",
  hint,
}) {
  const ids = useMemo(() => (items ?? []).map(idOf).filter(Boolean), [items]);
  // Details fetched this session. Rows without any yet show the ones
  // remembered from earlier sessions (peekRowInfo).
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

  const infoFor = useCallback(
    (id) => infos[id] ?? peekRowInfo(kind, id),
    [infos, kind],
  );

  // Which rows have an unsubmitted mask selection. Only the mask route ever
  // records drafts, so elsewhere this stays empty and the marker/filter never
  // appear.
  const showDrafts = kind === "mask";
  const draftIds = useSyncExternalStore(
    subscribeMaskDrafts,
    getMaskDraftIds,
    getMaskDraftIds,
  );

  // Rows stay clickable while an exam loads: leaving one mid-load pauses its
  // download (lib/examDownloads), so the explorer navigates like
  // next/previous.
  const loading = useSelector((state) => state.options.loading);

  // Which exams are currently cached (reopen instantly). Re-check on every
  // navigation and load boundary — that's when the exam-LRU eviction fires —
  // so a flagged tile never lies about what's still in the cache.
  const loadedIds = useSyncExternalStore(
    subscribeLoadedExams,
    getLoadedExamIds,
    getLoadedExamIds,
  );
  useEffect(() => {
    pruneLoadedExams();
  }, [loading, currentId]);

  // Re-render as pre-load size estimates resolve (each lands when its
  // thumbnail — which downloads the metadata-bearing middle frame — comes in).
  // Only the subscription matters, so the value is unused.
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

  // Details arrive one request at a time; apply them at most once a frame
  // rather than re-rendering the explorer for each.
  const mountedRef = useRef(true);
  const pendingInfosRef = useRef(new Map());
  const infoFrameRef = useRef(0);
  const applyInfo = useCallback((id, info) => {
    if (!mountedRef.current) return;
    pendingInfosRef.current.set(id, info);
    if (infoFrameRef.current) return;
    infoFrameRef.current = requestAnimationFrame(() => {
      infoFrameRef.current = 0;
      const pending = pendingInfosRef.current;
      pendingInfosRef.current = new Map();
      setInfos((previous) => {
        let next = previous;
        pending.forEach((info, pendingId) => {
          if (next[pendingId] === info) return;
          if (next === previous) next = { ...previous };
          next[pendingId] = info;
        });
        return next;
      });
    });
  }, []);

  const requestInfo = useCallback(
    (id, options) => {
      getRowInfo(kind, id, options)
        .then((info) => applyInfo(id, info))
        .catch(() => {
          // The tile keeps what it shows; the data layer logs the failure
          // and evicts it for retry.
        });
    },
    [kind, applyInfo],
  );

  // Fill in rows in the background (cached and concurrency-limited in the
  // data layer, so navigation doesn't refetch). Rows on screen are hurried
  // ahead of these, below.
  useEffect(() => {
    if (ids.length > MAX_BACKGROUND_ENRICH) {
      console.warn(
        `[IecExplorer] enriching only the first ${MAX_BACKGROUND_ENRICH} of ${ids.length} rows up front`,
      );
    }
    ids.slice(0, MAX_BACKGROUND_ENRICH).forEach((id) => requestInfo(id));
  }, [ids, requestInfo]);

  // Navigating away from an exam usually means the curator just set its
  // status — refresh that one row past the cache so its dot/counters update.
  const previousIdRef = useRef(currentId);
  useEffect(() => {
    const previousId = previousIdRef.current;
    previousIdRef.current = currentId;
    if (!previousId || previousId === currentId || !ids.includes(previousId)) {
      return;
    }
    requestInfo(previousId, { fresh: true, urgent: true });
  }, [currentId, ids, requestInfo]);

  const counts = useMemo(() => {
    const result = { pending: 0, done: 0, skipped: 0, known: 0 };
    ids.forEach((id) => {
      const kindOfRow = statusKind(infoFor(id)?.status);
      if (!kindOfRow) return;
      result.known += 1;
      result[kindOfRow] += 1;
    });
    return result;
  }, [ids, infoFor]);

  // Statuses may be genuinely unavailable (nifti) — then the dots, status
  // filter and progress bar are omitted rather than showing everything as
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

  // Volume/stack tallies for the type toggles. Only known once a row's info
  // has enriched (volumetric is a boolean then, undefined before).
  const typeCounts = useMemo(() => {
    const result = { volume: 0, stack: 0 };
    ids.forEach((id) => {
      const volumetric = infoFor(id)?.volumetric;
      if (volumetric === true) result.volume += 1;
      else if (volumetric === false) result.stack += 1;
    });
    return result;
  }, [ids, infoFor]);
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
      const info = infoFor(id);
      if (statusFilter === DRAFT_FILTER) {
        if (!draftIds.has(id)) return false;
      } else if (
        statusFilter !== "all" &&
        statusKind(info?.status) !== statusFilter
      ) {
        return false;
      }
      if (typeFilter === "volume" && info?.volumetric !== true) {
        return false;
      }
      if (typeFilter === "stack" && info?.volumetric !== false) {
        return false;
      }
      if (loadedFilter && !loadedIds.has(id)) {
        return false;
      }
      if (!q) return true;
      return `${id} ${info?.secondary ?? ""}`.toLowerCase().includes(q);
    });
  }, [
    ids,
    infoFor,
    query,
    statusFilter,
    typeFilter,
    loadedFilter,
    loadedIds,
    draftIds,
  ]);

  // ————— The grid, rendered a window of rows at a time —————
  const listRef = useRef(null);
  const [listSize, setListSize] = useState({ width: 0, height: 0 });
  const [scrollTop, setScrollTop] = useState(0);
  const scrollFrameRef = useRef(0);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setListSize((previous) =>
        previous.width === width && previous.height === height
          ? previous
          : { width, height },
      );
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(infoFrameRef.current);
      cancelAnimationFrame(scrollFrameRef.current);
    };
  }, []);

  const handleScroll = () => {
    if (scrollFrameRef.current) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = 0;
      setScrollTop(listRef.current?.scrollTop ?? 0);
    });
  };

  // A folded card measures 0 wide; keep the last sensible layout.
  const listWidth = listSize.width || DEFAULT_WIDTH_PX;
  const tileWidth = (listWidth - GAP_PX * (COLUMNS - 1)) / COLUMNS;
  const rowHeight = tileWidth + CAPTION_PX + GAP_PX;
  const rowCount = Math.ceil(visibleIds.length / COLUMNS);
  const firstRow = Math.max(
    0,
    Math.floor(scrollTop / rowHeight) - OVERSCAN_ROWS,
  );
  // No tiles while the list has no height (folded, or not yet measured), so
  // hidden tiles don't download thumbnails.
  const lastRow =
    listSize.height > 0
      ? Math.min(
          rowCount,
          Math.ceil((scrollTop + listSize.height) / rowHeight) + OVERSCAN_ROWS,
        )
      : 0;
  const windowIds = useMemo(
    () => visibleIds.slice(firstRow * COLUMNS, lastRow * COLUMNS),
    [visibleIds, firstRow, lastRow],
  );

  // Rows on screen get their details first.
  useEffect(() => {
    windowIds.forEach((id) => requestInfo(id, { urgent: true }));
  }, [windowIds, requestInfo]);

  // Keep the open exam in view as the curator moves with the arrows/hotkeys,
  // and when an unfolded grid first shows. Not on every change, so searching
  // and filtering don't pull the grid back to it.
  const visibleIdsRef = useRef(visibleIds);
  visibleIdsRef.current = visibleIds;
  const listShown = listSize.height > 0;
  useEffect(() => {
    const list = listRef.current;
    const index = visibleIdsRef.current.indexOf(String(currentId));
    if (!list || index < 0) return;
    const top = Math.floor(index / COLUMNS) * rowHeight;
    const bottom = top + rowHeight - GAP_PX;
    if (top < list.scrollTop) {
      list.scrollTop = top;
    } else if (bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = bottom - list.clientHeight;
    }
  }, [currentId, rowHeight, listShown]);

  // The parent's handler is a new function every render; tiles get a stable
  // one so they only re-render when their own row changes.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const selectExam = useCallback((id) => onSelectRef.current(id), []);

  const chipCount = (key) => (key === "all" ? ids.length : (counts[key] ?? 0));

  // Clicking the active type toggle clears it (back to all types).
  const toggleTypeFilter = (type) =>
    setTypeFilter((current) => (current === type ? "all" : type));

  return (
    <CollapsiblePanel
      id="iec-explorer"
      panelKey="iec-explorer"
      className="iec-explorer"
      title={`${idLabel} Explorer`}
      headerExtra={
        hasStatuses ? `${finished}/${ids.length}` : String(ids.length)
      }
    >
      {hasStatuses && (
        <div
          className="iec-explorer__progress"
          title={`${finished} of ${ids.length} done`}
        >
          <div
            style={{
              width: `${ids.length ? (finished / ids.length) * 100 : 0}%`,
            }}
          />
        </div>
      )}
      <label className="iec-explorer__search">
        <MaterialIcon icon="search" className="iec-explorer__search-icon" />
        <input
          type="search"
          placeholder={`Search ${idLabel} or series…`}
          aria-label={`Search ${idLabel} or series`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {(hasStatuses || draftCount > 0) && (
        <div className="iec-explorer__segments" role="group">
          {STATUS_FILTERS.filter(
            ({ key }) => key === "all" || chipCount(key) > 0,
          ).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={`iec-explorer__segment${
                statusFilter === key ? " is-active" : ""
              }`}
              aria-pressed={statusFilter === key}
              onClick={() => setStatusFilter(key)}
            >
              {label}
              <span className="iec-explorer__segment-count">
                {chipCount(key)}
              </span>
            </button>
          ))}
          {draftCount > 0 && (
            <button
              type="button"
              className={`iec-explorer__segment iec-explorer__segment--draft${
                statusFilter === DRAFT_FILTER ? " is-active" : ""
              }`}
              aria-pressed={statusFilter === DRAFT_FILTER}
              title="Exams with an unsubmitted mask selection"
              onClick={() => setStatusFilter(DRAFT_FILTER)}
            >
              <MaterialIcon icon="brush" />
              <span className="iec-explorer__segment-count">{draftCount}</span>
            </button>
          )}
        </div>
      )}
      {(showTypeFilter || loadedCount > 0) && (
        <div className="iec-explorer__toggles">
          {showTypeFilter && (
            <>
              <button
                type="button"
                className={`iec-explorer__toggle${
                  typeFilter === "volume" ? " is-active" : ""
                }`}
                aria-pressed={typeFilter === "volume"}
                onClick={() => toggleTypeFilter("volume")}
              >
                <MaterialIcon icon="deployed_code" />
                3D {typeCounts.volume}
              </button>
              <button
                type="button"
                className={`iec-explorer__toggle${
                  typeFilter === "stack" ? " is-active" : ""
                }`}
                aria-pressed={typeFilter === "stack"}
                onClick={() => toggleTypeFilter("stack")}
              >
                <MaterialIcon icon="layers" />
                Stack {typeCounts.stack}
              </button>
            </>
          )}
          {loadedCount > 0 && (
            <button
              type="button"
              className={`iec-explorer__toggle iec-explorer__toggle--loaded${
                loadedFilter ? " is-active" : ""
              }`}
              aria-pressed={loadedFilter}
              title="Exams fully in the cache, which reopen instantly"
              onClick={() => setLoadedFilter((on) => !on)}
            >
              <MaterialIcon icon="check_circle" />
              Loaded {loadedCount}
            </button>
          )}
        </div>
      )}
      <div
        ref={listRef}
        className="wrapper iec-explorer__list"
        onScroll={handleScroll}
      >
        <div
          className="iec-explorer__spacer"
          style={{ height: rowCount * rowHeight }}
        >
          <div
            className="iec-explorer__grid"
            style={{
              transform: `translateY(${firstRow * rowHeight}px)`,
              gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))`,
              gridAutoRows: `${tileWidth + CAPTION_PX}px`,
              gap: `${GAP_PX}px`,
            }}
          >
            {windowIds.map((id) => (
              <ExplorerTile
                key={id}
                kind={kind}
                id={id}
                info={infoFor(id)}
                selected={id === String(currentId)}
                hasDraft={showDrafts && draftIds.has(id)}
                loaded={loadedIds.has(id)}
                sizeLabel={sizeLabelFor(id)}
                onSelect={selectExam}
              />
            ))}
          </div>
        </div>
        {visibleIds.length === 0 && (
          <div className="iec-explorer__empty">No matches.</div>
        )}
      </div>
      {hint && <div className="iec-explorer__hint">{hint}</div>}
    </CollapsiblePanel>
  );
}

import React, { useEffect, useMemo, useRef, useState } from "react";

import {
  getCachedThumbnail,
  getIecThumbnail,
  getQueueRowInfo,
  statusKind,
} from "@/lib/iecQueueData";

import "./IecQueue.css";

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

function IecQueueRow({ kind, id, info, selected, onSelect }) {
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
      title={info?.secondary || undefined}
    >
      <span className={`iec-queue__dot ${kindClass ?? "unknown"}`} />
      <IecQueueThumb kind={kind} id={id} />
      <span className="iec-queue__text">
        <span className="iec-queue__id">{id}</span>
        {info?.secondary && (
          <span className="iec-queue__secondary">{info.secondary}</span>
        )}
      </span>
      {info?.count != null && (
        <span className="iec-queue__count">{info.count} img</span>
      )}
    </button>
  );
}

/**
 * Scrollable, searchable queue of a VR's exams for the navigation panel.
 * Rows enrich themselves (series, image count, status) and lazy-load a
 * middle-frame thumbnail; clicking a row navigates to that exam.
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

  const visibleIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ids.filter((id) => {
      if (
        statusFilter !== "all" &&
        statusKind(infos[id]?.status) !== statusFilter
      ) {
        return false;
      }
      if (!q) return true;
      return `${id} ${infos[id]?.secondary ?? ""}`.toLowerCase().includes(q);
    });
  }, [ids, infos, query, statusFilter]);

  const chipCount = (key) =>
    key === "all" ? ids.length : counts[key] ?? 0;

  return (
    <div className="side-panel iec-queue">
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
      {hasStatuses && (
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

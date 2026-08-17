import React, { useMemo, useState } from "react";

import dcmjs from "dcmjs";

import useCurrentDataSet from "./useCurrentDataSet";

import "./QCDicomDump.css";

const { DicomMetaDictionary } = dcmjs.data;

const MAX_VALUE_LENGTH = 100;
const MAX_NUMERIC_VALUES = 16;
// Per-frame functional group sequences can carry one item per frame, so cap
// how deep we expand rather than rendering thousands of near-identical rows.
const MAX_SEQUENCE_ITEMS = 20;

// VRs whose values are bulk binary data — never worth rendering inline.
const BINARY_VRS = new Set(["OB", "OW", "OF", "OD", "OL", "OV", "UN"]);

// dicom-parser numeric VR accessors and their per-value byte widths.
const NUMERIC_READERS = {
  US: ["uint16", 2],
  SS: ["int16", 2],
  UL: ["uint32", 4],
  SL: ["int32", 4],
  FL: ["float", 4],
  FD: ["double", 8],
};

/** dicom-parser tags look like "x0008103e"; the dcmjs dictionary wants "(0008,103E)". */
function dictEntryFor(tag) {
  const group = tag.slice(1, 5).toUpperCase();
  const element = tag.slice(5, 9).toUpperCase();
  return DicomMetaDictionary.dictionary[`(${group},${element})`];
}

function formatTag(tag) {
  return `(${tag.slice(1, 5)},${tag.slice(5, 9)})`.toUpperCase();
}

function formatNumericValues(dataSet, element, reader, bytesPerValue) {
  const count = Math.floor(element.length / bytesPerValue);
  const values = [];
  for (let i = 0; i < count && i < MAX_NUMERIC_VALUES; i++) {
    values.push(dataSet[reader](element.tag, i));
  }
  if (count > MAX_NUMERIC_VALUES) {
    values.push("…");
  }
  return values.join("\\");
}

function formatValue(dataSet, element, vr) {
  if (element.items) {
    return `<sequence, ${element.items.length} item(s)>`;
  }
  if (element.fragments) {
    return "<encapsulated pixel data>";
  }
  if (BINARY_VRS.has(vr)) {
    return `<binary, ${element.length} bytes>`;
  }
  if (NUMERIC_READERS[vr]) {
    const [reader, bytesPerValue] = NUMERIC_READERS[vr];
    return formatNumericValues(dataSet, element, reader, bytesPerValue);
  }

  const str = dataSet.string(element.tag);
  if (str === undefined) {
    return "";
  }
  return str.length > MAX_VALUE_LENGTH
    ? `${str.slice(0, MAX_VALUE_LENGTH)}…`
    : str;
}

/** One item of a sequence: a label plus the rows its own dataSet produces. */
function buildItems(element, keyPrefix) {
  const items = [];
  const shown = Math.min(element.items.length, MAX_SEQUENCE_ITEMS);
  for (let i = 0; i < shown; i++) {
    const key = `${keyPrefix}/item${i}`;
    const itemDataSet = element.items[i].dataSet;
    items.push({
      key,
      label: `Item ${i + 1}`,
      rows: itemDataSet ? buildRows(itemDataSet, key) : [],
    });
  }
  const hidden = element.items.length - shown;
  if (hidden > 0) {
    items.push({
      key: `${keyPrefix}/more`,
      label: `… ${hidden} more item(s)`,
      rows: [],
    });
  }
  return items;
}

/**
 * Turn a dataSet into display rows. Sequence rows carry their items as a
 * nested `items` array rather than being flattened here, so the renderer can
 * decide which subtrees are currently disclosed.
 */
function buildRows(dataSet, keyPrefix = "") {
  return Object.values(dataSet.elements)
    .sort((a, b) => (a.tag < b.tag ? -1 : 1))
    .map((element) => {
      const dictEntry = dictEntryFor(element.tag);
      const vr = element.vr || dictEntry?.vr || "";
      const key = `${keyPrefix}/${element.tag}`;
      const row = {
        key,
        tag: formatTag(element.tag),
        name: dictEntry?.name || "(private / unknown)",
        vr,
        value: formatValue(dataSet, element, vr),
      };
      return element.items ? { ...row, items: buildItems(element, key) } : row;
    });
}

/** Bucket sorted top-level rows into groups: "(0008,....)" → "Group 0008". */
function buildGroups(rows) {
  const groups = [];
  let current = null;
  for (const row of rows) {
    const group = row.tag.slice(1, 5);
    if (!current || current.group !== group) {
      current = { group, rows: [] };
      groups.push(current);
    }
    current.rows.push(row);
  }
  return groups;
}

/** Every element row in the tree, including those inside sequences. */
function countTags(rows) {
  let count = 0;
  for (const row of rows) {
    count += 1;
    for (const item of row.items || []) {
      count += countTags(item.rows);
    }
  }
  return count;
}

/** Keys of every sequence row in the tree, for the expand/collapse-all control. */
function collectSequenceKeys(rows, keys = []) {
  for (const row of rows) {
    if (!row.items) {
      continue;
    }
    keys.push(row.key);
    for (const item of row.items) {
      collectSequenceKeys(item.rows, keys);
    }
  }
  return keys;
}

/**
 * Walk the row tree into the flat list to render, skipping the contents of
 * collapsed sequences. Depth drives indentation: an item label sits one step
 * under its sequence, and the item's elements one step under the label.
 */
function flattenVisible(rows, collapsed, depth = 0, out = []) {
  for (const row of rows) {
    out.push({ ...row, depth });
    if (!row.items || collapsed.has(row.key)) {
      continue;
    }
    for (const item of row.items) {
      out.push({
        key: item.key,
        kind: "item",
        label: item.label,
        depth: depth + 1,
      });
      flattenVisible(item.rows, collapsed, depth + 2, out);
    }
  }
  return out;
}

/**
 * Client-side DICOM dump of the currently displayed frame's file, grouped
 * by tag group with sticky group headers.
 *
 * Reads the dicom-parser dataSet that the wadouri image loader has already
 * fetched and cached for the stack viewport, so no extra server round-trip
 * is needed (unlike the old /papi/v1/dump/{file_id} endpoint).
 */
export default function QCDicomDump({ fileByUrl, frameIndex, frameCount }) {
  const { url, dataSet } = useCurrentDataSet();

  // Collapsed sequences, by row key. Keys are tag paths, so the disclosure
  // state survives cineing to another frame of the same series.
  const [collapsed, setCollapsed] = useState(() => new Set());

  const rows = useMemo(() => (dataSet ? buildRows(dataSet) : null), [dataSet]);
  const groups = useMemo(() => (rows ? buildGroups(rows) : null), [rows]);
  const sequenceKeys = useMemo(
    () => (rows ? collectSequenceKeys(rows) : []),
    [rows],
  );
  const visibleGroups = useMemo(
    () =>
      groups?.map(({ group, rows: groupRows }) => ({
        group,
        rows: flattenVisible(groupRows, collapsed),
      })),
    [groups, collapsed],
  );

  function toggleSequence(key) {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (!next.delete(key)) {
        next.add(key);
      }
      return next;
    });
  }

  const allCollapsed =
    sequenceKeys.length > 0 && sequenceKeys.every((key) => collapsed.has(key));

  function toggleAll() {
    setCollapsed(allCollapsed ? new Set() : new Set(sequenceKeys));
  }

  const tagCount = rows ? countTags(rows) : 0;
  const file = url ? fileByUrl?.[url] : null;
  const frameLabel =
    frameIndex >= 0 && frameCount ? `${frameIndex + 1} / ${frameCount}` : "—";

  return (
    <div id="qc-dicom-dump">
      <div className="qc-dump-header">
        <div className="qc-section-heading">
          DICOM Dump — Frame {frameLabel}
        </div>
        <div className="qc-dump-actions">
          <span className="qc-dump-meta">
            {file && `File ${file.file_id} · `}
            {rows ? `${tagCount} tags` : ""}
          </span>
          {sequenceKeys.length > 0 && (
            <button
              type="button"
              className="qc-dump-toggle-all"
              onClick={toggleAll}
            >
              {allCollapsed ? "Expand all" : "Collapse all"}
            </button>
          )}
        </div>
      </div>

      {visibleGroups ? (
        <div className="qc-dump-scroll">
          {visibleGroups.map(({ group, rows: groupRows }) => (
            <div key={group} className="qc-dump-group">
              <div className="qc-dump-group-header">Group {group}</div>
              {groupRows.map((row) =>
                row.kind === "item" ? (
                  <div
                    key={row.key}
                    className="qc-dump-item"
                    style={{ "--qc-dump-depth": row.depth }}
                  >
                    {row.label}
                  </div>
                ) : (
                  <div
                    key={row.key}
                    className="qc-dump-row"
                    style={{ "--qc-dump-depth": row.depth }}
                  >
                    <div className="qc-dump-tag">{row.tag}</div>
                    <div className="qc-dump-name">
                      {row.items ? (
                        <button
                          type="button"
                          className="qc-dump-disclosure"
                          aria-expanded={!collapsed.has(row.key)}
                          onClick={() => toggleSequence(row.key)}
                        >
                          <span className="qc-dump-caret" aria-hidden="true">
                            {collapsed.has(row.key) ? "▸" : "▾"}
                          </span>
                          {row.name}
                        </button>
                      ) : (
                        row.name
                      )}
                    </div>
                    <div className="qc-dump-vr">{row.vr}</div>
                    <div className="qc-dump-value">{row.value}</div>
                  </div>
                ),
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="qc-dump-empty">No image loaded yet.</div>
      )}
    </div>
  );
}

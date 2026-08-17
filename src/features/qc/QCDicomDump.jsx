import React, { useMemo } from "react";

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

/** Item delimiter rows ("Item 1") that head each sequence item's contents. */
function itemRow(key, depth, label) {
  return { key, depth, kind: "item", label };
}

/** Flatten a sequence's items into item headers followed by their elements. */
function sequenceRows(element, depth, keyPrefix) {
  const rows = [];
  const shown = Math.min(element.items.length, MAX_SEQUENCE_ITEMS);
  for (let i = 0; i < shown; i++) {
    const itemKey = `${keyPrefix}/item${i}`;
    rows.push(itemRow(itemKey, depth, `Item ${i + 1}`));
    const itemDataSet = element.items[i].dataSet;
    if (itemDataSet) {
      rows.push(...buildRows(itemDataSet, depth + 1, itemKey));
    }
  }
  const hidden = element.items.length - shown;
  if (hidden > 0) {
    rows.push(itemRow(`${keyPrefix}/more`, depth, `… ${hidden} more item(s)`));
  }
  return rows;
}

/**
 * Flatten a dataSet into display rows, descending into sequences. Nested rows
 * carry a depth so the renderer can indent them under their parent.
 */
function buildRows(dataSet, depth = 0, keyPrefix = "") {
  return Object.values(dataSet.elements)
    .sort((a, b) => (a.tag < b.tag ? -1 : 1))
    .flatMap((element) => {
      const dictEntry = dictEntryFor(element.tag);
      const vr = element.vr || dictEntry?.vr || "";
      const key = `${keyPrefix}/${element.tag}`;
      const row = {
        key,
        depth,
        tag: formatTag(element.tag),
        name: dictEntry?.name || "(private / unknown)",
        vr,
        value: formatValue(dataSet, element, vr),
      };
      return element.items
        ? [row, ...sequenceRows(element, depth + 1, key)]
        : [row];
    });
}

/**
 * Bucket sorted rows into their DICOM groups: "(0008,....)" → "Group 0008".
 * Only top-level rows open a group; nested sequence contents stay with the
 * sequence they belong to, whatever group their own tags are in.
 */
function buildGroups(rows) {
  const groups = [];
  let current = null;
  for (const row of rows) {
    if (row.depth === 0) {
      const group = row.tag.slice(1, 5);
      if (!current || current.group !== group) {
        current = { group, rows: [] };
        groups.push(current);
      }
    }
    current.rows.push(row);
  }
  return groups;
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

  const rows = useMemo(() => (dataSet ? buildRows(dataSet) : null), [dataSet]);
  const groups = useMemo(() => (rows ? buildGroups(rows) : null), [rows]);

  const tagCount = rows ? rows.filter((row) => row.kind !== "item").length : 0;
  const file = url ? fileByUrl?.[url] : null;
  const frameLabel =
    frameIndex >= 0 && frameCount ? `${frameIndex + 1} / ${frameCount}` : "—";

  return (
    <div id="qc-dicom-dump">
      <div className="qc-dump-header">
        <div className="qc-section-heading">
          DICOM Dump — Frame {frameLabel}
        </div>
        <div className="qc-dump-meta">
          {file && `File ${file.file_id} · `}
          {rows ? `${tagCount} tags` : ""}
        </div>
      </div>

      {groups ? (
        <div className="qc-dump-scroll">
          {groups.map(({ group, rows: groupRows }) => (
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
                    <div className="qc-dump-name">{row.name}</div>
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

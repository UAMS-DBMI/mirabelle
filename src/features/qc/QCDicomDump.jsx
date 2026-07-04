import React, { useMemo } from "react";

import dcmjs from "dcmjs";

import useCurrentDataSet from "./useCurrentDataSet";

import "./QCDicomDump.css";

const { DicomMetaDictionary } = dcmjs.data;

const MAX_VALUE_LENGTH = 100;
const MAX_NUMERIC_VALUES = 16;

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

function buildRows(dataSet) {
  return Object.values(dataSet.elements)
    .sort((a, b) => (a.tag < b.tag ? -1 : 1))
    .map((element) => {
      const dictEntry = dictEntryFor(element.tag);
      const vr = element.vr || dictEntry?.vr || "";
      return {
        tag: formatTag(element.tag),
        name: dictEntry?.name || "(private / unknown)",
        vr,
        value: formatValue(dataSet, element, vr),
      };
    });
}

/** Bucket sorted rows into their DICOM groups: "(0008,....)" → "Group 0008". */
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
          {rows ? `${rows.length} tags` : ""}
        </div>
      </div>

      {groups ? (
        <div className="qc-dump-scroll">
          {groups.map(({ group, rows: groupRows }) => (
            <div key={group} className="qc-dump-group">
              <div className="qc-dump-group-header">Group {group}</div>
              {groupRows.map((row) => (
                <div key={row.tag} className="qc-dump-row">
                  <div className="qc-dump-tag">{row.tag}</div>
                  <div className="qc-dump-name">{row.name}</div>
                  <div className="qc-dump-vr">{row.vr}</div>
                  <div className="qc-dump-value">{row.value}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="qc-dump-empty">No image loaded yet.</div>
      )}
    </div>
  );
}

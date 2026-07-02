import React, { useMemo } from "react";
import { useSelector } from "react-redux";

import { wadouri } from "@cornerstonejs/dicom-image-loader";
import dcmjs from "dcmjs";

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

/**
 * Client-side DICOM dump of the currently displayed frame's file.
 *
 * Reads the dicom-parser dataSet that the wadouri image loader has already
 * fetched and cached for the stack viewport, so no extra server round-trip
 * is needed (unlike the old /papi/v1/dump/{file_id} endpoint).
 */
export default function QCDicomDump({ fileByUrl }) {
  const currentImageId = useSelector((state) => state.options.currentImageId);

  const parsed = currentImageId ? wadouri.parseImageId(currentImageId) : null;
  const url = parsed?.url;

  const rows = useMemo(() => {
    if (!url) return null;
    const dataSet = wadouri.dataSetCacheManager.get(url);
    return dataSet ? buildRows(dataSet) : null;
  }, [url]);

  const file = url ? fileByUrl?.[url] : null;

  return (
    <div id="qc-dicom-dump" className="side-panel">
      <h2 id="title">DICOM Dump</h2>
      {rows ? (
        <>
          <p className="qc-dump-subtitle">
            {file && `File ${file.file_id}`}
            {parsed.frame !== undefined && ` · frame ${parsed.frame + 1}`}
          </p>
          <div className="qc-dump-scroll">
            <table>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.tag}>
                    <td className="qc-dump-tag">{row.tag}</td>
                    <td className="qc-dump-name">{row.name}</td>
                    <td className="qc-dump-vr">{row.vr}</td>
                    <td className="qc-dump-value">{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="qc-dump-subtitle">No image loaded yet.</p>
      )}
    </div>
  );
}

// Small display formatters for raw DICOM string values. All of them accept
// undefined and return a placeholder so the header renders cleanly while
// the first image is still loading.

const PLACEHOLDER = "—";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** PN "DOE^JANE^M" → "DOE, JANE M" */
export function formatPersonName(value) {
  if (!value) return PLACEHOLDER;
  const [family, ...rest] = value.split("^");
  const given = rest.filter(Boolean).join(" ");
  return given ? `${family}, ${given}` : family;
}

/** AS "058Y" → "58y"; months/weeks/days keep their unit ("003M" → "3m"). */
export function formatPatientAge(value) {
  if (!value) return PLACEHOLDER;
  const match = value.match(/^(\d+)([DWMY])$/i);
  if (!match) return value;
  const count = String(parseInt(match[1], 10));
  return `${count}${match[2].toLowerCase()}`;
}

/** DA "20260701" → "Jul 1, 2026" */
export function formatDicomDate(value) {
  if (!value || !/^\d{8}$/.test(value)) return PLACEHOLDER;
  const month = MONTHS[parseInt(value.slice(4, 6), 10) - 1];
  if (!month) return value;
  return `${month} ${parseInt(value.slice(6, 8), 10)}, ${value.slice(0, 4)}`;
}

/**
 * Patient/study/series display fields for the QC header and viewport
 * overlays, extracted from the currently displayed frame's dataSet.
 */
export function buildStudyInfo(dataSet) {
  if (!dataSet) return null;
  return {
    patientName: formatPersonName(dataSet.string("x00100010")),
    patientId: dataSet.string("x00100020") || PLACEHOLDER,
    patientSex: dataSet.string("x00100040") || PLACEHOLDER,
    patientAge: formatPatientAge(dataSet.string("x00101010")),
    studyDescription: dataSet.string("x00081030") || PLACEHOLDER,
    accession: dataSet.string("x00080050") || PLACEHOLDER,
    seriesDescription: dataSet.string("x0008103e") || PLACEHOLDER,
    modality: dataSet.string("x00080060") || "",
    studyDate: formatDicomDate(dataSet.string("x00080020")),
    instanceNumber: dataSet.string("x00200013") || PLACEHOLDER,
  };
}

# Plan: Connect the Mask VR & Mask Review VR Filter Panels to the New Masking Endpoints

**Status:** Ready to implement. The backend is done — nothing to change in oneposda.
**Goal:** The filter panels on `/mask/vr/...` and `/mask/review/vr/...` should use the two
new masking endpoints, mimicking how the DICOM review route already does it.

---

## 1. Background — how filtering works in this app today

Mirabelle is a React app. Every "VR" (Visual Review) route follows the same pattern,
established by the DICOM review route:

1. **Filter state lives in the URL.** e.g. `/mask/vr/42/*/All/All` means
   VR 42, no specific IEC yet (`*`), Masking Status = All, Image Type = All.
2. **A route container** (`src/routes/...`) reads those URL params and does two fetches:
   - a **values fetch** — asks the backend "what filter values exist in this VR?"
     to populate the dropdowns,
   - a **list fetch** — asks the backend for the list of IEC ids matching the
     current filters, then navigates to the first one.
3. **A shared component** [FilterPanel.jsx](../src/components/FilterPanel.jsx) renders
   the dropdowns. When you click **Filter**, it doesn't call the API itself — it just
   navigates to a new URL with the chosen values, which re-triggers step 2.

The mask routes already follow this pattern. The problem is *which endpoints* they call:

| What | Currently calls | Problem |
|---|---|---|
| Values (dropdown options) | `GET /papi/v1/visualreviews/{vr}/values` (the **DICOM** endpoint) | Not scoped to masking; returns no masking statuses |
| Filtered IEC list | `GET /papi/v1/masking/visualreview/{vr}?masking_status=...&dicom_file_type=...` | The backend GET route **ignores** those two query params — filtering silently does nothing |
| Masking Status dropdown | Hardcoded in FilterPanel (`Unreviewed/Accepted/...`) | These strings don't match real backend statuses (`created`, `rejected`, `process-complete`, ...) |

## 2. The new backend endpoints (already live)

Both are in the **oneposda** project, file
`posda/fastapi/app/papi/routes/masking.py`, and browsable in the live production
Swagger UI at
[http://tcia-posda-rh-1.ad.uams.edu/papi/docs](http://tcia-posda-rh-1.ad.uams.edu/papi/docs)
under "Functions for masking series". (The localhost oneposda is currently behind and
does not have these endpoints yet — pull/rebuild it before local end-to-end testing,
or verify against production.)

Both endpoints require a logged-in session (calling them without credentials returns
`{"detail": "Invalid authentication credentials"}`). Mirabelle's `requestJSON` sends
same-origin session cookies, so this just works once you're logged in — nothing to add.

### a) Values — `GET /papi/v1/masking/visualreview/{vr}/values`
(masking.py, `get_masking_values_for_vr`, ~line 506)

Returns every distinct value present in this VR (scoped to IECs flagged for masking),
with counts. Real response from production (VR 1336):

```json
{
  "dicom_file_types": [
    { "count": 20, "dicom_file_type": "CT Image Storage" },
    { "count": 15, "dicom_file_type": "MR Image Storage" },
    { "count": 8,  "dicom_file_type": "Positron Emission Tomography Image Storage" }
  ],
  "masking_statuses": [
    { "count": 41, "masking_status": "created" },
    { "count": 2,  "masking_status": "process-complete" }
  ]
}
```

Two things to notice:

- `dicom_file_type` values are **full SOP-class names** ("CT Image Storage"), not short
  codes ("CT"). They can be long — the dropdown just displays them as-is.
- Only values that actually occur in the VR are returned. The complete backend
  vocabulary for `masking_status` (from oneposda's `notes/masking-filter-notes.md`) is:
  `created`, `ready-to-process`, `in-process`, `process-complete`, `errored`,
  `accepted`, `rejected`, `skipped`, `nonmaskable` — but the dropdown should only ever
  contain what this endpoint returns, plus "All".
- Entries can have a `null` value — we skip those (same as the DICOM code does).

### b) Filter — `POST /papi/v1/masking/visualreview/{vr}/filter`
(masking.py, `get_masking_filtered_for_vr`, ~line 578)

JSON body, where `"*"` means "don't filter on this field" (and JSON `null` matches
rows whose value is SQL `NULL` — we don't use that from the UI):

```json
{ "masking_status": "*", "dicom_file_type": "CT Image Storage" }
```

Returns a plain ascending list of IEC ids, e.g. `[1117939, 1117940, 1117941, ...]`
(verified against production VR 1336).

**Agreed behavior change:** the old GET endpoint scoped the mask route to statuses
`created`/`rejected` and the mask-review route to `process-complete`. The new `/filter`
endpoint has no such scoping — with "All" selected, **both routes now show IECs of every
masking status**, and the user narrows via the Masking Status dropdown. Both routes
therefore call the *same* endpoint and become identical at the fetch layer.

## 3. Changes — 7 files, all in Mirabelle

### Step 1 — `src/utilities.js`: point the API helpers at the new endpoints

This file holds all the small `fetch` wrappers (via `requestJSON` from `src/lib/http.js`).

**1a. Add a values helper** (next to `getValuesForDicomVR`, ~line 283):

```js
export async function getValuesForMaskVR(visual_review_id) {
  return requestJSON(`/papi/v1/masking/visualreview/${visual_review_id}/values`);
}
```

**1b. Rewrite `getFilteredIECsForMaskVR`** (~line 295) to POST, mimicking
`getFilteredIECsForDicomVR` (~line 244) including its `'All'/''/'undefined' → '*'`
mapping (stale URLs can contain the literal string `"undefined"`):

```js
export async function getFilteredIECsForMaskVR(
  visual_review_id,
  masking_status = "*",
  dicom_file_type = "*",
) {
  const mapAllToStar = (v) =>
    v == null || v === "" || v === "All" || v === "undefined" ? "*" : v;

  const payload = {
    masking_status: mapAllToStar(masking_status),
    dicom_file_type: mapAllToStar(dicom_file_type),
  };

  return requestJSON(
    `/papi/v1/masking/visualreview/${visual_review_id}/filter`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    },
    { errorMessage: messages.filters.loadFailed },
  );
}
```

Note: no `.toLowerCase()` anymore — the dropdown now contains exact backend values
(Step 3), so we pass them through untouched.

**1c. Rewrite `getFilteredIECsForMaskReviewVR`** (~line 323) as a one-line delegate,
since the awaiting-review distinction no longer exists at the fetch layer (keep the
name so call sites don't change):

```js
export async function getFilteredIECsForMaskReviewVR(
  visual_review_id,
  masking_status = "*",
  dicom_file_type = "*",
) {
  return getFilteredIECsForMaskVR(visual_review_id, masking_status, dicom_file_type);
}
```

**1d. Delete `getIECsForMaskVR` (~line 287) and `getIECsForMaskReviewVR` (~line 315).**
They hit the old GET endpoint and have no callers left (verified by grep).

### Step 2 — Route containers: fetch masking values, build both dropdowns

Files: [RouteMaskVR.jsx](../src/routes/mask/RouteMaskVR.jsx) and
[RouteMaskReviewVR.jsx](../src/routes/mask-review/RouteMaskReviewVR.jsx)
(identical change in each).

1. In the import from `@/utilities`, replace `getValuesForDicomVR` with `getValuesForMaskVR`.
2. Add a second piece of state next to `dicomTypeOptions`:
   ```js
   const [maskingStatusOptions, setMaskingStatusOptions] = useState(["All"]);
   ```
3. In the existing values `useEffect` (~line 31), call `getValuesForMaskVR(vr)` and set
   **both** option lists from the response (same dedupe/skip-null idiom already there):
   ```js
   getValuesForMaskVR(vr)
     .then((values) => {
       if (!mounted) return;
       const types = Array.from(new Set(
         (values?.dicom_file_types || [])
           .map((it) => it?.dicom_file_type)
           .filter(Boolean),
       ));
       setDicomTypeOptions(["All", ...types]);
       const statuses = Array.from(new Set(
         (values?.masking_statuses || [])
           .map((it) => it?.masking_status)
           .filter(Boolean),
       ));
       setMaskingStatusOptions(["All", ...statuses]);
     })
     .catch(() => {
       setDicomTypeOptions(["All"]);
       setMaskingStatusOptions(["All"]);
     });
   ```
4. Pass the new prop down: `maskingStatusOptions={maskingStatusOptions}` on
   `<MaskVR ...>` / `<MaskReviewVR ...>`.

Nothing else in these files changes — the list-fetch effect already calls
`getFilteredIECsForMask(Review)VR(vr, maskingStatus, dicomType)`, which Step 1 repointed.

### Step 3 — Thread the new prop down to FilterPanel

These are pure pass-throughs, exactly how `dicomTypeOptions` already flows:

- [MaskVR.jsx](../src/features/mask/MaskVR.jsx): accept `maskingStatusOptions` prop
  (~line 15) and forward it to `<MaskIEC>` (~line 43).
- [MaskReviewVR.jsx](../src/features/mask-review/MaskReviewVR.jsx): same (~lines 15, 45).
- [MaskIEC.jsx](../src/features/mask/MaskIEC.jsx): accept the prop (~line 92-101) and
  forward it to **both** `<FilterPanel>` render sites (~lines 545 and 637).
- [MaskReviewIEC.jsx](../src/features/mask-review/MaskReviewIEC.jsx): same
  (prop ~line 80-89; FilterPanel sites ~lines 336 and 423).

### Step 4 — `src/components/FilterPanel.jsx`: dynamic Masking Status options

Mimic the existing dynamic `dicomType` select (~lines 298–314):

1. Accept a new prop with a safe default so the panel still works on any route that
   doesn't pass it:
   ```js
   maskingStatusOptions = ["All"],
   ```
2. Replace the hardcoded `<option>` list inside the Masking Status select
   (~lines 253–258) with:
   ```jsx
   {maskingStatusOptions.map((opt) => (
     <option key={opt} value={opt}>
       {opt}
     </option>
   ))}
   ```

No change to `handleFilter` — `maskingStatus` is already included in the payload, and
`handleFilterAction` in MaskIEC/MaskReviewIEC already puts it in the URL.

## 4. What deliberately does NOT change

- **URL scheme** (`/mask/vr/:vr/:iec/:maskingStatus/:dicomType`) — untouched.
- **Redux** — field visibility (`setMaskerConfig`/`setMaskerReviewConfig`) already shows
  `maskingStatus` + `dicomType`; nothing to add.
- **DICOM & NIfTI routes** — untouched (FilterPanel's new prop defaults to `["All"]`).
- **FilterPanel's internal `getValuesForDicomVR` fallback** (~line 94) — only runs when
  no `dicomTypeOptions` prop is passed; mask routes always pass it, so leave as is.
- **Backend** — no changes to masking.py.
- **URL encoding** — values like `CT Image Storage` (spaces) end up in the URL as the
  `:dicomType` param. The DICOM review route already round-trips these exact strings
  through its URLs today (react-router encodes/decodes them), so nothing extra is needed.

## 5. How to verify (manual, in the browser)

**Backend prerequisite:** the local oneposda stack is behind and lacks the new
endpoints. Either update it first (pull latest oneposda, then `./manage restart posda-api`),
or point Mirabelle's dev proxy at the production API and verify there. Quick check that
your backend is current: open `<backend>/papi/v1/masking/visualreview/1336/values` in a
logged-in browser tab — production returns the JSON shown in §2a; a stale backend 404s.

1. Start the Mirabelle dev server and log in.
2. Open a mask VR route with known data, e.g. `/mask/vr/1336` (production VR 1336 has
   20 CT / 15 MR / 8 PET IECs, statuses `created` ×41 and `process-complete` ×2).
3. **Dropdowns:** the Masking Status select should list exactly the statuses returned by
   the endpoint (`created`, `process-complete`) plus "All" — not the old hardcoded list.
   Image Type should list the full names (`CT Image Storage`, ...). In DevTools → Network,
   confirm one `GET .../masking/visualreview/<vr>/values` request.
4. **Filtering:** pick a status, click Filter. Confirm a
   `POST .../masking/visualreview/<vr>/filter` request with body
   `{"masking_status":"created","dicom_file_type":"*"}` returning an ascending id list,
   and that the URL updates (status appears in the path) and the viewer loads the first IEC.
5. Filter by `dicom_file_type` = `MR Image Storage` too — confirms values with spaces
   survive the URL round-trip.
6. Pick a combination with no matches → "no results" toast, no crash.
7. Repeat 3–6 on the mask-review route (`/mask/review/vr/1336`). With "All" selected it
   now shows IECs of every status (the agreed behavior change), e.g. 43 IECs on VR 1336
   rather than only the 2 awaiting review.
8. Sanity-check the DICOM review route still filters (its endpoints are untouched).

# Plan: Backend support for the Mask VR / Mask Review VR filters

**Audience:** papi (Posda FastAPI) developers, plus one small mirabelle follow-up.

## Summary

The Mask VR and Mask Review VR pages in mirabelle now show a filter panel with
**Masking Status** and **Image Type** dropdowns. The UI is merged and already sends
filter parameters — but the backend ignores them, so the filters do nothing yet.

The fix is deliberately small:

1. **Backend:** extend the existing masking list endpoint
   (`GET /papi/v1/masking/visualreview/{vr}`) with two optional query params,
   `masking_status` and `dicom_file_type`. No new endpoints, no schema change,
   fully backward compatible.
2. **Frontend (separate small PR):** give each route its own status dropdown option
   list, because the two routes need different primary filters (see below).

## Background

The mirabelle routes involved:

- Mask VR: `/mask/vr/:vr/:iec/:maskingStatus/:dicomType`
- Mask Review VR: `/mask/review/vr/:vr/:iec/:maskingStatus/:dicomType`

Both mirror the filter panel of the DICOM Review VR route. The frontend work landed in
mirabelle commits `17bbdd3` (Mask VR) and `c6dc744` (Mask Review VR) — both titled
"…(Next: Connect it to an endpoint)".

The DICOM Review VR route is the working reference. It uses three endpoints:

| Purpose | Endpoint |
|---|---|
| Unfiltered IEC list | `GET /papi/v1/visualreviews/{vr}/iecs` |
| Filtered IEC list | `POST /papi/v1/visualreviews/{vr}/filter` (body: `review_status`, `dicom_file_type`, `processing_status`; `"*"` = wildcard, `null` = unreviewed) |
| Filter dropdown values | `GET /papi/v1/visualreviews/{vr}/values` (returns e.g. `{ dicom_file_types: [{dicom_file_type: "..."}] }`) |

The masking routes take a lighter approach:

- Instead of a new POST filter route, the **existing** masking list endpoint gains
  query params.
- Mask VRs live in the same `visual_review_instance_id` space as DICOM VRs, so the
  Image Type dropdown reuses `GET /visualreviews/{vr}/values` as-is — **no new values
  endpoint is needed.**

## Why the two routes need different filters

Every IEC moves through a masking lifecycle (`masking_status_type` enum):

```
                    masker submits           worker            worker
         created ──────────────────► ready-to-process ──► in-process ──► process-complete
            │                                                   │              │
            │ masker: skip / nonmaskable                        └─► errored    │ reviewer
            ▼                                                                  ▼
        skipped / nonmaskable                                        accepted / rejected
```

Both routes list IECs from the same `masking` table, but they sit at different points
in this lifecycle and serve different people:

### Mask VR — the masker's worklist

- **Who / what:** a curator drawing masks. Their to-do state is **`created`** —
  flagged for masking, no mask drawn yet. (Confirmed in Posda: the
  `…/visualreview/{vr}/next` handler selects `masking_status = 'created'`, and
  submitting mask parameters moves the IEC to `ready-to-process`.)
- **Actions from this route:** submit mask (→ `ready-to-process`), Skip (→ `skipped`),
  Non-maskable (→ `nonmaskable`).
- **Filter needs:** the primary lens is **"Unmasked" = `created`** ("what still needs
  a mask drawn"). Also useful: `rejected` (bounced by a reviewer, needs re-work — the
  Posda source explicitly anticipates rejected/errored returning to the masker's
  queue), and the masker's own dispositions (`skipped`, `nonmaskable`) to revisit them.
- **Dropdown options:** All, **Unmasked**, Awaiting review, Accepted, Rejected,
  Skipped, Nonmaskable.

### Mask Review VR — the reviewer's worklist

- **Who / what:** a curator reviewing finished masks. Their to-do state is
  **`process-complete`** — the pipeline produced output, no verdict yet. This is
  exactly what the existing `awaiting_review=true` param selects.
- **Actions from this route:** Accept (→ `accepted`), Reject (→ `rejected`), plus
  Skip / Non-maskable.
- **Filter needs:** the primary lens is **"Unreviewed" = `process-complete`** ("what
  awaits my verdict"). Also useful: `accepted` / `rejected` to revisit past verdicts,
  and `skipped` / `nonmaskable` to audit masker dispositions. "Unmasked" (`created`)
  is *not* useful here — those IECs have no mask to review.
- **Dropdown options:** All (= awaiting review, today's default), **Unreviewed**,
  Accepted, Rejected, Skipped, Nonmaskable.

**The key requirement:** *Unmasked* (`created`, Mask VR's to-do) and *Unreviewed*
(`process-complete`, Mask Review VR's to-do) are **different states and must be
independently filterable**. The endpoint accepts both values regardless of which route
calls it; each route simply defaults its dropdown to its own lens.

## The contract the frontend already sends

From mirabelle `src/utilities.js` (`getFilteredIECsForMaskVR`,
`getFilteredIECsForMaskReviewVR`). Params are only present when the dropdown is not
"All"; the UI label is lowercased into the param value:

```
# Mask VR ("All"/"All" — today's behavior, must keep working)
GET /papi/v1/masking/visualreview/{vr}

# Mask VR with filters
GET /papi/v1/masking/visualreview/{vr}?masking_status=unmasked
GET /papi/v1/masking/visualreview/{vr}?masking_status=rejected&dicom_file_type=MR

# Mask Review VR (always sends awaiting_review=true)
GET /papi/v1/masking/visualreview/{vr}?awaiting_review=true
GET /papi/v1/masking/visualreview/{vr}?awaiting_review=true&masking_status=unreviewed
GET /papi/v1/masking/visualreview/{vr}?awaiting_review=true&masking_status=accepted
GET /papi/v1/masking/visualreview/{vr}?awaiting_review=true&dicom_file_type=CT
```

Contract details:

- `masking_status` values: `unmasked`, `unreviewed`, `accepted`, `rejected`,
  `skipped`, `nonmaskable`. (Note: the currently-merged UI shows "Unreviewed" on both
  routes and never sends `unmasked` — the frontend companion change below fixes the
  Mask VR dropdown. The backend should accept the full vocabulary from day one.)
- `dicom_file_type` is sent **verbatim** as chosen from the dropdown, whose options
  come from `GET /visualreviews/{vr}/values` → `dicom_file_types[].dicom_file_type`.
  Filtering must use the same source column so values match exactly.
- **Response shape must stay a bare JSON array of integer IEC ids** (e.g.
  `[123, 456]`). The frontend does `iecList.indexOf(parseInt(iec))` for next/previous
  navigation.

## Backend work

Extend `get_for_visualreview()` in `posda/fastapi/app/papi/routes/masking.py`
(handler for `GET /v1/masking/visualreview/{visual_review_instance_id}`). Today it
accepts only `awaiting_review: bool = False` and returns bare IEC ids.

```python
@router.get("/visualreview/{visual_review_instance_id}")
async def get_for_visualreview(
    visual_review_instance_id: int,
    awaiting_review: bool = False,
    masking_status: Optional[MaskingStatusFilter] = None,  # str Enum -> free 422 on bad input
    dicom_file_type: Optional[str] = None,
    db: Database = Depends(),
    current_user: User = logged_in_user,
):
```

### Filter vocabulary → DB mapping

DB enum `masking_status_type`: `created`, `ready-to-process`, `in-process`,
`process-complete`, `accepted`, `rejected`, `errored`, `nonmaskable`, `skipped`.

| `masking_status` param | Matches DB `masking_status` | Primary route |
|---|---|---|
| `unmasked` | `created` | Mask VR ("needs a mask drawn") |
| `unreviewed` | `process-complete` | Mask Review VR ("awaits a verdict") |
| `accepted` | `accepted` | both |
| `rejected` | `rejected` | both |
| `skipped` | `skipped` | both |
| `nonmaskable` | `nonmaskable` | both |

Not addressable by name: `ready-to-process`, `in-process`, `errored` (in-flight
pipeline states). They appear under "All" only. See open decision #1 if we want them
filterable.

### Semantics

1. **Precedence: explicit `masking_status` overrides `awaiting_review`.**
   Mask Review VR *always* sends `awaiting_review=true` (its default lens =
   `process-complete`). If the reviewer filters by `accepted`, a naive AND of both
   conditions (`process-complete AND accepted`) is always empty. So: when
   `masking_status` is present, ignore `awaiting_review`; when absent, keep today's
   `awaiting_review` behavior unchanged. (`awaiting_review=true&masking_status=unreviewed`
   is naturally consistent — both mean `process-complete`.)

2. **Image type.** `dicom_file_type` filters on `dicom_file.dicom_file_type` for the
   IEC's files — use the same join/expression the DICOM VR `/filter` endpoint uses so
   dropdown values and filter matching agree. An IEC matches if any of its files match
   (`select distinct`); unknown values are not an error — they return `[]`. Combines
   with the status filter as an intersection.

3. **Deterministic ordering.** Add `order by image_equivalence_class_id`. The frontend
   walks the array for next/previous; the current query has no `ORDER BY`, so
   navigation order is technically unstable. Cheap fix, do it while here.

4. **Back-compat.** No params → identical to today. `awaiting_review=true` alone →
   identical to today. Response shape unchanged. Additive, non-breaking API change;
   no DB schema change.

### Query sketch

```sql
select distinct image_equivalence_class_id
from image_equivalence_class
  natural join masking
  natural join file_import          -- only needed when dicom_file_type is set
  natural join dicom_file           -- (same joins as the /{iec}/reviewfiles query)
where visual_review_instance_id = $1
  and (
        -- masking_status given: it wins
        ($2::text is not null and masking_status = (case $2
            when 'unmasked'   then 'created'
            when 'unreviewed' then 'process-complete'
            else $2
        end)::masking_status_type)
        -- masking_status absent: legacy awaiting_review behavior
        or ($2::text is null and ($3 = false or masking_status = 'process-complete'))
      )
  and ($4::text is null or dicom_file_type = $4)
order by image_equivalence_class_id
```

(Build it in two variants or with conditional joins if the unconditional
`file_import`/`dicom_file` join changes row multiplicity — the `distinct` guards the
result, but check the query plan on a large VR.)

## Frontend companion change (mirabelle)

Small, separate PR. The FilterPanel currently hardcodes one Masking Status option list
("Unreviewed, Accepted, …") used by both routes; per the analysis above the two routes
need different lists:

- Add per-route option lists (e.g. a `maskingStatusOptions` field on `filterConfig`,
  set in `setMaskerConfig` / `setMaskerReviewConfig` in
  `src/features/presentationSlice.js`, consumed by `src/components/FilterPanel.jsx`):
  - Mask VR: All, **Unmasked**, Awaiting review, Accepted, Rejected, Skipped,
    Nonmaskable
  - Mask Review VR: All, **Unreviewed**, Accepted, Rejected, Skipped, Nonmaskable
- No `utilities.js` change needed for `unmasked`: the fetch helpers lowercase the
  label, so "Unmasked" → `masking_status=unmasked` automatically. If we adopt an
  "Awaiting review" label for Mask VR, map that label → `unreviewed` explicitly
  (naive lowercasing would produce `awaiting review`).
- The URL already carries the label (`/:maskingStatus/`), so deep links keep working.

## Testing

Backend (adapt to papi's existing test setup, or curl against a dev instance):

Shared / regression:
- [ ] No params → same list as before the change.
- [ ] `?awaiting_review=true` → only `process-complete` (unchanged).
- [ ] `?masking_status=bogus` → 422.
- [ ] Response is a flat array of ints, ascending.

Mask VR lens:
- [ ] `?masking_status=unmasked` → only `created` IECs; excludes `ready-to-process` /
      `in-process` / `process-complete` / dispositions.
- [ ] `?masking_status=rejected` → only rejected IECs (masker re-work queue).
- [ ] `?masking_status=unmasked&dicom_file_type=<value from /values>` → intersection.

Mask Review VR lens:
- [ ] `?awaiting_review=true&masking_status=unreviewed` → same set as
      `?awaiting_review=true`.
- [ ] `?awaiting_review=true&masking_status=accepted` → accepted (status wins, not `[]`).
- [ ] `?awaiting_review=true&masking_status=unmasked` → `created` IECs (status wins;
      frontend won't offer this, but the endpoint stays route-agnostic).

End-to-end with Mirabelle (`make serve` with `MIRA_API_TARGET` pointed at the dev
backend, or the `live-test/` nginx harness):

- [ ] `/mira/mask/vr/{vr}/*` — "Unmasked" shows only not-yet-masked IECs; masking one
      and re-filtering removes it from the list; next/prev walk only matches.
- [ ] `/mira/mask/review/vr/{vr}/*` — default view still shows awaiting-review IECs;
      "Accepted" shows past accepts; accepting an IEC and re-filtering "Unreviewed"
      removes it.
- [ ] A filter combination with no matches shows the "no results" toast, not an error.

## Out of scope / optional follow-ups

- **Masking-scoped `/values`.** The dropdown reuses the whole-VR values endpoint, so
  it can offer types that exist in the VR but not among masking-flagged IECs
  (filtering then returns an empty list — handled gracefully). If that bothers users,
  add a masking-aware values endpoint later.
- **POST `/masking/visualreview/{vr}/filter` symmetry with the DICOM route.**
  Possible, but the merged frontend uses GET query params; choosing POST instead means
  also updating `getFilteredIECsForMaskVR` / `getFilteredIECsForMaskReviewVR` in
  mirabelle's `src/utilities.js`. Not recommended unless we want strict symmetry.

## Open decisions

1. Should the in-flight states be filterable — e.g. `in-progress`
   (`ready-to-process` + `in-process`) and `errored`? `errored` is the likelier want
   (Posda's own source notes errored/rejected may need to re-enter the masker queue).
   Cheap to add to the enum + mapping; needs a dropdown entry to be reachable.
2. Confirm the precedence rule (explicit `masking_status` beats `awaiting_review`) —
   required for the Mask Review VR status filter to be useful at all.

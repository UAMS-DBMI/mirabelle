# Plan: Backend support for the Mask VR / Mask Review VR filters

**Audience:** papi (Posda FastAPI) developers, plus one small mirabelle follow-up.

---

## TL;DR

The Mask VR and Mask Review VR pages in mirabelle have a filter panel (**Masking
Status** + **Image Type**). The UI is merged and already sends filter query params —
but the backend ignores them, so filtering currently does nothing.

The fix is deliberately small:

| # | Where | What |
|---|---|---|
| 1 | **papi** | Teach the existing `GET /papi/v1/masking/visualreview/{vr}` endpoint two optional query params: `masking_status` and `dicom_file_type`. No new endpoints, no DB schema change, fully backward compatible. |
| 2 | **mirabelle** (separate small PR) | Give each route its own Masking Status dropdown list — the two routes need different primary filters (see below). |

The one subtle requirement: **when `masking_status` is present it must override
`awaiting_review`** — otherwise the Mask Review VR filter can never return anything
(details under [Semantics](#semantics)).

---

## How the feature works end to end

Understanding the flow makes the rest of the document obvious:

```
User picks a filter and clicks "Filter"
        │
        ▼
FilterPanel calls onAction → the route navigates to a URL that CARRIES THE LABELS:
        /mask/vr/{vr}/*/Rejected/MR          (IEC becomes "*" = "pick first match")
        │
        ▼
The route component reads :maskingStatus/:dicomType from the URL and calls the
fetch helper, which lowercases the status label into a query param:
        GET /papi/v1/masking/visualreview/{vr}?masking_status=rejected&dicom_file_type=MR
        │
        ▼
Backend returns a bare JSON array of IEC ids: [123, 456, ...]
        │
        ▼
The route loads the first IEC and uses the array for next/previous navigation.
```

Because the URL carries the filter labels, deep links and refreshes keep working with
no extra effort. This flow is already fully implemented on the frontend — **only the
backend step in the middle is missing.**

Verified in mirabelle source:

- Routes: `src/index.js` (`mask/vr/:vr/:iec/:maskingStatus/:dicomType`,
  `mask/review/vr/:vr/:iec/:maskingStatus/:dicomType`)
- Fetch helpers: `src/utilities.js` — `getFilteredIECsForMaskVR` (line 284),
  `getFilteredIECsForMaskReviewVR` (line 312)
- Navigation on filter: `handleFilterAction` in `src/features/mask/MaskIEC.jsx:345`
  (and the mask-review equivalent)
- Next/previous walks the array: `src/routes/mask/RouteMaskVR.jsx:84-88`
  (`parseInt(iec)` + `iecList.indexOf(...)`)
- Frontend work landed in commits `17bbdd3` (Mask VR) and `c6dc744` (Mask Review VR).

---

## Background: why extend the existing endpoint

The DICOM Review VR route is the working reference. It uses three endpoints:

| Purpose | Endpoint |
|---|---|
| Unfiltered IEC list | `GET /papi/v1/visualreviews/{vr}/iecs` |
| Filtered IEC list | `POST /papi/v1/visualreviews/{vr}/filter` (body: `review_status`, `dicom_file_type`, `processing_status`; `"*"` = wildcard, `null` = unreviewed) |
| Filter dropdown values | `GET /papi/v1/visualreviews/{vr}/values` (returns e.g. `{ dicom_file_types: [{dicom_file_type: "..."}] }`) |

The masking routes take a lighter approach, and the merged frontend already commits
to it:

- Instead of a new POST filter route, the **existing** masking list endpoint gains
  optional query params.
- Mask VRs live in the same `visual_review_instance_id` space as DICOM VRs, so both
  mask routes already reuse `GET /visualreviews/{vr}/values` to populate the Image
  Type dropdown (`getValuesForDicomVR` in both route components). **No new values
  endpoint is needed.**

---

## Why the two routes need different filters

Every IEC moves through a masking lifecycle (`masking_status_type` DB enum):

```
                    masker submits           worker            worker
         created ──────────────────► ready-to-process ──► in-process ──► process-complete
            │                                                   │              │
            │ masker: skip / nonmaskable                        └─► errored    │ reviewer
            ▼                                                                  ▼
        skipped / nonmaskable                                        accepted / rejected
```

Both routes list IECs from the same `masking` table, but they sit at different points
in this lifecycle and serve different tasks:

| | **Mask VR** (masker's worklist) | **Mask Review VR** (reviewer's worklist) |
|---|---|---|
| Task | Draw masks | Review finished masks |
| To-do state | `created` — flagged, no mask yet | `process-complete` — output ready, no verdict |
| UI name for to-do | **"Unmasked"** | **"Unreviewed"** |
| Actions | submit (→ `ready-to-process`), Skip, Non-maskable | Accept, Reject, Skip, Non-maskable |
| Today's default fetch | no params (all masking rows) | `awaiting_review=true` (= `process-complete`) |
| Other useful filters | `rejected` (re-work queue), own dispositions | `accepted`/`rejected` (past verdicts), dispositions |
| Dropdown should offer | All, **Unmasked**, Awaiting review, Accepted, Rejected, Skipped, Nonmaskable | All, **Unreviewed**, Accepted, Rejected, Skipped, Nonmaskable |

Supporting detail from the Posda source: the masker's `…/visualreview/{vr}/next`
handler selects `masking_status = 'created'`, submitting mask parameters moves the IEC
to `ready-to-process`, and comments anticipate `rejected`/`errored` re-entering the
masker's queue. "Unmasked" is useless on the review route (nothing to review yet), and
"Unreviewed" ≠ "Unmasked".

**The key requirement:** *Unmasked* (`created`) and *Unreviewed* (`process-complete`)
are **different states and must be independently filterable**. The endpoint accepts
the full vocabulary regardless of which route calls it; each route merely defaults its
dropdown to its own lens.

---

## The contract the frontend already sends

From `src/utilities.js`. Params are only added when the dropdown is not "All"; the UI
label is lowercased into the param value (`masking_status.toLowerCase()`);
`dicom_file_type` is sent verbatim:

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

Three contract rules the backend must honor:

1. **`masking_status` vocabulary:** `unmasked`, `unreviewed`, `accepted`, `rejected`,
   `skipped`, `nonmaskable`. (The currently-merged UI shows "Unreviewed" on both
   routes and never sends `unmasked` — the frontend companion change below fixes the
   Mask VR dropdown. Accept the full vocabulary from day one so the two PRs don't
   have to land in lockstep.)
2. **`dicom_file_type` matches the values endpoint.** The dropdown options come from
   `GET /visualreviews/{vr}/values` → `dicom_file_types[].dicom_file_type` and are
   sent back verbatim. Filter on the same source column so values match exactly.
3. **Response shape must stay a bare JSON array of integer IEC ids** (e.g.
   `[123, 456]`). Both route components do `parseInt(iec)` +
   `iecList.indexOf(iecNumber)` for next/previous navigation and load `iecs[0]` after
   filtering — an object wrapper or string ids silently breaks navigation.

---

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
pipeline states). They appear under "All" only. See [open decision #1](#open-decisions)
if we want them filterable.

### Semantics

1. **Precedence: explicit `masking_status` overrides `awaiting_review`.**
   This is the one non-obvious rule, and without it the review-route filter is
   useless. Mask Review VR *always* sends `awaiting_review=true` (its default lens =
   `process-complete`). If the reviewer then filters by `accepted` and the backend
   naively ANDs both conditions, `process-complete AND accepted` is always empty.
   So: when `masking_status` is present, ignore `awaiting_review`; when absent, keep
   today's `awaiting_review` behavior byte-for-byte.
   (`awaiting_review=true&masking_status=unreviewed` is naturally consistent — both
   mean `process-complete`.)

2. **Image type is an intersection.** `dicom_file_type` filters on
   `dicom_file.dicom_file_type` for the IEC's files — use the same join/expression
   the DICOM VR `/filter` endpoint uses, so dropdown values and filter matching
   agree. An IEC matches if *any* of its files match (`select distinct`). Unknown
   values are not an error — they simply return `[]`. Combines with the status
   filter as an AND.

3. **Deterministic ordering.** Add `order by image_equivalence_class_id`. The
   frontend walks the array for next/previous; the current query has no `ORDER BY`,
   so navigation order is technically unstable today. Cheap fix, do it while here.

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

Implementation notes:

- Consider two query variants (with/without the `file_import`/`dicom_file` joins)
  if the unconditional join changes row multiplicity — `distinct` guards the result,
  but check the query plan on a large VR.
- Doing the `unmasked`/`unreviewed` → DB-value translation in Python (a dict on the
  enum) instead of SQL `CASE` is equally fine; the table above is the contract.

---

## Frontend companion change (mirabelle)

Small, separate PR. `src/components/FilterPanel.jsx:253-258` hardcodes one Masking
Status option list — All, Unreviewed, Accepted, Rejected, Skipped, Nonmaskable — used
by both routes. Per the analysis above, the routes need different lists, and Mask VR's
primary option ("Unmasked") is missing entirely.

**Recommended approach — mirror the existing `dicomTypeOptions` prop.** FilterPanel
already accepts its Image Type options as a prop, threaded from the route component
(`RouteMaskVR.jsx` → `MaskVR` → `MaskIEC` → `FilterPanel`). Add a
`maskingStatusOptions` prop the same way and have each route pass its own list:

- Mask VR: All, **Unmasked**, Awaiting review, Accepted, Rejected, Skipped,
  Nonmaskable
- Mask Review VR: All, **Unreviewed**, Accepted, Rejected, Skipped, Nonmaskable

(Alternative: put a `maskingStatusOptions` field on `filterConfig` in
`src/features/presentationSlice.js`, set in `setMaskerConfig` /
`setMaskerReviewConfig`. Works too, but the prop route matches the existing
Image Type pattern and keeps the option lists next to the routes that own them.)

Label → param mapping notes:

- No `utilities.js` change needed for `unmasked`: the fetch helpers lowercase the
  label, so "Unmasked" → `masking_status=unmasked` automatically.
- The "Awaiting review" option for Mask VR **does** need an explicit label →
  `unreviewed` mapping in the fetch helper — naive lowercasing would produce
  `awaiting review` (with a space), which the backend enum rejects with a 422.
- The URL already carries the label (`/:maskingStatus/`), so deep links keep working.
  Existing bookmarks with "Unreviewed" on the Mask VR route stay valid because the
  backend accepts the full vocabulary on both routes.

Optional tidy-up while in the area: `getIECsForMaskVR` / `getIECsForMaskReviewVR` in
`src/utilities.js` are no longer referenced (the routes always call the `Filtered`
variants, which degrade to the unfiltered requests when both dropdowns are "All") —
they can be deleted.

---

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

Mask Review VR lens (these three prove the precedence rule):
- [ ] `?awaiting_review=true&masking_status=unreviewed` → same set as
      `?awaiting_review=true`.
- [ ] `?awaiting_review=true&masking_status=accepted` → accepted IECs (status wins;
      a naive AND would return `[]`).
- [ ] `?awaiting_review=true&masking_status=unmasked` → `created` IECs (status wins;
      the frontend won't offer this combination, but the endpoint stays
      route-agnostic).

End-to-end with mirabelle — run `make serve ENV=<env>` where `.env.<env>` points
`MIRA_API_TARGET` / `MIRA_API_TOKEN` at the dev backend (see `.env.example`), or use
the `live-test/` nginx harness (`make live-test`):

- [ ] `/mira/mask/vr/{vr}/*` — "Unmasked" shows only not-yet-masked IECs; masking one
      and re-filtering removes it from the list; next/prev walk only matches.
- [ ] `/mira/mask/review/vr/{vr}/*` — default view still shows awaiting-review IECs;
      "Accepted" shows past accepts; accepting an IEC and re-filtering "Unreviewed"
      removes it.
- [ ] A filter combination with no matches shows the "no results" toast and the
      "No IECs were found for the selected filters." placeholder — not an error.

---

## Out of scope / optional follow-ups

- **Masking-scoped `/values`.** The dropdown reuses the whole-VR values endpoint, so
  it can offer image types that exist in the VR but not among masking-flagged IECs
  (filtering then returns an empty list — handled gracefully by the UI). If that
  bothers users, add a masking-aware values endpoint later.
- **POST `/masking/visualreview/{vr}/filter` symmetry with the DICOM route.**
  Possible, but the merged frontend uses GET query params; choosing POST instead
  means also updating both fetch helpers in mirabelle's `src/utilities.js`. Not
  recommended unless we want strict symmetry.

## Open decisions

1. Should the in-flight states be filterable — e.g. an `in-progress` option
   (`ready-to-process` + `in-process`) and `errored`? `errored` is the likelier want
   (the Posda source notes errored/rejected may need to re-enter the masker queue).
   Cheap to add to the enum + mapping; needs a dropdown entry to be reachable.
2. Confirm the precedence rule (explicit `masking_status` beats `awaiting_review`) —
   required for the Mask Review VR status filter to be useful at all.

---

## Appendix: verification status

Everything stated about **mirabelle** was verified directly against the source on
branch `filterpanel-maskvr-maskreviewvr-endpoint-updates`:

| Claim | Where verified |
|---|---|
| Params sent only when ≠ "All"; status lowercased; type verbatim | `src/utilities.js:284-330` |
| Mask Review VR always sends `awaiting_review=true` | `src/utilities.js:318` |
| Both routes share one hardcoded status list (no "Unmasked") | `src/components/FilterPanel.jsx:253-258` |
| Response must be bare int array (navigation + `iecs[0]`) | `src/routes/mask/RouteMaskVR.jsx:84-88`, `src/routes/mask-review/RouteMaskReviewVR.jsx:88-92` |
| Image Type options come from the DICOM `/values` endpoint | `getValuesForDicomVR` calls in both route components |
| URL carries filter labels; filter click navigates with `*` IEC | `src/features/mask/MaskIEC.jsx:345-352`, `src/index.js` route table |
| Empty result → info toast, no error | both route components (`messages.filters.noResults`) |
| Frontend commits exist as described | `git log`: `17bbdd3`, `c6dc744` |

Statements about **papi/Posda** (current handler signature, `masking_status_type`
enum values, the `/next` handler selecting `created`, the `/filter` join expressions)
come from reading the Posda source separately and should be re-confirmed against the
papi codebase during implementation.

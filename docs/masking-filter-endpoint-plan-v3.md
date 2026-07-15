# Plan: Backend support for the Mask VR / Mask Review VR filters

**Audience:** papi (Posda FastAPI) developers, plus one small mirabelle follow-up.
**Status:** the mirabelle frontend is merged and already sends filter query params; the
backend ignores them, so filtering is currently a no-op. This document is the spec for
the missing backend piece, plus the small frontend cleanup that pairs with it.

This is the fully-explained edition. If you just want the change, read the
[TL;DR](#tldr) and [Backend work](#backend-work). If you're new to this corner of
Posda/mirabelle, start at [Terminology](#terminology) and read straight through.

---

## Table of contents

1. [TL;DR](#tldr)
2. [Terminology](#terminology)
3. [How the feature works end to end](#how-the-feature-works-end-to-end)
4. [The masking lifecycle (every state explained)](#the-masking-lifecycle-every-state-explained)
5. [Why the two routes need different filters](#why-the-two-routes-need-different-filters)
6. [The exact contract the frontend already sends](#the-exact-contract-the-frontend-already-sends)
7. [Backend work](#backend-work)
8. [Frontend companion change (mirabelle)](#frontend-companion-change-mirabelle)
9. [Testing](#testing)
10. [Out of scope / optional follow-ups](#out-of-scope--optional-follow-ups)
11. [Open decisions](#open-decisions)
12. [Appendix: verification status](#appendix-verification-status)

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
`awaiting_review`.** Without that rule the Mask Review VR status filter can never return
anything (details under [Semantics](#semantics)).

Everything about the **frontend** below was verified directly against the source on
branch `filterpanel-maskvr-maskreviewvr-endpoint-updates` (see the
[appendix](#appendix-verification-status) for exact line numbers). Statements about the
**papi/Posda** side (handler signature, the `masking_status_type` enum values, the
`/filter` and `/next` handlers) come from reading the Posda source separately and should
be re-confirmed against the papi codebase during implementation — they are flagged
inline where they occur.

---

## Terminology

Skip this if you already work in Posda daily. It exists so the rest of the document is
unambiguous.

| Term | Meaning |
|---|---|
| **papi** | "Posda API" — the FastAPI service under `posda/fastapi/app/papi/`. It owns the endpoints mirabelle calls. This is where the backend change lands. |
| **mirabelle** | The React/Redux frontend in this repo. It renders the review UIs and calls papi over HTTP. |
| **IEC** | *Image Equivalence Class* — Posda's unit of "one logically-equivalent image/series." The whole feature lists, filters, and navigates IECs. In the DB it is `image_equivalence_class.image_equivalence_class_id` (an integer). The frontend treats an IEC as an integer id throughout. |
| **VR** | *Visual Review* — a named batch of IECs queued for a human task, identified by `visual_review_instance_id` (an integer). A "Mask VR" and a "DICOM VR" are both rows in the same visual-review space; they differ only in which task/route consumes them. |
| **Mask VR** | The **masker's** worklist: IECs that need a mask *drawn*. Route: `/mask/vr/:vr/:iec/:maskingStatus/:dicomType`. |
| **Mask Review VR** | The **reviewer's** worklist: finished masks that need a *verdict*. Route: `/mask/review/vr/:vr/:iec/:maskingStatus/:dicomType`. |
| **DICOM Review VR** | A pre-existing, unrelated review flow. It is the *reference design* we are deliberately **not** copying wholesale (it uses a POST `/filter` endpoint; masking uses GET query params instead). Route: `/review/dicom/vr/:vr/:iec/:reviewStatus/:dicomType`. |
| **`masking_status_type`** | The Postgres enum that records where an IEC sits in the masking lifecycle. Its values drive this entire filter. Full list under [the lifecycle section](#the-masking-lifecycle-every-state-explained). |
| **Masking Status (UI)** vs **`masking_status` (param/column)** | The dropdown label the user picks (e.g. "Unmasked") is a *lens*. The frontend lowercases it into the `masking_status` query param (`unmasked`). The backend maps that param onto the DB enum value (`created`). These three vocabularies are intentionally *not* identical — the mapping is the contract. |
| **Image Type / `dicom_file_type`** | A DICOM file classification (e.g. `MR`, `CT`). The dropdown values come from a values endpoint and are sent back verbatim; the backend filters on the same column they came from. |

---

## How the feature works end to end

Understanding the flow makes the rest of the document obvious. Every step below except
the middle one is already implemented and verified in mirabelle source.

```
User picks a filter and clicks "Filter"
        │
        ▼
FilterPanel calls onAction → the route handler navigates to a URL that
CARRIES THE LABELS, with the IEC slot set to "*" meaning "pick the first match":
        /mask/vr/{vr}/*/Rejected/MR
        │   (src/features/mask/MaskIEC.jsx:345-352 — handleFilterAction)
        ▼
The route component reads :maskingStatus / :dicomType from the URL and calls the
fetch helper, which lowercases the status label into a query param and sends the
image type verbatim:
        GET /papi/v1/masking/visualreview/{vr}?masking_status=rejected&dicom_file_type=MR
        │   (src/utilities.js:284-330)
        ▼
========================  THE ONLY MISSING PIECE  ========================
Backend must read those two params, translate them to DB terms, and return a
bare JSON array of IEC ids:  [123, 456, ...]
=========================================================================
        │
        ▼
The route loads the first IEC (iecs[0]) and keeps the array for next/previous
navigation, walking it with iecList.indexOf(parseInt(iec)).
            (src/routes/mask/RouteMaskVR.jsx:58-88)
```

Because the URL carries the filter labels, deep links and browser refreshes keep
working with no extra effort — the route re-derives everything from the URL on mount.
**Only the backend step in the middle is missing.**

Where each step lives (all verified — see [appendix](#appendix-verification-status)):

- **Route table:** `src/index.js:88-131` (`mask/vr/:vr/:iec/:maskingStatus/:dicomType`
  and the `mask/review/vr/...` twin).
- **Fetch helpers:** `src/utilities.js` — `getFilteredIECsForMaskVR` (line 284),
  `getFilteredIECsForMaskReviewVR` (line 312).
- **Filter → navigation:** `handleFilterAction` in `src/features/mask/MaskIEC.jsx:345`
  (and the Mask Review twin) — navigates with the IEC slot as `*`.
- **Load first + walk the array:** `src/routes/mask/RouteMaskVR.jsx:58-88`,
  `src/routes/mask-review/RouteMaskReviewVR.jsx:61-92`.
- **Frontend landed in commits** `17bbdd3` (Mask VR) and `c6dc744` (Mask Review VR).

---

## The masking lifecycle (every state explained)

Every IEC in a masking VR moves through the `masking_status_type` enum. Understanding
the states is what makes the "two routes, two lenses" design and the precedence rule
inevitable rather than arbitrary.

```
                    masker submits          worker            worker
         created ─────────────────► ready-to-process ──► in-process ──► process-complete
            │                                                  │              │
            │ masker: skip / nonmaskable                       └─► errored    │ reviewer
            ▼                                                                  ▼
        skipped / nonmaskable                                        accepted / rejected
```

| DB enum value | What it means | Who moves it here | Addressable by a filter name? |
|---|---|---|---|
| `created` | Flagged for masking; **no mask drawn yet.** The masker's to-do. | System, when the VR is built | **`unmasked`** (Mask VR's primary lens) |
| `ready-to-process` | Masker submitted parameters; queued for the pipeline. | Masker (submit) | No — in-flight (see [open decision #1](#open-decisions)) |
| `in-process` | Pipeline is actively generating the mask. | Worker | No — in-flight |
| `process-complete` | Pipeline output is ready; **no verdict yet.** The reviewer's to-do. This is exactly what `awaiting_review=true` selects today. | Worker | **`unreviewed`** (Mask Review VR's primary lens) |
| `accepted` | Reviewer approved the mask. | Reviewer | `accepted` (both routes) |
| `rejected` | Reviewer bounced the mask; typically re-enters the masker's queue for re-work. | Reviewer | `rejected` (both routes) |
| `errored` | Pipeline failed. Likely needs to re-enter the masker's queue. | Worker | No — in-flight (see [open decision #1](#open-decisions)) |
| `skipped` | Masker skipped this IEC. | Masker | `skipped` (both routes) |
| `nonmaskable` | Masker marked it as not maskable. | Masker | `nonmaskable` (both routes) |

> **Confirm against papi.** The enum membership above, and the claims that the
> `…/visualreview/{vr}/next` handler selects `masking_status = 'created'`, that
> submitting mask parameters moves an IEC to `ready-to-process`, and that
> comments anticipate `rejected`/`errored` re-entering the masker's queue — all come
> from reading the Posda source and should be re-verified in the papi codebase.

The single most important takeaway: **`created` ("Unmasked") and `process-complete`
("Unreviewed") are different states.** They are the *to-do* states of two different
people, and they must be independently filterable. Half of the design below exists to
keep them distinct.

---

## Why the two routes need different filters

Both routes list IECs from the same `masking` table, but they sit at different points
in the lifecycle and serve different tasks:

| | **Mask VR** (masker's worklist) | **Mask Review VR** (reviewer's worklist) |
|---|---|---|
| Task | Draw masks | Review finished masks |
| To-do state | `created` — flagged, no mask yet | `process-complete` — output ready, no verdict |
| UI name for to-do | **"Unmasked"** | **"Unreviewed"** |
| Actions | submit (→ `ready-to-process`), Skip, Non-maskable | Accept, Reject, Skip, Non-maskable |
| Today's default fetch | no params (all masking rows) | `awaiting_review=true` (= `process-complete`) |
| Other useful filters | `rejected` (re-work queue), own dispositions | `accepted`/`rejected` (past verdicts), dispositions |
| Dropdown should offer | All, **Unmasked**, Awaiting review, Accepted, Rejected, Skipped, Nonmaskable | All, **Unreviewed**, Accepted, Rejected, Skipped, Nonmaskable |

"Unmasked" is useless on the review route (nothing to review yet), and "Unreviewed"
≠ "Unmasked". So each route defaults its dropdown to its own lens, but **the endpoint
accepts the full vocabulary regardless of which route calls it** — that keeps the
backend route-agnostic and lets the two PRs land independently.

---

## The exact contract the frontend already sends

From `src/utilities.js` (verified lines 284–330). Rules the code enforces today:

- A param is added **only when the dropdown is not "All".** "All" means "omit the param."
- `masking_status` is the UI label **lowercased** (`masking_status.toLowerCase()`).
- `dicom_file_type` is sent **verbatim** (exactly as it came from the values endpoint).
- The Mask Review helper **always** sets `awaiting_review=true` first, then adds the
  optional params (`src/utilities.js:318`).

```
# Mask VR — "All"/"All" (today's behavior, MUST keep working)
GET /papi/v1/masking/visualreview/{vr}

# Mask VR — with filters
GET /papi/v1/masking/visualreview/{vr}?masking_status=unmasked
GET /papi/v1/masking/visualreview/{vr}?masking_status=rejected&dicom_file_type=MR

# Mask Review VR — always sends awaiting_review=true
GET /papi/v1/masking/visualreview/{vr}?awaiting_review=true
GET /papi/v1/masking/visualreview/{vr}?awaiting_review=true&masking_status=unreviewed
GET /papi/v1/masking/visualreview/{vr}?awaiting_review=true&masking_status=accepted
GET /papi/v1/masking/visualreview/{vr}?awaiting_review=true&dicom_file_type=CT
```

Three contract rules the backend must honor:

1. **`masking_status` vocabulary:** `unmasked`, `unreviewed`, `accepted`, `rejected`,
   `skipped`, `nonmaskable`. Accept the full set from day one, on **both** routes.
   (The currently-merged UI shows "Unreviewed" on both routes and never sends
   `unmasked` yet — the [frontend companion change](#frontend-companion-change-mirabelle)
   fixes the Mask VR dropdown. Accepting the full vocabulary now means the two PRs don't
   have to land in lockstep, and old bookmarks stay valid.)
2. **`dicom_file_type` matches the values endpoint.** The dropdown options come from
   `GET /visualreviews/{vr}/values` → `dicom_file_types[].dicom_file_type`
   (`getValuesForDicomVR`, prefetched per VR in each route:
   `src/routes/mask/RouteMaskVR.jsx:33-45`) and are sent back verbatim. Filter on the
   **same source column** so values match exactly. Because Mask VRs live in the same
   `visual_review_instance_id` space as DICOM VRs, both mask routes already reuse this
   whole-VR values endpoint — **no new values endpoint is needed.**
3. **Response shape must stay a bare JSON array of integer IEC ids** (e.g.
   `[123, 456]`). Both route components do `iecList.indexOf(parseInt(iec))` for
   next/previous navigation and load `iecs[0]` after filtering
   (`RouteMaskVR.jsx:66-88`). An object wrapper or string ids silently breaks
   navigation.

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
) -> list[int]:
    ...
```

Typing `masking_status` as a `str` `Enum` gives you input validation for free: FastAPI
returns **422** on any value outside the vocabulary, so you never hand an invalid string
to the DB.

### Filter vocabulary → DB mapping

The param vocabulary and the DB enum are deliberately different. Do the translation
explicitly (a dict is clearest; a SQL `CASE` is equivalent):

| `masking_status` param | DB `masking_status` value | Primary route |
|---|---|---|
| `unmasked` | `created` | Mask VR ("needs a mask drawn") |
| `unreviewed` | `process-complete` | Mask Review VR ("awaits a verdict") |
| `accepted` | `accepted` | both |
| `rejected` | `rejected` | both |
| `skipped` | `skipped` | both |
| `nonmaskable` | `nonmaskable` | both |

Not addressable by name: `ready-to-process`, `in-process`, `errored` (in-flight
pipeline states). They surface only under "All." See
[open decision #1](#open-decisions) if we want them filterable.

### Semantics

**1. Precedence — explicit `masking_status` overrides `awaiting_review`.**
This is the one non-obvious rule, and the whole review-route filter is useless without
it. Mask Review VR *always* sends `awaiting_review=true` (that was the route's original
single-purpose behavior; the filter UI was layered on top without removing it). If the
reviewer then filters by `accepted` and the backend naively ANDs both conditions,
`process-complete AND accepted` is **always empty** — no IEC is in two states at once.

So: **when `masking_status` is present, ignore `awaiting_review`.** When it's absent,
reproduce today's `awaiting_review` behavior byte-for-byte. The full truth table (the
`dicom_file_type` filter is orthogonal and always ANDs on top):

| `masking_status` | `awaiting_review` | Resulting status predicate | Notes |
|---|---|---|---|
| *(absent)* | `false` | *(none — all masking rows)* | today's Mask VR default |
| *(absent)* | `true` | `= process-complete` | today's Mask Review VR default — **unchanged** |
| `unmasked` | *(either)* | `= created` | status wins |
| `unreviewed` | `true` | `= process-complete` | naturally consistent — both mean the same |
| `accepted` | `true` | `= accepted` | **the critical case:** a naive AND would return `[]` |
| `rejected` | *(either)* | `= rejected` | status wins |
| `skipped` | *(either)* | `= skipped` | status wins |
| `nonmaskable` | *(either)* | `= nonmaskable` | status wins |

**2. Image type is an intersection.** `dicom_file_type` filters on
`dicom_file.dicom_file_type` for the IEC's files — use the same join/expression the
DICOM VR `/filter` endpoint uses, so dropdown values and filter matching agree. An IEC
matches if *any* of its files match (hence `select distinct`). Unknown values are not
an error — they simply return `[]`. Combines with the status filter as an AND.

**3. Deterministic ordering.** Add `order by image_equivalence_class_id`. The frontend
walks the array for next/previous; the current query has no `ORDER BY`, so navigation
order is technically unstable today. Cheap fix — do it while you're here.

**4. Back-compat.** No params → identical to today. `awaiting_review=true` alone →
identical to today. Response shape unchanged. Additive, non-breaking; no schema change.

### A complete implementation

Rather than one big query with a `CASE` and an unconditional join, decide the status
predicate in Python and **only join `dicom_file` when you actually filter on image
type.** This sidesteps the row-multiplicity question entirely — the fan-out join (and
therefore `distinct`) only appears when it's needed. Adapt `db.fetch` / placeholder
style to papi's actual DB helper; the existing handler already runs a query here, so
reuse its execution style.

```python
from enum import Enum
from typing import Optional


class MaskingStatusFilter(str, Enum):
    """Values the frontend may send in ?masking_status=. str Enum → FastAPI 422s
    on anything outside this set before it reaches the DB."""
    unmasked = "unmasked"
    unreviewed = "unreviewed"
    accepted = "accepted"
    rejected = "rejected"
    skipped = "skipped"
    nonmaskable = "nonmaskable"


# UI/param vocabulary -> masking_status_type DB enum value. This dict IS the contract.
_STATUS_TO_DB: dict[MaskingStatusFilter, str] = {
    MaskingStatusFilter.unmasked: "created",
    MaskingStatusFilter.unreviewed: "process-complete",
    MaskingStatusFilter.accepted: "accepted",
    MaskingStatusFilter.rejected: "rejected",
    MaskingStatusFilter.skipped: "skipped",
    MaskingStatusFilter.nonmaskable: "nonmaskable",
}


def _status_predicate(
    masking_status: Optional[MaskingStatusFilter], awaiting_review: bool
) -> Optional[str]:
    """Return the masking_status the query should filter on, or None for 'no
    status filter'. Explicit masking_status wins over awaiting_review."""
    if masking_status is not None:
        return _STATUS_TO_DB[masking_status]   # explicit filter (overrides awaiting_review)
    if awaiting_review:
        return "process-complete"              # legacy default lens for the review route
    return None                                # no status filter — every masking row


@router.get("/visualreview/{visual_review_instance_id}")
async def get_for_visualreview(
    visual_review_instance_id: int,
    awaiting_review: bool = False,
    masking_status: Optional[MaskingStatusFilter] = None,
    dicom_file_type: Optional[str] = None,
    db: Database = Depends(),
    current_user: User = logged_in_user,
) -> list[int]:
    status_value = _status_predicate(masking_status, awaiting_review)

    params: list = [visual_review_instance_id]
    where = ["visual_review_instance_id = $1"]
    joins = ["natural join masking"]
    select = "select image_equivalence_class_id"

    if status_value is not None:
        params.append(status_value)
        where.append(f"masking_status = ${len(params)}::masking_status_type")

    if dicom_file_type is not None:
        # Only now do we join the file tables; the join can fan out, so de-dupe.
        select = "select distinct image_equivalence_class_id"
        joins += ["natural join file_import", "natural join dicom_file"]  # confirm join path in papi
        params.append(dicom_file_type)
        where.append(f"dicom_file_type = ${len(params)}")

    sql = f"""
        {select}
        from image_equivalence_class
          {' '.join(joins)}
        where {' and '.join(where)}
        order by image_equivalence_class_id
    """
    rows = await db.fetch(sql, *params)
    return [row["image_equivalence_class_id"] for row in rows]
```

The queries this produces, for the four shapes that matter:

```sql
-- No params (Mask VR default): every masking row in the VR
select image_equivalence_class_id
from image_equivalence_class natural join masking
where visual_review_instance_id = $1
order by image_equivalence_class_id

-- awaiting_review=true, no masking_status (Mask Review VR default — unchanged)
select image_equivalence_class_id
from image_equivalence_class natural join masking
where visual_review_instance_id = $1 and masking_status = $2::masking_status_type  -- 'process-complete'
order by image_equivalence_class_id

-- masking_status=accepted (&awaiting_review=true ignored — precedence rule)
select image_equivalence_class_id
from image_equivalence_class natural join masking
where visual_review_instance_id = $1 and masking_status = $2::masking_status_type  -- 'accepted'
order by image_equivalence_class_id

-- masking_status=unmasked & dicom_file_type=MR (status AND image-type intersection)
select distinct image_equivalence_class_id
from image_equivalence_class
  natural join masking
  natural join file_import
  natural join dicom_file
where visual_review_instance_id = $1
  and masking_status = $2::masking_status_type  -- 'created'
  and dicom_file_type = $3                       -- 'MR'
order by image_equivalence_class_id
```

> **Confirm against papi:** the exact join path from `image_equivalence_class` to
> `dicom_file` (shown here as `file_import` → `dicom_file`) should match whatever the
> DICOM VR `/filter` endpoint and the `/{iec}/reviewfiles` query use, so filter matches
> line up with the values endpoint. If the real DB helper doesn't support building
> parameterized SQL by string-concatenating placeholder indices, express the same logic
> with a single query plus a `CASE`/`coalesce`-style guard — the four output queries
> above are the target either way.

---

## Frontend companion change (mirabelle)

Small, separate PR. `src/components/FilterPanel.jsx:253-258` hardcodes **one** Masking
Status option list — All, Unreviewed, Accepted, Rejected, Skipped, Nonmaskable — used
by both routes. Per the analysis above the routes need different lists, and Mask VR's
primary option ("Unmasked") is missing entirely.

**Recommended approach — mirror the existing `dicomTypeOptions` prop.** FilterPanel
already accepts its Image Type options as a prop
(`src/components/FilterPanel.jsx:20,42-46,307-311`), threaded from the route component
down through the tree. The exact same path already exists for the type options and is
verified end to end:

```
RouteMaskVR (owns the list) ──dicomTypeOptions──► MaskVR ──► MaskIEC ──► FilterPanel
  RouteMaskVR.jsx:116          MaskVR.jsx:15/43     MaskIEC.jsx:98/545,637   FilterPanel.jsx:20/307
```

Add a `maskingStatusOptions` prop the same way and have each route pass its own list:

- **Mask VR:** All, **Unmasked**, Awaiting review, Accepted, Rejected, Skipped,
  Nonmaskable
- **Mask Review VR:** All, **Unreviewed**, Accepted, Rejected, Skipped, Nonmaskable

Render it in FilterPanel exactly like the Image Type block already does — replace the
six hardcoded `<option>`s at lines 253–258 with
`{maskingStatusOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}`.

> **Gotcha — two FilterPanel instances per route.** `MaskIEC.jsx` renders `<FilterPanel>`
> **twice** (lines 541 and 633), and `MaskReviewIEC.jsx` does too (lines 332 and 419).
> Both instances in each file must receive the new `maskingStatusOptions` prop, just as
> both already receive `dicomTypeOptions`. Miss one and that panel silently keeps the
> old hardcoded list.

**Alternative:** put a `maskingStatusOptions` field on `filterConfig` in
`src/features/presentationSlice.js`, set in `setMaskerConfig` (line 210) /
`setMaskerReviewConfig` (line 258) — both already toggle `visibility.maskingStatus`, so
the hook point exists. Works too, but the prop route matches the existing Image Type
pattern and keeps each option list next to the route that owns it.

Label → param mapping notes:

- **No `utilities.js` change needed for `unmasked`.** The fetch helpers lowercase the
  label (`masking_status.toLowerCase()`), so "Unmasked" → `masking_status=unmasked`
  automatically.
- **The "Awaiting review" option for Mask VR needs an explicit label → `unreviewed`
  mapping** in the fetch helper. Naive lowercasing would produce `awaiting review`
  (with a space), which the backend enum rejects with a 422. Map it before building the
  query param.
- **Deep links keep working.** The URL already carries the label (`/:maskingStatus/`),
  and the backend accepts the full vocabulary on both routes, so existing bookmarks
  (even "Unreviewed" on the Mask VR route) stay valid.

**Optional tidy-up while in the area (verified safe):** `getIECsForMaskVR` (line 276)
and `getIECsForMaskReviewVR` (line 304) in `src/utilities.js` are **dead code** — no
references anywhere outside their own definitions (the routes always call the
`Filtered` variants, which degrade to the unfiltered requests when both dropdowns are
"All"). They can be deleted.

---

## Testing

### Backend (adapt to papi's test setup, or curl against a dev instance)

Shared / regression:

- [ ] No params → same list as before the change.
- [ ] `?awaiting_review=true` → only `process-complete` (unchanged).
- [ ] `?masking_status=bogus` → **422** (not a 500, not an empty list).
- [ ] Response is a flat JSON array of ints, ascending.

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

Example curl (swap `{vr}` and the base URL for your dev instance):

```bash
BASE=http://localhost:8000/papi/v1/masking/visualreview
curl -s "$BASE/{vr}"                                             # default (all)
curl -s "$BASE/{vr}?awaiting_review=true"                        # legacy review default
curl -s "$BASE/{vr}?masking_status=unmasked"                     # Mask VR to-do
curl -s "$BASE/{vr}?awaiting_review=true&masking_status=accepted" # precedence: NOT []
curl -s "$BASE/{vr}?masking_status=bogus" -o /dev/null -w '%{http_code}\n'  # -> 422
```

### End-to-end with mirabelle

Run `make serve ENV=<env>` where `.env.<env>` points `MIRA_API_TARGET` /
`MIRA_API_TOKEN` at the dev backend (see `.env.example`), or use the `live-test/`
nginx harness (`make live-test`):

- [ ] `/mira/mask/vr/{vr}/*` — "Unmasked" shows only not-yet-masked IECs; masking one
      and re-filtering removes it from the list; next/prev walk only matches.
- [ ] `/mira/mask/review/vr/{vr}/*` — default view still shows awaiting-review IECs;
      "Accepted" shows past accepts; accepting an IEC and re-filtering "Unreviewed"
      removes it.
- [ ] A filter combination with no matches shows the info toast
      ("No results were found for the selected filters." — `src/lib/messages.js:41`) and
      the "No IECs were found for the selected filters." placeholder
      (`src/features/mask/MaskIEC.jsx:551`) — **not** an error.

---

## Out of scope / optional follow-ups

- **Masking-scoped `/values`.** The dropdown reuses the whole-VR values endpoint, so it
  can offer image types that exist in the VR but not among masking-flagged IECs
  (filtering then returns an empty list — handled gracefully by the UI). If that
  bothers users, add a masking-aware values endpoint later.
- **POST `/masking/visualreview/{vr}/filter` symmetry with the DICOM route.** Possible,
  but the merged frontend uses GET query params; choosing POST instead means also
  rewriting both fetch helpers in mirabelle's `src/utilities.js`. Not recommended unless
  we specifically want strict symmetry with the DICOM route.

---

## Open decisions

1. **Should the in-flight states be filterable** — e.g. an `in-progress` option
   (`ready-to-process` + `in-process`) and `errored`? `errored` is the likelier want
   (the Posda source notes errored/rejected may need to re-enter the masker queue).
   Cheap to add to the enum + mapping dict; needs a dropdown entry to be reachable.
2. **Confirm the precedence rule** (explicit `masking_status` beats `awaiting_review`).
   Required for the Mask Review VR status filter to be useful at all — without it,
   `awaiting_review=true & masking_status=accepted` returns `[]`.

---

## Appendix: verification status

Everything about **mirabelle** was verified directly against the source on branch
`filterpanel-maskvr-maskreviewvr-endpoint-updates`:

| Claim | Where verified |
|---|---|
| Params sent only when ≠ "All"; status lowercased; type verbatim | `src/utilities.js:284-330` |
| Mask Review VR always sends `awaiting_review=true` | `src/utilities.js:318` |
| Both routes share one hardcoded status list (no "Unmasked") | `src/components/FilterPanel.jsx:253-258` |
| FilterPanel already takes `dicomTypeOptions` as a prop | `src/components/FilterPanel.jsx:20,42-46,307-311` |
| `dicomTypeOptions` threaded Route → VR → IEC → FilterPanel | `RouteMaskVR.jsx:116`, `MaskVR.jsx:15,43`, `MaskIEC.jsx:98,545,637` |
| **Two** FilterPanel instances per route (both need the new prop) | `MaskIEC.jsx:541,633`; `MaskReviewIEC.jsx:332,419` |
| Response must be a bare int array (navigation + `iecs[0]`) | `RouteMaskVR.jsx:66-88`, `RouteMaskReviewVR.jsx:88-92` |
| Image Type options come from the DICOM `/values` endpoint | `getValuesForDicomVR` prefetch, `RouteMaskVR.jsx:33-45` |
| URL carries filter labels; filter click navigates with `*` IEC | `src/features/mask/MaskIEC.jsx:345-352`, `src/index.js:88-131` |
| Empty result → info toast + placeholder, no error | `messages.js:41`, `MaskIEC.jsx:549-551` |
| `getIECsForMaskVR` / `getIECsForMaskReviewVR` are unused (deletable) | `src/utilities.js:276,304` — no other references in `src/` |
| Frontend commits exist as described | `git log`: `17bbdd3`, `c6dc744` |

Statements about **papi/Posda** — the current handler signature, the
`masking_status_type` enum membership, the `/next` handler selecting `created`, and the
`/filter` join expressions — come from reading the Posda source separately and are
flagged inline (`> Confirm against papi`). Re-confirm them against the papi codebase
during implementation.

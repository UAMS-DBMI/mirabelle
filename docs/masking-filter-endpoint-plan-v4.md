# Plan: Backend support for the Mask VR / Mask Review VR filters (v4)

**Audience:** papi (Posda FastAPI) developers, plus one small mirabelle follow-up.
**Status:** the mirabelle frontend is merged and already sends filter query params; the
backend ignores them, so filtering is currently a no-op. This is the spec for the
missing backend piece plus the small frontend cleanup that pairs with it.

**What's new in v4:** every earlier version described the papi side from memory. This
version was written against the actual source in the `oneposda` checkout
(`posda/fastapi/app/papi/routes/masking.py`, `.../visualreviews.py`, and
`database/migrations/posda_files/add_masking_tables.sql`). Reading the real code
corrected three things the earlier plans got wrong — see the callout immediately below.

---

## ⚠️ Corrections v4 makes to the earlier plans

| # | Earlier plans said | The source actually says | Consequence |
|---|---|---|---|
| 1 | No params → "all masking rows." | No params → `masking_status in ('created', 'rejected')` — the masker's active worklist (to-mask **and** re-work). `masking.py:457-485` | "All" on Mask VR is **not** a superset of every other option. Back-compat means preserving `created`+`rejected`, not "everything." |
| 2 | Filter `dicom_file_type` by joining `masking → file_import → dicom_file` and `select distinct`. | `/values` and `/filter` derive it with a **correlated subquery** over `image_equivalence_class_input_image natural join dicom_file … limit 1`, because *all files in an IEC share one `dicom_file_type`*. `visualreviews.py:91-108,174-200` | Use the **same subquery** so filter values match the dropdown exactly. No fan-out join, no `distinct` needed. |
| 3 | "Confirm the enum against papi." | Enum is defined in `add_masking_tables.sql:8-16` (+ `add_values_to_masking_status_type.sql` adds `nonmaskable`, `skipped`). | The vocabulary is now **authoritative**, not provisional. |

Everything below is grounded in first-hand source from **both** repos (mirabelle on
branch `filterpanel-maskvr-maskreviewvr-endpoint-updates`, papi in `oneposda`). Exact
line numbers are in the [appendix](#appendix-verification-status).

---

## Table of contents

1. [TL;DR](#tldr)
2. [Terminology](#terminology)
3. [Ground truth: the papi endpoints today](#ground-truth-the-papi-endpoints-today)
4. [How the feature works end to end (mirabelle)](#how-the-feature-works-end-to-end-mirabelle)
5. [The masking lifecycle (every state explained)](#the-masking-lifecycle-every-state-explained)
6. [Why the two routes need different filters](#why-the-two-routes-need-different-filters)
7. [The contract the frontend already sends](#the-contract-the-frontend-already-sends)
8. [Backend work](#backend-work)
9. [Frontend companion change (mirabelle)](#frontend-companion-change-mirabelle)
10. [Testing](#testing)
11. [Out of scope / optional follow-ups](#out-of-scope--optional-follow-ups)
12. [Open decisions](#open-decisions)
13. [Appendix: verification status](#appendix-verification-status)

---

## TL;DR

The Mask VR and Mask Review VR pages in mirabelle have a filter panel (**Masking
Status** + **Image Type**). The UI is merged and already sends filter query params, but
the backend ignores them, so filtering currently does nothing.

| # | Where | What |
|---|---|---|
| 1 | **papi** | Teach the existing `GET /papi/v1/masking/visualreview/{vr}` handler two optional query params: `masking_status` and `dicom_file_type`. No new endpoints, no schema change, fully backward compatible. |
| 2 | **mirabelle** (separate small PR) | Give each route its own Masking Status dropdown list — the two routes need different primary filters. |

Two rules the backend must honor:

- **Explicit `masking_status` overrides `awaiting_review`.** Without it the Mask Review
  VR status filter can never return anything ([Semantics](#semantics)).
- **`dicom_file_type` must be filtered with the same expression `/values` uses**, or the
  dropdown values won't match what the filter matches.

---

## Terminology

Skip if you work in Posda daily.

| Term | Meaning |
|---|---|
| **papi** | The FastAPI service under `posda/fastapi/app/papi/` (in the `oneposda` checkout). Owns the endpoints. |
| **mirabelle** | The React/Redux frontend (this repo). Calls papi over HTTP. |
| **IEC** | *Image Equivalence Class* — the unit everything lists/filters/navigates. DB: `image_equivalence_class.image_equivalence_class_id` (integer). The frontend treats an IEC as an integer id. |
| **VR** | *Visual Review* — a batch of IECs queued for a task, keyed by `visual_review_instance_id`. Mask VRs and DICOM VRs live in the same table; they differ by which route consumes them. |
| **Mask VR** | The **masker's** worklist: IECs needing a mask *drawn*. Route `/mask/vr/:vr/:iec/:maskingStatus/:dicomType`. |
| **Mask Review VR** | The **reviewer's** worklist: finished masks needing a *verdict*. Route `/mask/review/vr/:vr/:iec/:maskingStatus/:dicomType`. |
| **`masking_status_type`** | The Postgres enum recording where an IEC sits in the masking lifecycle. Drives this filter. |
| Masking Status (UI) → `masking_status` (param) → DB enum | Three deliberately-different vocabularies. The dropdown label ("Unmasked") is lowercased into the param (`unmasked`), which the backend maps onto the DB value (`created`). The mapping is the contract. |
| **`dicom_file_type`** | A DICOM classification (e.g. `MR`, `CT`). Dropdown values come from `/values`; the backend must filter on the same expression they came from. |

---

## Ground truth: the papi endpoints today

This section quotes the current source so the change is unambiguous.

### The handler we're extending — `masking.py:439-485`

```python
@router.get("/visualreview/{visual_review_instance_id}")
async def get_for_visualreview(
    visual_review_instance_id: int,
    awaiting_review: bool = False,
    db: Database = Depends(),
    current_user: User = logged_in_user
):
    main_query = """\
        select image_equivalence_class_id
        from   image_equivalence_class natural join masking
        where  visual_review_instance_id = $1
          and  masking_status in ('created', 'rejected')
    """
    awaiting_review_query = """\
        select image_equivalence_class_id
        from   image_equivalence_class natural join masking
        where  visual_review_instance_id = $1
          and  masking_status = 'process-complete'
    """
    query = main_query
    if awaiting_review:
        query = awaiting_review_query
    records = await db.fetch(query, [visual_review_instance_id])
    return [x[0] for x in records]
```

Read the defaults carefully — **this is correction #1**:

- **No params** → `masking_status in ('created', 'rejected')`. Not "all rows." This is
  the masker's active worklist: needs-a-mask (`created`) **plus** bounced-back re-work
  (`rejected`).
- **`awaiting_review=true`** → `masking_status = 'process-complete'` (the reviewer's
  to-do).
- Returns a **bare list of ints** (`[x[0] for x in records]`); has **no `ORDER BY`**.

### The enum — authoritative (`add_masking_tables.sql:8-16` + `add_values_to_masking_status_type.sql`)

```sql
create type masking_status_type as enum (
    'created', 'ready-to-process', 'in-process', 'process-complete',
    'accepted', 'rejected', 'errored'
);
-- later migration:
ALTER TYPE masking_status_type ADD VALUE 'nonmaskable';
ALTER TYPE masking_status_type ADD VALUE 'skipped';
```

`masking.masking_status` is `not null default 'created'` (`add_masking_tables.sql:20`).
Every value above is also used as a literal somewhere in `masking.py`, so the vocabulary
is confirmed in both the schema and the code.

### How `dicom_file_type` is derived — this is correction #2 (`visualreviews.py`)

Both the values endpoint (`/visualreviews/{vr}/values`, lines 91-108) and the DICOM
filter endpoint (`/visualreviews/{vr}/filter`, lines 174-200) compute an IEC's
`dicom_file_type` with the **same correlated subquery**, and the filter endpoint spells
out why:

```sql
(
    /* All files in an IEC must always be of the same dicom_file_type,
       so we can just select the first one here for speed */
    select dicom_file_type
    from   image_equivalence_class_input_image
           natural join dicom_file
    where  image_equivalence_class_input_image.image_equivalence_class_id
             = image_equivalence_class.image_equivalence_class_id
    limit 1
) dicom_file_type
```

So the dropdown is populated from `image_equivalence_class_input_image natural join
dicom_file`. To make the masking filter's values line up with the dropdown exactly, the
masking endpoint must filter with the **same** expression — **not** the
`masking → file_import → dicom_file` path used by `/{iec}/reviewfiles`
(`masking.py:488-514`), which is a different join and could disagree at the edges.

### The dynamic-query pattern to mirror — `visualreviews.py:202-231`

`/filter` builds SQL incrementally with a bind counter. Match this style for
consistency:

```python
bind_vars = [vr]
bind_count = 1
if params.dicom_file_type != '*':
    bind_count += 1
    query += f"and dicom_file_type = ${bind_count}\n"
    bind_vars.append(params.dicom_file_type)
...
query += "order by 1"
results = await db.fetch(query, bind_vars)   # params passed as a single list
```

### Two related handlers that confirm the lifecycle

- `masking.py:390-436` — `…/visualreview/{vr}/next` (masker's "next") selects
  `masking_status = 'created'`, with a comment that `rejected`/`errored` *"might also
  need to show up here"* in future. This is exactly why the default worklist already
  includes `rejected`.
- `masking.py:348-387` — `…/visualreview/{vr}/next-for-review` (reviewer's "next")
  selects `masking_status = 'process-complete'`.

---

## How the feature works end to end (mirabelle)

Every step except the middle one is implemented and verified in mirabelle source.

```
User picks a filter and clicks "Filter"
        │
        ▼
handleFilterAction navigates to a URL carrying the LABELS, IEC slot = "*":
        /mask/vr/{vr}/*/Rejected/MR                 (src/features/mask/MaskIEC.jsx:345-352)
        │
        ▼
The route reads :maskingStatus/:dicomType and calls the fetch helper, which
lowercases the status label and sends the image type verbatim:
        GET /papi/v1/masking/visualreview/{vr}?masking_status=rejected&dicom_file_type=MR
        │                                            (src/utilities.js:284-330)
        ▼
======================  THE ONLY MISSING PIECE (backend)  ======================
Read the two params, map them to DB terms, return a bare JSON array of IEC ids.
================================================================================
        │
        ▼
Route loads iecs[0] and walks the array with iecList.indexOf(parseInt(iec))
for next/previous.                                 (src/routes/mask/RouteMaskVR.jsx:58-88)
```

Because the URL carries the labels, deep links and refreshes just work — the route
re-derives everything on mount. Frontend landed in commits `17bbdd3` (Mask VR) and
`c6dc744` (Mask Review VR).

---

## The masking lifecycle (every state explained)

```
                    masker submits          worker            worker
         created ─────────────────► ready-to-process ──► in-process ──► process-complete
            │                                                  │              │
            │ masker: skip / nonmaskable                       └─► errored    │ reviewer
            ▼                                                                  ▼
        skipped / nonmaskable                                        accepted / rejected
```

| DB enum value | Meaning | Set by (`masking.py`) | Filter name |
|---|---|---|---|
| `created` | Flagged; **no mask yet.** Masker's to-do. | insert on `/{iec}/mask` (line 114) | **`unmasked`** |
| `ready-to-process` | Params submitted; queued for pipeline. | `/{iec}/parameters` (line 173) | — (in-flight) |
| `in-process` | Pipeline running. | `/getwork` (line 52) | — (in-flight) |
| `process-complete` | Output ready; **no verdict.** Reviewer's to-do. | `/{iec}/complete` (line 213) | **`unreviewed`** |
| `accepted` | Reviewer approved. | `/{iec}/accept` (line 248) | `accepted` |
| `rejected` | Reviewer bounced; re-enters masker queue. | `/{iec}/reject` (line 275) | `rejected` |
| `errored` | Pipeline failed. | `/{iec}/complete`, exit≠0 (line 217) | — (in-flight) |
| `skipped` | Masker skipped. | `/{iec}/skip` (line 302) | `skipped` |
| `nonmaskable` | Masker marked not maskable. | `/{iec}/nonmaskable` (line 330) | `nonmaskable` |

The crucial point: **`created` ("Unmasked") and `process-complete` ("Unreviewed") are
different states** — the to-do states of two different people — and must be
independently filterable.

---

## Why the two routes need different filters

| | **Mask VR** (masker) | **Mask Review VR** (reviewer) |
|---|---|---|
| Task | Draw masks | Review finished masks |
| To-do state | `created` | `process-complete` |
| UI name for to-do | **"Unmasked"** | **"Unreviewed"** |
| Default fetch **today** | no params → `created` **+** `rejected` | `awaiting_review=true` → `process-complete` |
| Also useful | `rejected` (re-work), own dispositions | `accepted`/`rejected`, dispositions |
| Dropdown should offer | All, **Unmasked**, Awaiting review, Accepted, Rejected, Skipped, Nonmaskable | All, **Unreviewed**, Accepted, Rejected, Skipped, Nonmaskable |

"Unmasked" is useless on the review route (nothing to review yet); "Unreviewed" ≠
"Unmasked". Each route defaults its dropdown to its own lens, but the endpoint accepts
the full vocabulary regardless of caller, so the two PRs can land independently.

Note the masker default already **includes `rejected`** — that's deliberate (re-work is
part of the masker's job), and it's why "All" on Mask VR means `created`+`rejected`, not
literally every row. See [open decision #1](#open-decisions).

---

## The contract the frontend already sends

From `src/utilities.js:284-330` (verified). Rules the code enforces:

- A param is added **only when the dropdown ≠ "All".**
- `masking_status` = the UI label **lowercased** (`masking_status.toLowerCase()`).
- `dicom_file_type` = sent **verbatim**.
- The Mask Review helper **always** sets `awaiting_review=true` first (`utilities.js:318`).

```
# Mask VR — "All"/"All" (today's behavior, MUST keep working → created+rejected)
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

Three rules the backend must honor:

1. **`masking_status` vocabulary:** `unmasked`, `unreviewed`, `accepted`, `rejected`,
   `skipped`, `nonmaskable`. Accept the full set on **both** routes from day one (the
   companion frontend change adds "Unmasked" to Mask VR later; accepting everything now
   decouples the two PRs and keeps old bookmarks valid).
2. **`dicom_file_type` matches `/values`.** Options come from `/visualreviews/{vr}/values`
   → `dicom_file_types[].dicom_file_type` (prefetched per VR in each route,
   `RouteMaskVR.jsx:33-45`) and are sent back verbatim. Filter with the **same
   correlated subquery** `/values` uses (see [correction #2](#️-corrections-v4-makes-to-the-earlier-plans)).
3. **Response stays a bare JSON array of integer IEC ids.** Both routes do
   `iecList.indexOf(parseInt(iec))` and load `iecs[0]` (`RouteMaskVR.jsx:66-88`). An
   object wrapper or string ids silently breaks navigation.

---

## Backend work

Extend `get_for_visualreview()` in `posda/fastapi/app/papi/routes/masking.py`. New
signature:

```python
@router.get("/visualreview/{visual_review_instance_id}")
async def get_for_visualreview(
    visual_review_instance_id: int,
    awaiting_review: bool = False,
    masking_status: Optional[MaskingStatusFilter] = None,  # str Enum → free 422 on bad input
    dicom_file_type: Optional[str] = None,
    db: Database = Depends(),
    current_user: User = logged_in_user,
) -> List[int]:
```

### Filter vocabulary → DB mapping

| `masking_status` param | DB `masking_status` | Primary route |
|---|---|---|
| `unmasked` | `created` | Mask VR |
| `unreviewed` | `process-complete` | Mask Review VR |
| `accepted` | `accepted` | both |
| `rejected` | `rejected` | both |
| `skipped` | `skipped` | both |
| `nonmaskable` | `nonmaskable` | both |

Not addressable by name: `ready-to-process`, `in-process`, `errored` (in-flight). See
[open decision #2](#open-decisions).

### Semantics

**1. Precedence — explicit `masking_status` overrides `awaiting_review`.** Mask Review
VR *always* sends `awaiting_review=true` (its original single-purpose behavior; the
filter UI was layered on top). If the reviewer then filters by `accepted` and the
backend naively ANDs both, `process-complete AND accepted` is **always empty**. So when
`masking_status` is present, ignore `awaiting_review`; when absent, reproduce today's
behavior exactly. Full truth table (`dicom_file_type` is an independent AND on top):

| `masking_status` | `awaiting_review` | Status predicate | Note |
|---|---|---|---|
| *(absent)* | `false` | `in ('created','rejected')` | today's Mask VR default — **unchanged** |
| *(absent)* | `true` | `= 'process-complete'` | today's Mask Review VR default — **unchanged** |
| `unmasked` | *(either)* | `= 'created'` | status wins (subset of the default) |
| `unreviewed` | `true` | `= 'process-complete'` | consistent — both mean the same |
| `accepted` | `true` | `= 'accepted'` | **critical:** naive AND would return `[]` |
| `rejected` | *(either)* | `= 'rejected'` | status wins |
| `skipped` / `nonmaskable` | *(either)* | `= that value` | status wins |

**2. Image type is an intersection**, filtered by the same correlated subquery `/values`
and `/filter` use. Unknown values aren't an error — they return `[]`. (The frontend
drops null types from the dropdown, so the `is null` branch `/filter` has isn't needed
here.)

**3. Deterministic ordering.** Add `order by 1` (what `/iecs` and `/filter` already do).
The current handler has none, so navigation order is technically unstable today.

**4. Back-compat.** No params → `created`+`rejected` (unchanged). `awaiting_review=true`
alone → `process-complete` (unchanged). Response shape unchanged. Additive; no schema
change.

### Complete implementation (matches the `/filter` style)

```python
from enum import Enum
from typing import List, Optional


class MaskingStatusFilter(str, Enum):
    """Values the frontend may send in ?masking_status=. As a str Enum, FastAPI
    returns 422 for anything outside this set before it reaches the DB."""
    unmasked = "unmasked"
    unreviewed = "unreviewed"
    accepted = "accepted"
    rejected = "rejected"
    skipped = "skipped"
    nonmaskable = "nonmaskable"


# param vocabulary -> masking_status_type value. This dict IS the contract.
MASKING_STATUS_TO_DB: dict[MaskingStatusFilter, str] = {
    MaskingStatusFilter.unmasked: "created",
    MaskingStatusFilter.unreviewed: "process-complete",
    MaskingStatusFilter.accepted: "accepted",
    MaskingStatusFilter.rejected: "rejected",
    MaskingStatusFilter.skipped: "skipped",
    MaskingStatusFilter.nonmaskable: "nonmaskable",
}


@router.get("/visualreview/{visual_review_instance_id}")
async def get_for_visualreview(
    visual_review_instance_id: int,
    awaiting_review: bool = False,
    masking_status: Optional[MaskingStatusFilter] = None,
    dicom_file_type: Optional[str] = None,
    db: Database = Depends(),
    current_user: User = logged_in_user,
) -> List[int]:
    """List IECs in this VR, optionally filtered.

    Back-compat (no masking_status):
      awaiting_review is false -> masking_status in ('created', 'rejected')
      awaiting_review is true  -> masking_status = 'process-complete'

    When masking_status is supplied it OVERRIDES awaiting_review and selects
    exactly the mapped status. dicom_file_type further restricts by image type,
    using the same expression as /visualreviews/{vr}/values so the values line up.
    """
    query = """\
        select image_equivalence_class_id
        from   image_equivalence_class natural join masking
        where  visual_review_instance_id = $1
    """
    bind_vars = [visual_review_instance_id]
    bind_count = 1

    # --- status predicate: explicit masking_status wins over awaiting_review ---
    if masking_status is not None:
        bind_count += 1
        # cast the column to text so we needn't register the enum with the driver
        query += f"and masking_status::text = ${bind_count}\n"
        bind_vars.append(MASKING_STATUS_TO_DB[masking_status])
    elif awaiting_review:
        query += "and masking_status = 'process-complete'\n"
    else:
        query += "and masking_status in ('created', 'rejected')\n"

    # --- image type: same correlated subquery as /values and /filter ---
    if dicom_file_type is not None:
        bind_count += 1
        query += f"""\
        and (
            select dicom_file_type
            from   image_equivalence_class_input_image natural join dicom_file
            where  image_equivalence_class_input_image.image_equivalence_class_id
                     = image_equivalence_class.image_equivalence_class_id
            limit 1
        ) = ${bind_count}
        """
        bind_vars.append(dicom_file_type)

    query += "order by 1"

    records = await db.fetch(query, bind_vars)
    return [x[0] for x in records]
```

Why this shape:

- It mirrors `get_vr_filtered` (`visualreviews.py:202-231`) — same `bind_count`/
  `bind_vars` incremental build, same `db.fetch(query, bind_vars)`, same `order by 1`,
  same `[x[0] for x in records]` return. It reads like its neighbor.
- The `elif/else` reproduces today's two defaults **byte-for-byte**, so no-param and
  `awaiting_review=true` callers are unaffected.
- The image-type subquery is copied from the reference endpoints, so a value from the
  dropdown always matches here (contract rule #2). No join fan-out ⇒ no `distinct`.
- `masking_status::text = $n` sidesteps asyncpg enum-encoding entirely; the values are
  from a fixed dict, so this is safe. (`= $n::masking_status_type` also works if you
  prefer casting the parameter instead of the column.)

### Queries this emits

```sql
-- No params (Mask VR default): masker worklist
select image_equivalence_class_id
from image_equivalence_class natural join masking
where visual_review_instance_id = $1 and masking_status in ('created', 'rejected')
order by 1

-- awaiting_review=true (Mask Review VR default — unchanged)
... where visual_review_instance_id = $1 and masking_status = 'process-complete' order by 1

-- masking_status=accepted (&awaiting_review=true ignored — precedence)
... where visual_review_instance_id = $1 and masking_status::text = $2  -- 'accepted'
order by 1

-- masking_status=unmasked & dicom_file_type=MR (status AND image type)
select image_equivalence_class_id
from image_equivalence_class natural join masking
where visual_review_instance_id = $1
  and masking_status::text = $2                 -- 'created'
  and (
        select dicom_file_type
        from image_equivalence_class_input_image natural join dicom_file
        where image_equivalence_class_input_image.image_equivalence_class_id
                = image_equivalence_class.image_equivalence_class_id
        limit 1
      ) = $3                                     -- 'MR'
order by 1
```

---

## Frontend companion change (mirabelle)

Small, separate PR. `src/components/FilterPanel.jsx:253-258` hardcodes **one** Masking
Status list — All, Unreviewed, Accepted, Rejected, Skipped, Nonmaskable — used by both
routes. The two routes need different lists, and Mask VR's primary option ("Unmasked")
is missing.

**Recommended — mirror the existing `dicomTypeOptions` prop.** FilterPanel already takes
its Image Type options as a prop (`FilterPanel.jsx:20,42-46,307-311`), threaded from the
route:

```
RouteMaskVR (owns the list) ──dicomTypeOptions──► MaskVR ──► MaskIEC ──► FilterPanel
  RouteMaskVR.jsx:116          MaskVR.jsx:15/43     MaskIEC.jsx:98/545,637   FilterPanel.jsx:20/307
```

Add a `maskingStatusOptions` prop the same way. Each route passes its own list:

- **Mask VR:** All, **Unmasked**, Awaiting review, Accepted, Rejected, Skipped, Nonmaskable
- **Mask Review VR:** All, **Unreviewed**, Accepted, Rejected, Skipped, Nonmaskable

Render it like the Image Type block already does — replace the six hardcoded `<option>`s
with `{maskingStatusOptions.map((o) => <option key={o} value={o}>{o}</option>)}`.

> **Gotcha — two FilterPanel instances per route.** `MaskIEC.jsx` renders `<FilterPanel>`
> **twice** (lines 541, 633) and `MaskReviewIEC.jsx` twice (lines 332, 419). Both in each
> file need the new prop, exactly as both already receive `dicomTypeOptions`.

Label → param mapping:

- **`unmasked` needs no `utilities.js` change** — the helper lowercases the label, so
  "Unmasked" → `masking_status=unmasked`.
- **"Awaiting review" needs an explicit label → `unreviewed` mapping** in the helper;
  naive lowercasing yields `awaiting review` (with a space), which the enum rejects (422).
- **Deep links keep working** — the URL carries the label and the backend accepts the
  full vocabulary on both routes.

**"All" is not literally all (Mask VR).** Because the backend default is
`created`+`rejected`, the Mask VR "All" option shows the masker's active worklist, and
"Unmasked"/"Rejected" narrow it to each half. That's the correct default (re-work belongs
in the worklist), but the label undersells it. Options: keep "All" and document it,
rename it ("To do"), or add a literal all-rows view — see
[open decision #1](#open-decisions). The Mask Review "All" = `process-complete` (awaiting
review), which is already its natural default.

**Optional tidy-up (verified safe):** `getIECsForMaskVR` (`utilities.js:276`) and
`getIECsForMaskReviewVR` (line 304) are **dead code** — no references anywhere in `src/`
outside their own definitions (routes always call the `Filtered` variants, which degrade
to the unfiltered request when both dropdowns are "All"). Deletable.

---

## Testing

### Backend

Shared / regression:

- [ ] No params → `created`+`rejected` (same as before — **not** "all rows").
- [ ] `?awaiting_review=true` → only `process-complete` (unchanged).
- [ ] `?masking_status=bogus` → **422**.
- [ ] Response is a flat JSON array of ints, ascending.

Mask VR lens:

- [ ] `?masking_status=unmasked` → only `created` (**excludes `rejected`**, which the
      no-param default includes — this proves the status filter narrows the default).
- [ ] `?masking_status=rejected` → only `rejected`.
- [ ] `?masking_status=unmasked&dicom_file_type=<value from /values>` → intersection,
      and every returned IEC's `/values` type equals that value.

Mask Review VR lens (prove the precedence rule):

- [ ] `?awaiting_review=true&masking_status=unreviewed` → same set as `?awaiting_review=true`.
- [ ] `?awaiting_review=true&masking_status=accepted` → accepted IECs (status wins; a
      naive AND would return `[]`).
- [ ] `?awaiting_review=true&masking_status=unmasked` → `created` IECs (status wins).

```bash
BASE=http://localhost:8000/papi/v1/masking/visualreview
curl -s "$BASE/{vr}"                                              # -> created+rejected
curl -s "$BASE/{vr}?awaiting_review=true"                         # -> process-complete
curl -s "$BASE/{vr}?masking_status=unmasked"                      # -> created only
curl -s "$BASE/{vr}?awaiting_review=true&masking_status=accepted" # -> accepted (NOT [])
curl -s "$BASE/{vr}?masking_status=bogus" -o /dev/null -w '%{http_code}\n'  # -> 422
```

### End-to-end with mirabelle

`make serve ENV=<env>` (`.env.<env>` points `MIRA_API_TARGET`/`MIRA_API_TOKEN` at the dev
backend; see `.env.example`) or the `live-test/` nginx harness (`make live-test`):

- [ ] `/mira/mask/vr/{vr}/*` — "Unmasked" shows only not-yet-masked IECs; masking one and
      re-filtering removes it; next/prev walk only matches.
- [ ] `/mira/mask/review/vr/{vr}/*` — default still shows awaiting-review IECs; "Accepted"
      shows past accepts; accepting an IEC and re-filtering "Unreviewed" removes it.
- [ ] A no-match combination shows the info toast ("No results were found for the selected
      filters." — `src/lib/messages.js:41`) and the "No IECs were found for the selected
      filters." placeholder (`src/features/mask/MaskIEC.jsx:551`) — **not** an error.

---

## Out of scope / optional follow-ups

- **Masking-scoped `/values`.** The dropdown reuses the whole-VR values endpoint, so it
  can offer image types present in the VR but not among masking-flagged IECs (filtering
  then returns `[]`, handled gracefully). Add a masking-aware values endpoint later if it
  bothers users.
- **POST `/masking/visualreview/{vr}/filter` symmetry with the DICOM route.** Possible,
  but the merged frontend uses GET query params; POST would also mean rewriting both
  fetch helpers in `src/utilities.js`. Not recommended unless we want strict symmetry.

---

## Open decisions

1. **What should Mask VR's "All" mean?** Today the no-param default is
   `created`+`rejected` (the masker's active worklist). Keeping it is the
   backward-compatible choice and arguably correct, but the "All" label implies a
   superset it isn't (it excludes accepted/skipped/process-complete). Choose: (a) keep
   "All", document the meaning; (b) rename it ("To do" / "Needs masking"); or (c) add a
   literal all-rows option with an explicit param value. **Recommendation: (a) or (b)** —
   both preserve the current default fetch and avoid a behavior change.
2. **Should in-flight states be filterable** — `ready-to-process` + `in-process`
   ("in-progress") and `errored`? `errored` is the likelier want (the `/next` comment and
   the `/{iec}/complete` errored path suggest errored IECs may need to re-enter the masker
   queue). Cheap to add to `MaskingStatusFilter` + the map + a dropdown entry.
3. **Confirm the precedence rule** (explicit `masking_status` beats `awaiting_review`) —
   required for the Mask Review VR status filter to work at all.

---

## Appendix: verification status

**Both** sides are now verified first-hand.

papi (`oneposda` checkout):

| Claim | Where |
|---|---|
| Current default = `created`+`rejected`; `awaiting_review=true` = `process-complete`; bare int array; no `ORDER BY` | `masking.py:439-485` |
| `masking_status_type` enum values (7 original + `nonmaskable`,`skipped`) | `database/migrations/posda_files/add_masking_tables.sql:8-16`, `add_values_to_masking_status_type.sql:1-2` |
| `masking.masking_status` default `'created'`, PK on IEC | `add_masking_tables.sql:17-23` |
| `dicom_file_type` derived by correlated subquery over `image_equivalence_class_input_image ⋈ dicom_file` (values **and** filter) | `visualreviews.py:91-108, 174-200` |
| "All files in an IEC share one `dicom_file_type`" | `visualreviews.py:181-184` |
| Dynamic-query build pattern (`bind_count`/`bind_vars`/`order by 1`) | `visualreviews.py:202-231` |
| `/values` returns `dicom_file_types:[{dicom_file_type,count}]` | `visualreviews.py:69-155` |
| `/next` selects `created` w/ rejected-or-errored comment; `/next-for-review` selects `process-complete` | `masking.py:408-436, 348-387` |
| Each status set by a distinct POST handler | `masking.py:114,173,213,217,248,275,302,330` |

mirabelle (branch `filterpanel-maskvr-maskreviewvr-endpoint-updates`):

| Claim | Where |
|---|---|
| Params sent only when ≠ "All"; status lowercased; type verbatim; review always sends `awaiting_review=true` | `src/utilities.js:284-330` (line 318) |
| One hardcoded status list, no "Unmasked"; `dicomTypeOptions` is a prop | `src/components/FilterPanel.jsx:253-258, 20/42-46/307-311` |
| `dicomTypeOptions` threaded Route → VR → IEC → FilterPanel | `RouteMaskVR.jsx:116`, `MaskVR.jsx:15,43`, `MaskIEC.jsx:98,545,637` |
| **Two** FilterPanel instances per route | `MaskIEC.jsx:541,633`; `MaskReviewIEC.jsx:332,419` |
| Bare int array required (nav + `iecs[0]`) | `RouteMaskVR.jsx:66-88`, `RouteMaskReviewVR.jsx:88-92` |
| Image-type options prefetched from `/values` | `RouteMaskVR.jsx:33-45` |
| Filter click navigates with `*` IEC; URL carries labels | `MaskIEC.jsx:345-352`, `src/index.js:88-131` |
| Empty result → info toast + placeholder, not an error | `messages.js:41`, `MaskIEC.jsx:549-551` |
| `getIECsForMaskVR`/`getIECsForMaskReviewVR` unused | `src/utilities.js:276,304` (no other refs in `src/`) |

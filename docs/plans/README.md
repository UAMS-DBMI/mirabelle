# Feature Plans — Index

Planning/information files for the in-flight and proposed features, grouped by
component as discussed. Each file covers one component area, explains the code
that already exists on our branches in detail, and lays out what remains, so we
can decide what to move forward on.

| Plan file | Component area | Tasks covered |
| --- | --- | --- |
| [mask-selection.md](mask-selection.md) | Selection tool, live preview, drafts | movable/resizable selection · viewport-limit clamping · persistence across IECs · disabled while loading |
| [cache.md](cache.md) | Cornerstone cache, volume loading | cache loading issues · cache usage preview in header |
| [viewport.md](viewport.md) | Cameras, overlays, pane chrome | viewport edges display · reset-camera button |
| [iec-navigation.md](iec-navigation.md) | IEC queue, next/prev flow | interactive IEC list w/ search+filter · navigation race fixes |
| [general-ui.md](general-ui.md) | Loading UX, header, error recovery | loading indicator · UI loading speed · disabled UI during load · image type+ID in header · reload-image button |

## Branch topology (as of 2026-07-22)

Everything below is stacked on `origin/develop` (`c9e5da6`). The stack is
linear — each branch contains all commits of the one before it:

```
origin/develop (c9e5da6)
  └─ shared masking base            8a2d300..b75c776   (5 commits)
       ├─ masking-rectangle-roi     d989880            ← SIBLING, not in the stack below
       └─ masking-improvements      dadff74..cfb69b7   (11 commits)
            └─ ui-loading-improvements  b40ad93..d2fb2b0  (7 commits)
                 └─ iec-list        e98688f..d585e74   (3 commits, current branch)
```

Unmerged elsewhere:

- `origin/general-improvements` — `8d01850` "Tune DICOM volume load
  concurrency" (prefetch pool 5→20, decode workers scaled to cores). Sits on
  an older base; relevant to the cache plan.
- `masking-rectangle-roi` — `d989880`, an **alternative implementation** of
  the mask selection using a native Cornerstone `RectangleROITool` instead of
  the scissors approach. A decision is needed between the two; see
  [mask-selection.md](mask-selection.md).

`main` is far behind and not a useful comparison point; treat
`origin/develop` as the integration base.

## Task → status at a glance

Statuses summarize the detail in the per-component files.

| # | Task | Plan file | Status |
| --- | --- | --- | --- |
| 1 | Mask selection movable & resizable, rendered live in all viewports | mask-selection | Implemented — two competing implementations (scissors stack vs rectangle-ROI branch); decision needed |
| 2 | Selection cannot exceed viewport limits | mask-selection | Implemented — clamped to image-data bounds (`clampedRectangleScissors.js`); ROI branch clamps only at read time |
| 3 | Mask selections preserved across IECs | mask-selection | Implemented on `iec-list` (`0dadff1`) |
| 4 | Selection tool disabled while image loading | mask-selection | Implemented (`3f028d7`) |
| 5 | Cache loading issues resolved | cache | Partial — dev-proxy fix landed; concurrency tune unmerged; eviction gaps remain |
| 6 | Cache usage preview tool in header | cache | Implemented (`CacheStatus.jsx`, `e5e9bfd`); polish TBD |
| 7 | Viewport edges displayed | viewport | Implemented (`viewportFrame.js`) |
| 8 | Reset-camera button for all viewports | viewport | Implemented (`b75c776`, `6727c5d`) |
| 9 | Interactive IEC list with search and filtering | iec-navigation | Implemented on `iec-list` branch |
| 10 | Racing errors in IEC navigation fixed | iec-navigation | Implemented across several commits; residual risk noted |
| 11 | Loading indicator improved | general-ui | Implemented (`b40ad93`, `b136b17`) |
| 12 | Image type and ID shown in header | general-ui | Implemented (`d585e74`) |
| 13 | Reload-image button for failed loads | general-ui | Implemented in Mask route only (`e5e9bfd`); missing in review/nifti routes |
| 14 | UI loading speed improved | general-ui | Implemented (`88121b8`); further ideas listed |
| 15 | UI elements disabled while IEC loads | general-ui | Implemented (`d2fb2b0` + gating) |

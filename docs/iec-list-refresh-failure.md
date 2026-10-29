# IEC List Refresh Failure — Implementation Notes

When refreshing the IEC list fails mid-navigation, the VR routes now keep the
list they already had, so next and previous keep working.

**Branch:** `image-navigation-fix-develop-main`

**Commit:** Keep the IEC list when a refresh fails

**Audience:** developers touching the VR route list fetch.

**Modules:**

| File | Responsibility |
|---|---|
| [src/routes/mask/RouteMaskVR.jsx](../src/routes/mask/RouteMaskVR.jsx#L93) | Mask VR list |
| [src/routes/mask-review/RouteMaskReviewVR.jsx](../src/routes/mask-review/RouteMaskReviewVR.jsx#L97) | Mask review VR list |
| [src/routes/dicom/RouteDicomReviewVR.jsx](../src/routes/dicom/RouteDicomReviewVR.jsx#L121) | DICOM review VR list |

---

## 1. The problem

Each VR route fetches its IEC list again on every IEC change, so that filtered
browsing reflects work just submitted. Next and previous are derived from that
list.

The routes already avoid blanking the list while a refresh is in flight: only a
new VR or new filters (`listKey`) reset it to `null`
([RouteMaskVR.jsx:71](../src/routes/mask/RouteMaskVR.jsx#L71)). But a failed
fetch replaced it with `[]`. One failed refresh — for example a 502 from the
papi gateway — dimmed the arrows mid-navigation, even though a good list had
loaded a moment earlier.

## 2. The fix

All three routes' catch handlers now do:

```js
setIecList((previous) => previous ?? []);
```

- **A list is already shown** (same VR and filters): it is kept. The error
  toast still appears.
- **No list yet** (first load, or the VR or filters just changed, which reset
  it to `null` first): it falls back to `[]`, as before.

So a list for different filters is never kept by mistake.

## 3. Not changed

- The catch still calls `setLoading(false)`. If a refresh fails while the exam
  is still loading, the spinner comes down early even though the images keep
  streaming in.
- The cause of a 502 is on the server (papi behind nginx); this change only
  makes the client cope with it.

## 4. Testing

Manual — no automated tests were added.

1. Open a VR route and let the list load.
2. Make the list endpoint fail (for example, block
   `/papi/v1/masking/visualreview/*/filter` or `/papi/v1/visualreviews/*/filter`
   in DevTools' Network request blocking), then press Next.
3. An error toast appears, and next and previous still work.
4. Change a filter while the endpoint is still blocked. The list empties and
   the arrows dim, because there is no list for the new filters.

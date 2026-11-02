# Error Toasts Per Image — Implementation Notes

Each image keeps its own error toasts. Moving between images shows only the errors
of the image on screen, and a curator can clear them for that image.

**Branch:** `nifti-projection-issue-fix-clear-all-errors-develop-main`

**Commit:** Keep error toasts with their image, and let curators clear them

**Audience:** developers raising errors through `notify`, or touching toasts.

**Modules:**

| File | Responsibility |
|---|---|
| [src/lib/notify.js](../src/lib/notify.js) | Saves errors per image, shows and hides their toasts, `ClearAllErrors` |
| [src/hooks/useErrorsPerImage.js](../src/hooks/useErrorsPerImage.js) | Tells `notify` which image is on screen, from the route's params |
| [src/components/AppLayout.jsx](../src/components/AppLayout.jsx) | Runs that hook once for every route |
| [src/components/notifications.css](../src/components/notifications.css) | `.app-toast__clear-all` |
| [src/lib/messages.js](../src/lib/messages.js) | `toasts.clearAllErrors` |

---

## 1. What the curator sees

Error toasts stay until dismissed, so browsing damaged files used to pile them up
with no sign of which file each one was about.

| The curator | Result |
|---|---|
| Moves to another image (Next, Previous, a hotkey, a status button) | This image's errors leave the screen, and the new image's saved errors appear |
| Comes back to the image | Its errors are shown again, newest on top |
| Clicks × on a toast | That error is cleared for this image |
| Clicks **Clear all N errors** | Every error showing is cleared for this image; other images keep theirs |
| Refreshes the page | Saved errors are forgotten; the page raises its load errors again |

**Clear all N errors** is a link on the top toast, shown once two or more errors
are up. With a single error, its × does the same job. Clear all doesn't touch
loading toasts or the timed success and info ones.

## 2. What counts as an image

[useErrorsPerImage](../src/hooks/useErrorsPerImage.js) reads the route's params: an
`:iec` or a `:file`. Using the params rather than the URL means an image keeps its
errors whatever its status or DICOM type segment says, and no route needs any code
of its own.

A page with neither param has no image. Its errors aren't saved and stay on screen
until dismissed, as all errors used to. That includes moving on to an image, so an
error raised just before a redirect (`/review/nifti/vr/:vr` to its first file)
can't vanish before the curator sees it.

The hook uses a layout effect. The switch has to come before the page's own effects,
which raise the errors of the image just opened.

## 3. Two kinds of error

Pages raise their load errors on every visit, so an image's saved errors would
double up. `notify` therefore ignores an error the image already has on record,
compared by message and detail. A clear needs more thought:

| Method | Use it for | After the curator clears it |
|---|---|---|
| `notify.error` | Something that failed: a save, a submit, a load attempt | Shows again if it happens again |
| `notify.imageError` | A lasting fact about the image, raised on every visit | Stays gone for this image |

A failed save must never be hidden because an earlier one was cleared: the curator
would think the status was saved. So `imageError` is opt-in, and today it covers a
damaged NIfTI file, a missing NIfTI file, and a SEG that can't be loaded.

## 4. Why `notify` tracks the toasts itself

`ClearAllErrors` needs to know which errors are showing, and `useToasterStore` looks
like the way to find out. It can't be used here. In react-hot-toast 2.6.0, the
cleanup of `useStore` removes the first subscriber instead of its own:

```ts
const index = listeners.findIndex(([id]) => id === toasterId);
```

The first subscriber is the `<Toaster>`. So as soon as any other subscriber unmounts,
such as a toast closing, the `<Toaster>` stops receiving updates: new toasts don't
appear and closed ones never leave. `notify` keeps its own list of errors on screen,
read with `useSyncExternalStore`.

## 5. Trying it

- **No backend:** `/mira/dev/messages`. Fire several errors to see Clear all. This
  page has no image, so it shows the stacking, not the saving.
- **In a review:** a NIfTI VR route with two damaged files. Use Next and Previous,
  then Clear all, then go away and come back.

## 6. Limitations

- **In memory only.** A refresh forgets the saved errors and the clears. This is on
  purpose: a server's text can end up in an error's detail, and that shouldn't be
  written to the browser's storage.
- **A late error lands on the image on screen.** Load errors are guarded against
  this by the pages' stale checks, but a save that fails after the curator has moved
  on is saved with the next image.
- **A repeat of an error already on screen adds no toast**, so a second identical
  failure gives no new sign. The first toast is still up and still true.
- **A file too large to load counts as a failed load**, so its toast comes back on
  each visit, even after a clear.
- **Only the newest 20 toasts render** (react-hot-toast's `TOAST_LIMIT`).

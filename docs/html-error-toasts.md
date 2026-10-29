# HTML Error Toasts — Implementation Notes

Error toasts no longer show a gateway's raw HTML error page. A 502 from nginx
now reads "HTTP 502 · Bad Gateway".

**Branch:** `image-navigation-fix-develop-main`

**Commit:** Keep HTML error pages out of error toasts

**Audience:** developers touching `requestJSON` or error toasts.

**Modules:**

| File | Responsibility |
|---|---|
| [src/lib/http.js](../src/lib/http.js#L46) | `errorDetail` — keeps the status text for an HTML body |

---

## 1. The problem

`requestJSON` keeps a failed response's body as `ApiError.detail`, and
`toErrorDetail` in [notify.js:89](../src/lib/notify.js#L89) shows
"HTTP status · detail" under the toast's friendly message, truncated to 200
characters.

For an API error the body is short and useful. For a gateway error (nginx
502/503/504, when papi is down or drops the connection) the body is nginx's HTML
error page, so the toast showed `<html> <head><title>502 Bad Gateway</title>…`.

## 2. The fix

`errorDetail(response, body)`
([http.js:46](../src/lib/http.js#L46)) is used in place of the raw body
([http.js:73](../src/lib/http.js#L73)):

- body starts with `<!doctype` or `<html` (case-insensitive, leading
  whitespace allowed): use `response.statusText`, such as "Bad Gateway";
- otherwise: keep the body as before.

If the status text is empty (common over HTTP/2), the toast just shows
"HTTP 502".

This covers every request that goes through `requestJSON`.

## 3. Not changed

- The friendly message above the detail is unchanged ("Couldn't load the list.
  Please try again." and so on).
- The HTML page is no longer kept in `ApiError.detail`, so it isn't available
  for logging either. For a gateway error it carries nothing beyond the status.
- Requests that use `fetch` directly (such as `getIECInfo`) don't go through
  `requestJSON` and are unaffected.

## 4. Testing

Manual — no automated tests were added.

1. Make a `requestJSON` call fail with a gateway error (for example, stop papi
   behind nginx, or use DevTools' local overrides to return a 502 with an HTML
   body).
2. The toast shows the friendly message with "HTTP 502 · Bad Gateway" (or
   "HTTP 502") underneath, with no HTML.
3. A JSON error response still shows its body as the detail.

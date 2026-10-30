# Collapsible Side Panels — Implementation Notes

Every card in the side columns (Navigation, IEC Explorer, Tools, Details,
Segments) folds to its title bar.

**Branch:** `all-features-explorers`

**Audience:** developers adding or changing a side panel.

**Modules:**

| File | Responsibility |
|---|---|
| [src/components/CollapsiblePanel.jsx](../src/components/CollapsiblePanel.jsx) | The card: title button, folded state, remembering it |
| [src/components/CollapsiblePanel.css](../src/components/CollapsiblePanel.css) | Folded look, title button, chevron |

---

## 1. How it works

`CollapsiblePanel` renders the `.side-panel` card with its `h2#title`, as the
panels did themselves, but the title is a button. Clicking it folds the card:
`.collapsed` hides every child but the title (`display: none !important`,
since some panels set their children's display by id) and takes the card out
of the column's flex share, so the cards around it get the room.

The card's children stay direct children of `.side-panel`, exactly as before,
so no panel's own layout or CSS changed. A folded card's content stays
mounted, just hidden, so nothing reloads or loses its state on unfolding.

Each card remembers whether it's folded in `localStorage`
(`mirabelle.foldedPanels`, keyed by `panelKey`): a curator who folds Tools
keeps it folded from exam to exam, route to route, and across reloads.

The whole side columns still collapse with the ‹ › buttons, as before.

## 2. Panels

| Card | `panelKey` |
|---|---|
| Navigation | `navigation` |
| IEC Explorer | `iec-explorer` |
| Tools | `tools` |
| Details | `details` |
| Segments | `segments` |

To make a new side panel collapsible, render it as
`<CollapsiblePanel id="…" panelKey="…" title="…">` instead of a
`div.side-panel` with its own `h2#title`.

## 3. Testing

Manual — no automated tests were added.

1. Click each card's title: it folds to the title bar, the chevron turns,
   and the cards below move up. Click again: it's back as it was.
2. Fold Tools and move to the next exam, then reload: Tools is still folded.
3. Fold Details: the Reload Image and Download buttons hide with it.
4. Tab to a title and press Enter or Space: it folds and unfolds.

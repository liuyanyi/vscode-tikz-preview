# fix: prevent overlapping PDF preview renders

Resizing or zooming the preview while PDF.js is still drawing resets the same
canvas width/height. That resets its drawing context during an asynchronous
render, which can produce a shrunken figure, flipped text, or incomplete output.
Older document/page requests can also finish after a newer selection.

This change renders each request into a separate canvas and replaces the
visible canvas only after the current request completes. It cancels obsolete
render tasks, ignores stale document/page callbacks, releases replaced
documents, debounces resize events, and preserves the last completed image
while a hidden panel reports zero width. Active rendering failures are shown
in the existing error view.

Validation: `npm test` passes type checking, lint, the production build, and
8 deterministic viewer regression tests. The resize-during-render test fails
against the original viewer because it changes the dimensions of an in-use
canvas. Tests also cover out-of-order loads/pages, cancellation, hidden panels,
render failure recovery, and page navigation.

Suggested reproduction: open a TikZ preview, repeatedly resize its panel or
zoom while compilation/painting is ongoing, then switch between two figures.
The latest figure should remain upright and fully painted.

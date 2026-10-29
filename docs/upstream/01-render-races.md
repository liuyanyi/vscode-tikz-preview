# fix: prevent PDF preview corruption during overlapping renders

## Summary

The PDF preview can initially render correctly and then become shrunken, vertically flipped, or incomplete when a panel resize or zoom overlaps an unfinished PDF.js render. This PR makes rendering safe across redraws and file switches, while keeping the last completed image visible until its replacement is ready.

## Reproduction and screenshots

1. Open a TikZ PDF preview with **Fit Width** enabled.
2. Resize the preview panel while PDF.js is still drawing. Repeated resizing or zooming makes the timing easier to hit.
3. The current viewer can leave a small, vertically flipped drawing in the upper-left corner and report a concurrent-canvas error.

The screenshots below use the **same generated public PDF, final panel dimensions, PDF.js version, and resize sequence**. The original extension HTML is used for both versions.

| Before — current upstream viewer | After — this fix |
| --- | --- |
| ![Original viewer: shrunken drawing with vertically flipped text](https://raw.githubusercontent.com/liuyanyi/vscode-tikz-preview/56ca52c065dce108718dc9e5dd5d0e9a0fb6a49d/docs/upstream/assets/render-race-before.png) | ![Fixed viewer: full-size drawing with upright text](https://raw.githubusercontent.com/liuyanyi/vscode-tikz-preview/56ca52c065dce108718dc9e5dd5d0e9a0fb6a49d/docs/upstream/assets/render-race-after.png) |

These are unedited browser screenshots of the extension viewer using real PDF.js. A test-only `RenderTask.onContinue` gate pauses the first drawing task so the resize happens at a reproducible point. The harness then resumes it; the harness does not change canvas dimensions or transforms itself. The fixed result is pixel-identical to an uninterrupted render at the final panel size. [Capture script, fixture, and recorded results](https://github.com/liuyanyi/vscode-tikz-preview/tree/56ca52c065dce108718dc9e5dd5d0e9a0fb6a49d/docs/upstream).

## Why this happens

`renderPage()` currently resets `canvas.width` and `canvas.height`, then starts `page.render()` on the same canvas without tracking the previous render task.

If another redraw arrives before that task finishes:

1. Resetting the canvas dimensions clears its bitmap and drawing state, including the coordinate transform used by PDF.js. This reset is required by the [canvas specification](https://html.spec.whatwg.org/multipage/canvas.html#concept-canvas-set-bitmap-dimensions).
2. The new render tries to use a canvas that the previous task still owns. [PDF.js rejects concurrent rendering on one canvas](https://mozilla.github.io/pdf.js/api/draft/api.js.html).
3. The earlier task can continue against the reset context, producing the wrong scale and orientation shown above.

A resize debounce reduces the frequency but cannot protect zoom requests, document replacements, or late `getPage()` callbacks. Rendering needs explicit task ownership and a check that each asynchronous result still belongs to the latest request.

## Changes

- Render each request into a separate canvas; publish it only after the latest request finishes successfully.
- Cancel obsolete render tasks and ignore stale document/page callbacks using revision checks.
- Destroy replaced document-loading tasks to release their resources.
- Debounce resize events and skip zero-width hidden panels while preserving the last completed image.
- Report active rendering failures through the existing error view.
- Add eight deterministic regression tests and a Windows/Linux test workflow.

The render fix remains independent of the compilation-status UI planned separately.

## Verification

- `npm test` on the render-fix branch: type check, lint, production build, and **8/8 regression tests passed**.
- Tests cover resize during drawing, resize bursts, out-of-order document/page results, hidden panels, rapid zoom, error recovery, and page navigation.
- Browser reproduction with **PDF.js 5.7.284 and Chromium 156.0.8078.4**: the original viewer reproduces the corruption and concurrent-canvas error; the fixed viewer cancels the obsolete task, produces no browser error, and matches the uninterrupted baseline pixel for pixel.

The screenshot harness runs the viewer in Chromium. It is separate from a full interactive VS Code session.

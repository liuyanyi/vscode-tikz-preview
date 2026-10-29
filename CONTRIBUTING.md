# Contributing

Use Node.js 22 or newer. Run `npm ci`, then `npm test` to type-check, lint,
build, and run deterministic host/viewer regression tests.

For browser coverage, run `npx playwright install chromium`, then
`npm run test:browser`. Linux CI may need `npx playwright install --with-deps chromium`.
The browser tests serve the HTML generated from `src/preview.ts` and use the
bundled PDF.js viewer, with generated PDF fixtures. They cover DOM state and
pixel stability, rather than a complete VS Code extension-host session.

To manually inspect the extension in VS Code, launch this repository using
Run Extension (F5), open an example in `examples/`, and run `TikZ: Preview`.
Install a TeX distribution and select its compiler through `tikz-preview.latexCommand`.
Check initial loading, alternating files, zooming, resizing, and compilation
errors. Do not commit personal paths, private figures, or TeX installations.

`npm run vsix` creates the community package in `artifacts/`. Disable the upstream
extension while testing it, because the command/settings identifiers are shared.

# Upstream contribution preparation

Upstream: https://github.com/wangjiezhe/vscode-tikz-preview

Base revision: `08d06184b74e3580cd9237e8172eeac90a3b99b4`.

| Branch | Scope | Target |
| --- | --- | --- |
| `codex/fix-preview-render-races` | Atomic canvas publication and cancellation | Upstream `main` |
| `codex/preview-loading` | Compilation/rendering status, readiness, localization and browser tests | Upstream `main`, after PR 1 |
| `codex/community-vsix` | Fork identity, VSIX packaging and contribution documents | This fork only |

PR text is in [01-render-races.md](01-render-races.md) and
[02-loading-status.md](02-loading-status.md). The loading branch includes the
render-fix commit. After PR 1 is merged, rebase its loading commit onto upstream
`main` before opening PR 2, so the second review contains only its feature.
If PR 1 is squash-merged, use `git rebase --onto upstream/main codex/fix-preview-render-races codex/preview-loading`.

Do not include the community publisher/version or VSIX packaging commit in
either upstream PR. The regression tests use source-relative paths and public
generated fixtures, with no installed-extension or local thesis dependency.

Validation on Windows: type check, lint, 18 Node tests, and 2 Chromium/PDF.js
browser tests passed. The browser tests check loading phases and final pixel
equality after rapid zoom, resize, hidden-panel and file-switch requests.
The loading and rendered screenshots were inspected. This is browser-backed
viewer testing, not a complete interactive VS Code acceptance test. The CI
workflow also schedules Node tests on Linux and Windows; those remote runs
have not yet been checked.

These files prepare the submissions. No upstream pull request is created by
the build or packaging commands.

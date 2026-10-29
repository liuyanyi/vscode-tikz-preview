# feat: show compilation and rendering status in PDF previews

When switching TikZ files, the preview currently keeps showing the previous
figure until the new compilation finishes. Users cannot tell whether the
selection was received or the preview is still working.

This change immediately shows a spinner and selected file name when compilation
starts, then changes to a rendering phase until the new PDF is fully painted.
Compilation, template-read, PDF-load, and rendering errors stop loading and
show an error. Stale work cannot hide a newer file's status. A webview readiness
message replays the latest state so initial loading/completion messages are not
lost before the viewer subscribes.

New phase strings use VS Code localization with a Simplified Chinese bundle.
The indicator uses theme colors, an accessible status region, and a slower
animation for reduced-motion preferences. Existing commands/settings and SVG
preview behavior remain compatible.

This feature is based on the render-race fix and should be rebased after that
change is merged.

Validation: type check, lint, production build, 18 Node tests and 2 real
Chromium/PDF.js tests pass on Windows. Browser tests generate public PDF
fixtures and verify loading transitions plus identical final pixels after
zoom/resize/hide/file-switch stress. Loading and rendered screenshots were
inspected. This does not claim a complete interactive VS Code session or
executed Linux/macOS validation.

# TikZ Preview

Live preview for TikZ files in VS Code — like KtikZ, but inside your editor. Supports both **PDF** and **SVG** preview modes.

[中文说明](README.zh-CN.md)

Edit `.tikz`, `.pgf`, or `.tkz` files and see the compiled PDF update in a side panel.

## Features

- **Live preview** — auto-compiles on file changes (1s debounce)
- **Configurable compiler** — supports `pdflatex`, `lualatex`, `xelatex`, shell-escape
- **Template system** — use custom `.pgs` template files, or the bundled default (from KtikZ's `template_example.pgs`)
- **Zoom controls** — zoom in/out, fit-to-width, or type a percentage manually
- **Error display** — compilation errors shown inline in the preview panel
- **Loading status** — shows the selected file while compiling and rendering, with stale results discarded
- **SVG preview** — optional SVG mode via `jock.svg` extension (pdftocairo/pdf2svg conversion)
- **Dark theme** — preview panel matches VS Code's dark interface

## Screenshots

**PDF preview:**

![PDF preview](https://raw.githubusercontent.com/wangjiezhe/vscode-tikz-preview/main/screenshots/preview-pdf.png)

**SVG preview:**

![SVG preview](https://raw.githubusercontent.com/wangjiezhe/vscode-tikz-preview/main/screenshots/preview-svg.png)

The screenshots above use the following template (`tkz-elements.pgs`):

```latex
% !TEX TS-program = lualatex
\documentclass{article}
\usepackage{mathptmx}
\usepackage[dvipsnames,svgnames]{xcolor}
\usepackage[mini]{tkz-euclide}
\usepackage{tkz-elements}
\usepackage{tkz-fct}
\tikzset {
  dots/.style={shape=circle, color=#1!30!black, fill=#1!70!black, minimum size=2},
  dots/.default=black,
  lines/.style={line width=0.8pt, color=#1},
  lines/.default=black,
  helplines/.style={line width=0.8pt, color=#1, densely dashed},
  helplines/.default=green!70!black
}
\usepackage[active,pdftex,tightpage]{preview}
\PreviewEnvironment[]{tikzpicture}
\PreviewEnvironment[]{pgfpicture}
\DeclareSymbolFont{symbolsb}{OMS}{cmsy}{m}{n}
\SetSymbolFont{symbolsb}{bold}{OMS}{cmsy}{b}{n}
\DeclareSymbolFontAlphabet{\mathcal}{symbolsb}
\begin{document}
<>
\end{document}
```

## Requirements

- A LaTeX distribution with `pdflatex` (or your chosen compiler, like `lualatex`) on `PATH`
- **SVG preview mode** requires `pdftocairo` (from [poppler](https://poppler.freedesktop.org/)) or [`pdf2svg`](https://github.com/dawbarton/pdf2svg/) on `PATH`
- VS Code 1.120+

## Extension Settings

| Setting | Type | Default | Description |
|---|---|---|---|
| `tikz-preview.latexCommand` | `string` | `pdflatex` | LaTeX compiler command |
| `tikz-preview.shellEscape` | `boolean` | `false` | Pass `-shell-escape` flag |
| `tikz-preview.templatePath` | `string` | `""` | Path to a `.pgs` template file (empty = bundled default) |
| `tikz-preview.templatePlaceholder` | `string` | `<>` | String in template replaced with document content |
| `tikz-preview.autoOpen` | `boolean` | `false` | Auto-open preview when switching to a matching file |
| `tikz-preview.autoOpenExtensions` | `string[]` | `[".tikz", ".pgf", ".tkz"]` | Extensions that trigger auto preview |
| `tikz-preview.previewMode` | `string` | `"pdf"` | Preview mode: `"pdf"` (built-in) or `"svg"` (via jock.svg) |
| `tikz-preview.svgConverter` | `string` | `"pdftocairo"` | PDF-to-SVG converter: `"pdftocairo"` or `"pdf2svg"` |

## Usage

The configuration and usage follow the same pattern as [KtikZ](https://github.com/fhackenberger/ktikz). If you are familiar with KtikZ, you already know how to use this extension.

1. Open a `.tikz`, `.pgf`, or `.tkz` file
2. Run `TikZ: Preview` from the command palette, or click the bolt icon in the editor toolbar
3. The preview opens in a side panel and updates as you edit

Templates use a placeholder (default `<>`) that is replaced with your document content before compilation. All compilation happens in a temp directory — your workspace stays clean.

## Known Issues

- PDF.js runs in main-thread mode to avoid CSP restrictions with web workers

## Development and tests

Use Node.js 22 or newer. `npm ci` installs the locked dependencies and `npm test`
runs type checking, linting, the production build, and deterministic viewer/host tests.

For real PDF.js rendering in Chromium, run `npx playwright install chromium`, then
`npm run test:browser`. These tests generate public PDF fixtures, check the loading
states, and compare final pixels after resize, zoom, hidden-panel and file-switch
stress. They require no TeX installation or local extension installation.

## Release Notes

### 0.3.2

Use absolute URLs for screenshot images and exclude them from the extension bundle.

### 0.3.1

Improved documentation — screenshots, template, SVG dependency, and KtikZ reference.

### 0.3.0

Workspace trust guard, smarter recompilation, SVG preview state management.

### 0.2.1

Extension dependency declaration, release skill, minor fixes.

### 0.2.0

SVG preview mode via jock.svg, PDF-to-SVG conversion, Chinese docs.

### 0.1.0

Initial release — live TikZ preview with template support, zoom controls, and configurable compilation.

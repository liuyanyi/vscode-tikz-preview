# TikZ Preview

这是基于 [wangjiezhe/vscode-tikz-preview](https://github.com/wangjiezhe/vscode-tikz-preview) 的社区构建，源码位于 [liuyanyi/vscode-tikz-preview](https://github.com/liuyanyi/vscode-tikz-preview)，保留原作者与 MIT 许可。

运行 `npm ci`、`npm run vsix` 后，通过 **Extensions: Install from VSIX** 安装 `artifacts/tikz-preview-community-0.3.3.vsix`。社区构建标识为 `liuyanyi.vscode-tikz-preview`，目前提供 VSIX，不代表已经上架 Marketplace 或注册发布者。

启用社区构建前，请禁用原插件 `wangjiezhe.vscode-tikz-preview`。两者沿用相同命令和设置以兼容已有配置，不能同时启用。切换后执行 **Developer: Reload Window**；现有 `tikz-preview.*` 设置可继续使用。

切换图源或重新编译时会显示当前文件名和加载提示，区分编译与预览渲染阶段；新图完整绘制后再显示，过期结果不会覆盖当前文件。

开发验证：使用 Node.js 22 或更新版本，运行 `npm ci`、`npm test`。浏览器回归测试先运行 `npx playwright install chromium`，再运行 `npm run test:browser`；测试使用公开生成的 PDF 示例，不依赖本机 TeX、已安装插件或个人文件。

在 VS Code 中实时预览 TikZ 文件 — 类似 KtikZ，但集成在编辑器内。同时支持 **PDF** 和 **SVG** 两种预览模式。

编辑 `.tikz`、`.pgf` 或 `.tkz` 文件，在侧边面板中查看编译后的 PDF。

## 功能

- **实时预览** — 文件修改后自动编译（1 秒防抖）
- **可配置编译器** — 支持 `pdflatex`、`lualatex`、`xelatex`，可开启 shell-escape
- **模板系统** — 使用自定义 `.pgs` 模板文件，或使用内置默认模板（来自 KtikZ 的 `template_example.pgs`）
- **缩放控制** — 放大/缩小、适应宽度、手动输入百分比
- **错误显示** — 编译错误直接显示在预览面板中
- **SVG 预览** — 可选 SVG 模式，通过 `jock.svg` 扩展显示（pdftocairo/pdf2svg 转换）
- **深色主题** — 预览面板与 VS Code 深色界面一致

## 屏幕截图

**PDF 预览：**

![PDF 预览](https://raw.githubusercontent.com/wangjiezhe/vscode-tikz-preview/main/screenshots/preview-pdf.png)

**SVG 预览：**

![SVG 预览](https://raw.githubusercontent.com/wangjiezhe/vscode-tikz-preview/main/screenshots/preview-svg.png)

以上截图使用了以下模板（`tkz-elements.pgs`）：

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

## 依赖

- 系统需安装 LaTeX 发行版，`pdflatex`（或你选择的编译器，例如`lualatex`）需在 `PATH` 中
- **SVG 预览模式**需要 `PATH` 中包含 `pdftocairo`（来自 [poppler](https://poppler.freedesktop.org/)）或 [`pdf2svg`](https://github.com/dawbarton/pdf2svg/)
- VS Code 1.120+

## 扩展设置

| 设置项 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `tikz-preview.latexCommand` | `string` | `pdflatex` | LaTeX 编译器命令 |
| `tikz-preview.shellEscape` | `boolean` | `false` | 传递 `-shell-escape` 参数 |
| `tikz-preview.templatePath` | `string` | `""` | `.pgs` 模板文件路径（留空使用内置默认模板） |
| `tikz-preview.templatePlaceholder` | `string` | `<>` | 模板中将被替换为文档内容的字符串 |
| `tikz-preview.autoOpen` | `boolean` | `false` | 切换到匹配文件时自动打开预览 |
| `tikz-preview.autoOpenExtensions` | `string[]` | `[".tikz", ".pgf", ".tkz"]` | 触发自动预览的文件扩展名 |
| `tikz-preview.previewMode` | `string` | `"pdf"` | 预览模式：`"pdf"`（内置预览）或 `"svg"`（通过 jock.svg） |
| `tikz-preview.svgConverter` | `string` | `"pdftocairo"` | PDF 转 SVG 工具：`"pdftocairo"` 或 `"pdf2svg"` |

## 使用方法

配置和使用方法与 [KtikZ](https://github.com/fhackenberger/ktikz) 相同。如果你熟悉 KtikZ，就已经知道如何使用本扩展。

1. 打开一个 `.tikz`、`.pgf` 或 `.tkz` 文件
2. 在命令面板中运行 `TikZ: Preview`，或点击编辑器工具栏的闪电图标
3. 预览将在侧边面板中打开，并随编辑实时更新

模板使用占位符（默认为 `<>`），编译前会被替换为你的文档内容。所有编译工作在临时目录中进行，不会污染工作区。

## 已知问题

- PDF.js 在主线程模式下运行，以规避 CSP 对 Web Worker 的限制

## 版本说明

### 0.3.2

截图使用绝对路径 URL，并从扩展包中排除。

### 0.3.1

文档改进 — 截图、模板内容、SVG 依赖说明和 KtikZ 参考。

### 0.3.0

工作区信任保护、智能重编译、SVG 预览状态管理。

### 0.2.1

扩展依赖声明、Release skill、小修复。

### 0.2.0

SVG 预览模式、PDF 转 SVG 支持、中文文档。

### 0.1.0

初始版本 — Live TikZ Preview，支持模板系统、缩放控制和可配置编译。

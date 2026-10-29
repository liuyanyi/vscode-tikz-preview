import * as vscode from 'vscode';

type PreviewState =
    | { type: 'loading'; fileName: string }
    | { type: 'render'; pdfPath: string }
    | { type: 'error'; message: string };

export class PreviewManager {
    private panel: vscode.WebviewPanel | null = null;
    private outputChannel: vscode.OutputChannel;
    private lastState: PreviewState | null = null;

    constructor(private extensionUri: vscode.Uri) {
        this.outputChannel = vscode.window.createOutputChannel('TikZ Preview');
    }

    show(title: string, localResourceRoot: string): void {
        if (this.panel) {
            this.panel.title = `${title} - Preview`;
            this.panel.reveal(vscode.ViewColumn.Beside, true);
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'tikzPreview',
            `${title} - Preview`,
            { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.extensionUri, 'media'),
                    vscode.Uri.file(localResourceRoot),
                ],
            }
        );

        this.panel.onDidDispose(() => {
            this.panel = null;
            this.lastState = null;
        });
        this.panel.webview.onDidReceiveMessage(message => {
            if (message?.type === 'ready' && this.lastState) {
                void this.panel?.webview.postMessage(this.lastState);
            }
        });

        this.panel.webview.html = this.buildHtml();
    }

    isVisible(): boolean {
        return this.panel !== null;
    }

    private postState(state: PreviewState): void {
        this.lastState = state;
        void this.panel?.webview.postMessage(state);
    }

    showLoading(fileName: string): void {
        this.postState({ type: 'loading', fileName });
    }

    render(pdfPath: string): void {
        if (!this.panel) { return; }
        const uri = this.panel.webview.asWebviewUri(vscode.Uri.file(pdfPath));
        this.postState({ type: 'render', pdfPath: uri.toString() });
    }

    showError(message: string): void {
        this.outputChannel.clear();
        this.outputChannel.appendLine(message);
        this.postState({ type: 'error', message });
    }

    private buildHtml(): string {
        const strings = JSON.stringify({
            compiling: vscode.l10n.t('Compiling…'),
            rendering: vscode.l10n.t('Rendering preview…'),
        }).replace(/</g, '\\u003c');
        const pdfjsUri = this.panel!.webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'media', 'pdf.min.js')
        );
        const workerUri = this.panel!.webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'media', 'pdf.worker.min.js')
        );
        const viewerJsUri = this.panel!.webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'media', 'viewer.js')
        );

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' ${this.panel!.webview.cspSource}; connect-src ${this.panel!.webview.cspSource}; worker-src ${this.panel!.webview.cspSource}; style-src 'unsafe-inline' ${this.panel!.webview.cspSource}; img-src ${this.panel!.webview.cspSource} data:;">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #1e1e1e; color: #ccc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; flex-direction: column; height: 100vh; }
.toolbar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: #252526; border-bottom: 1px solid #3e3e3e; flex-shrink: 0; }
.toolbar button { background: #3e3e3e; color: #ccc; border: none; padding: 4px 10px; border-radius: 3px; cursor: pointer; font-size: 13px; }
.toolbar button:hover { background: #505050; }
.toolbar span { font-size: 13px; }
.toolbar input { background: #3e3e3e; color: #ccc; border: none; padding: 4px 6px; border-radius: 3px; font-size: 13px; text-align: center; width: 55px; }
.toolbar input:focus { outline: 1px solid #007acc; }
.viewport { flex: 1; overflow: auto; display: flex; justify-content: center; padding: 16px; }
canvas { box-shadow: 0 0 10px rgba(0,0,0,.5); flex-shrink: 0; }
.error { color: #f48771; padding: 16px; white-space: pre-wrap; font-family: monospace; font-size: 12px; flex: 1; overflow: auto; }
.loading { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 24px; min-height: 160px; color: var(--vscode-foreground, #ccc); }
.loading-spinner { width: 28px; height: 28px; border: 3px solid var(--vscode-widget-border, #454545); border-top-color: var(--vscode-progressBar-background, #75beff); border-radius: 50%; animation: preview-spin .8s linear infinite; }
.loading-file { color: var(--vscode-descriptionForeground, #aaa); font-family: monospace; font-size: 12px; max-width: 100%; overflow-wrap: anywhere; text-align: center; }
@keyframes preview-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .loading-spinner { animation-duration: 2s; } }
.hidden { display: none !important; }
</style>
</head>
<body>
<div class="toolbar">
  <button id="zoomOut">−</button>
  <input id="zoomLevel" type="text" value="100%" size="5">
  <button id="zoomIn">+</button>
  <button id="fitWidth">Fit Width</button>
  <span id="pageInfo" style="margin-left:auto"></span>
  <button id="prevPage" class="hidden">◀</button>
  <button id="nextPage" class="hidden">▶</button>
</div>
<div class="loading" id="loading" role="status" aria-live="polite">
  <div class="loading-spinner" aria-hidden="true"></div>
  <div id="loadingText">Compiling…</div>
  <div class="loading-file" id="loadingFile"></div>
</div>
<div class="viewport hidden" id="viewport">
  <canvas id="canvas"></canvas>
</div>
<div id="error" class="error hidden"></div>
<script type="module" src="${pdfjsUri.toString()}"></script>
<script>globalThis.WORKER_SRC_PLACEHOLDER = '${workerUri.toString()}'; globalThis.PREVIEW_STRINGS = ${strings};</script>
<script type="module" src="${viewerJsUri.toString()}"></script>
</body>
</html>`;
    }

    dispose(): void {
        if (this.panel) {
            this.panel.dispose();
            this.panel = null;
        }
        this.outputChannel.dispose();
    }
}

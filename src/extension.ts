import * as path from 'path';
import * as vscode from 'vscode';
import { Compiler, type CompileResult } from './compiler';
import { PreviewManager } from './preview';

export function activate(context: vscode.ExtensionContext) {
    console.log('TikZ Preview extension activated');

    const compiler = new Compiler(context.extensionUri);
    const preview = new PreviewManager(context.extensionUri);

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let svgActive = false;
    let activeSvgUri: vscode.Uri | null = null;
    let activeSvgLabel: string | null = null;
    let compileSequence = 0;

    function getAutoExtensions(): Set<string> {
        const cfg = vscode.workspace.getConfiguration('tikz-preview');
        const exts = cfg.get<string[]>('autoOpenExtensions', ['.tikz', '.pgf', '.tkz']);
        return new Set(exts);
    }

    function getConfig() {
        const cfg = vscode.workspace.getConfiguration('tikz-preview');
        return {
            latexCommand: cfg.get<string>('latexCommand', 'pdflatex'),
            shellEscape: cfg.get<boolean>('shellEscape', false),
            templatePath: cfg.get<string>('templatePath', ''),
            placeholder: cfg.get<string>('templatePlaceholder', '<>'),
            autoOpen: cfg.get<boolean>('autoOpen', false),
            previewMode: cfg.get<string>('previewMode', 'pdf'),
            svgConverter: cfg.get<string>('svgConverter', 'pdftocairo'),
        };
    }

    function isTikzFile(editor: vscode.TextEditor | undefined): boolean {
        if (!editor) { return false; }
        const ext = editor.document.fileName.match(/\.\w+$/)?.[0] ?? '';
        return getAutoExtensions().has(ext);
    }

    function shouldCompile(config = getConfig()): boolean {
        return config.autoOpen
            || svgActive
            || preview.isVisible();
    }

    function tabInputUri(input: vscode.Tab['input']): vscode.Uri | undefined {
        if (
            input instanceof vscode.TabInputText ||
            input instanceof vscode.TabInputCustom ||
            input instanceof vscode.TabInputNotebook
        ) {
            return input.uri;
        }

        if (input instanceof vscode.TabInputTextDiff || input instanceof vscode.TabInputNotebookDiff) {
            return input.modified;
        }

        return undefined;
    }

    function isActiveSvgTab(tab: vscode.Tab): boolean {
        const uri = tabInputUri(tab.input);
        if (activeSvgUri && uri && uri.toString() === activeSvgUri.toString()) {
            return true;
        }

        return !!activeSvgLabel && tab.label.includes(activeSvgLabel);
    }

    async function doCompile(editor: vscode.TextEditor) {
        if (!vscode.workspace.isTrusted) {
            preview.showError('TikZ Preview is disabled in untrusted workspaces.');
            return;
        }

        const sequence = ++compileSequence;
        const config = getConfig();
        const text = editor.document.getText();
        const baseName = path.basename(editor.document.fileName, path.extname(editor.document.fileName));
        if (config.previewMode === 'pdf') {
            preview.showLoading(path.basename(editor.document.fileName));
        }
        let result: CompileResult;
        try {
            result = await compiler.compile(
                text,
                config.templatePath,
                config.placeholder,
                config.latexCommand,
                config.shellEscape,
                baseName
            );
        } catch (error) {
            if (sequence === compileSequence) {
                preview.showError(error instanceof Error ? error.message : String(error));
            }
            return;
        }

        if (sequence !== compileSequence) {
            return;
        }

        if ('pdfPath' in result) {
            if (config.previewMode === 'svg') {
                try {
                    const svgPath = await compiler.convertToSvg(result.pdfPath, baseName, config.svgConverter);
                    if (sequence !== compileSequence) {
                        return;
                    }

                    activeSvgUri = vscode.Uri.file(svgPath);
                    activeSvgLabel = path.basename(svgPath);
                    if (config.autoOpen || svgActive) {
                        await vscode.commands.executeCommand('_svg.showSvgByUri', activeSvgUri);
                    }
                } catch (err) {
                    if (sequence !== compileSequence) {
                        return;
                    }
                    preview.showError((err as Error).message);
                }
            } else {
                preview.render(result.pdfPath);
            }
        } else {
            preview.showError(result.error);
        }
    }

    function triggerCompile(editor: vscode.TextEditor) {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => {
            debounceTimer = null;
            if (vscode.window.activeTextEditor?.document !== editor.document || !shouldCompile()) {
                return;
            }
            doCompile(editor);
        }, 1000);
    }

    // Command: manual preview toggle
    const previewCommand = vscode.commands.registerCommand('tikz-preview.preview', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }
        const config = getConfig();
        if (config.previewMode === 'pdf') {
            preview.show(editor.document.fileName, compiler.ensureTempDir());
        } else {
            svgActive = true;
        }
        doCompile(editor);
    });
    context.subscriptions.push(previewCommand);

    // Update preview when switching to a TikZ file
    const activeEditorChange = vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
        }

        if (editor && isTikzFile(editor)) {
            const config = getConfig();
            if (shouldCompile(config)) {
                if (config.previewMode === 'pdf') {
                    preview.show(editor.document.fileName, compiler.ensureTempDir());
                }
                doCompile(editor);
            }
        }
    });
    context.subscriptions.push(activeEditorChange);

    const tabChange = vscode.window.tabGroups.onDidChangeTabs((e) => {
        if (e.closed.some(isActiveSvgTab)) {
            svgActive = false;
            activeSvgUri = null;
            activeSvgLabel = null;
        }
    });
    context.subscriptions.push(tabChange);

    // Re-compile on document change
    const textChange = vscode.workspace.onDidChangeTextDocument((e) => {
        const editor = vscode.window.activeTextEditor;
        if (
            editor &&
            e.document === editor.document &&
            isTikzFile(editor) &&
            shouldCompile()
        ) {
            triggerCompile(editor);
        }
    });
    context.subscriptions.push(textChange);

    // Check if active editor is already a TikZ file on activation
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && isTikzFile(activeEditor)) {
        const config = getConfig();
        if (shouldCompile(config)) {
            if (config.previewMode === 'pdf') {
                preview.show(activeEditor.document.fileName, compiler.ensureTempDir());
            }
            doCompile(activeEditor);
        }
    }

    context.subscriptions.push({
        dispose: () => {
            compiler.dispose();
            preview.dispose();
        },
    });
}

export function deactivate() {}

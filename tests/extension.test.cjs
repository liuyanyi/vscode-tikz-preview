const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {EventEmitter} = require('node:events');
const {test} = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../dist/extension.js'), 'utf8');
const flush = async () => { for (let i = 0; i < 12; ++i) await Promise.resolve(); };
const integration = test;

function fixture({templateError = false} = {}) {
    const messages = [], processes = [], handlers = {}, commands = new Map();
    const uri = value => ({fsPath: value, toString: () => value});
    let panel;
    const vscode = {
        l10n: {t: value => value},
        Uri: {file: uri, joinPath: (base, ...parts) => uri(path.posix.join(base.fsPath, ...parts))},
        ViewColumn: {Beside: 2},
        workspace: {
            isTrusted: true,
            getConfiguration: () => ({get: (name, fallback) => fallback}),
            onDidChangeTextDocument: fn => {handlers.change = fn; return {};}
        },
        window: {
            activeTextEditor: null,
            createOutputChannel: () => ({clear() {}, appendLine() {}, dispose() {}}),
            createWebviewPanel: () => {
                panel = {title: '', reveal() {}, onDidDispose: fn => {handlers.dispose = fn;},
                    webview: {cspSource: 'test-resource:', asWebviewUri: value => value,
                        postMessage: value => {messages.push(value); return Promise.resolve(true);},
                        onDidReceiveMessage: fn => {handlers.message = fn;}}};
                return panel;
            },
            onDidChangeActiveTextEditor: fn => {handlers.active = fn; return {};},
            tabGroups: {onDidChangeTabs: () => ({})}
        },
        commands: {registerCommand: (name, fn) => {commands.set(name, fn); return {};}}
    };
    const dependencies = {
        vscode, path,
        os: {tmpdir: () => '/tmp'},
        fs: {mkdtempSync: () => '/tmp/tikz-preview-test', writeFileSync() {},
            existsSync: () => true, readFileSync: () => { if (templateError) throw new Error('Template is unreadable'); return '<>'; }, statSync: () => ({isFile: () => true})},
        child_process: {spawn() {
            const process = new EventEmitter();
            process.stdout = new EventEmitter(); process.stderr = new EventEmitter();
            process.kill = () => {};
            processes.push(process);
            return process;
        }}
    };
    const module = {exports: {}};
    vm.runInNewContext(source, {module, console: {log() {}}, setTimeout, clearTimeout,
        require: name => {assert.ok(name in dependencies, name); return dependencies[name];}});
    module.exports.activate({extensionUri: uri('/extension'), subscriptions: []});
    return {messages, processes, handlers, get panel() {return panel;},
        select(name, open = false) {
            const editor = {document: {fileName: '/figures/' + name, getText: () => 'figure'}};
            vscode.window.activeTextEditor = editor;
            if (open) commands.get('tikz-preview.preview')();
            else handlers.active(editor);
        }};
}

integration('compiler announces the selected file before starting the process', async () => {
    const f = fixture();
    f.select('当前图.tikz', true);
    assert.equal(f.processes.length, 1);
    assert.equal(f.messages[0].type, 'loading');
    assert.equal(f.messages[0].fileName, '当前图.tikz');
    assert.match(f.panel.webview.html, /class="loading" id="loading" role="status"/);
    assert.match(f.panel.webview.html, /loading-spinner/);
    f.processes[0].emit('close', 0); await flush();
    assert.equal(f.messages.at(-1).type, 'render');
});

integration('webview readiness replays the current compilation or finished render', async () => {
    const f = fixture();
    f.select('first.tikz', true);
    f.handlers.message({type: 'ready'});
    assert.equal(f.messages.at(-1).type, 'loading');
    f.processes[0].emit('close', 0); await flush();
    const rendered = f.messages.at(-1);
    f.handlers.message({type: 'ready'});
    assert.equal(f.messages.at(-1), rendered);
    assert.equal(rendered.type, 'render');
});

integration('rapid file switches keep the newest loading state until its own compilation finishes', async () => {
    const f = fixture();
    f.select('old.tikz', true);
    f.select('new.tikz');
    assert.equal(f.messages.at(-1).fileName, 'new.tikz');
    f.processes[0].emit('close', 1); await flush();
    assert.equal(f.messages.at(-1).type, 'loading');
    assert.equal(f.messages.at(-1).fileName, 'new.tikz');
    f.processes[1].emit('close', 0); await flush();
    assert.equal(f.messages.at(-1).type, 'render');
    assert.match(f.messages.at(-1).pdfPath, /new\.pdf$/);
});

integration('compilation failure replaces loading with the error and survives webview readiness', async () => {
    const f = fixture();
    f.select('bad.tikz', true);
    f.processes[0].stdout.emit('data', '! Compilation failed\nl.1');
    f.processes[0].emit('close', 1); await flush();
    assert.equal(f.messages.at(-1).type, 'error');
    assert.match(f.messages.at(-1).message, /Compilation failed/);
    f.handlers.message({type: 'ready'});
    assert.equal(f.messages.at(-1).type, 'error');
});

integration('template read failures stop loading even before a compiler can start', async () => {
    const f = fixture({templateError: true});
    f.select('bad-template.tikz', true);
    await flush();
    assert.equal(f.processes.length, 0);
    assert.equal(f.messages.at(-1).type, 'error');
    assert.match(f.messages.at(-1).message, /Template is unreadable/);
});

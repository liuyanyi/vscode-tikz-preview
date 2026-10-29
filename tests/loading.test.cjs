const assert = require('node:assert/strict');
const {test} = require('node:test');
const {fixture, flush} = require('./helpers/viewer.cjs');

test('switching files immediately replaces the old figure with compilation status and file name', async () => {
    const f = fixture();
    await f.load('old'); await f.finish();
    f.message({type: 'loading', fileName: '另一张图.tikz'});
    assert.equal(f.elements.get('loading').classList.contains('hidden'), false);
    assert.equal(f.elements.get('viewport').classList.contains('hidden'), true);
    assert.equal(f.elements.get('loadingText').textContent, 'Compiling…');
    assert.equal(f.elements.get('loadingFile').textContent, '另一张图.tikz');
    assert.equal(f.elements.get('zoomIn').disabled, true);
    await f.load('new');
    assert.equal(f.elements.get('loadingText').textContent, 'Rendering preview…');
    assert.equal(f.elements.get('loading').classList.contains('hidden'), false);
    assert.equal(f.elements.get('viewport').classList.contains('hidden'), true);
    await f.finish();
    assert.equal(f.elements.get('loading').classList.contains('hidden'), true);
    assert.equal(f.elements.get('viewport').classList.contains('hidden'), false);
    assert.equal(f.elements.get('zoomIn').disabled, false);
});

test('a pending old render cannot dismiss the new compilation indicator', async () => {
    const f = fixture();
    await f.load('old');
    f.message({type: 'loading', fileName: 'new.tikz'});
    await f.finish();
    assert.equal(f.publications.length, 0);
    assert.equal(f.elements.get('loading').classList.contains('hidden'), false);
    assert.equal(f.elements.get('loadingFile').textContent, 'new.tikz');
    f.message({type: 'error', message: 'Compilation failed'});
    assert.equal(f.elements.get('loading').classList.contains('hidden'), true);
    assert.equal(f.elements.get('error').textContent, 'Compilation failed');
});

test('the webview announces readiness so the host can resend the latest state', () => {
    const f = fixture();
    assert.equal(f.outgoing.length, 1);
    assert.equal(f.outgoing[0].type, 'ready');
});

test('loading messages use the localized strings supplied by the host', () => {
    const f = fixture({strings: {compiling: '正在编译…', rendering: '正在生成预览…'}});
    f.message({type: 'loading', fileName: 'sample.tikz'});
    assert.equal(f.elements.get('loadingText').textContent, '正在编译…');
    f.message({type: 'render', pdfPath: 'sample.pdf'});
    assert.equal(f.elements.get('loadingText').textContent, '正在生成预览…');
});

test('PDF loading failures dismiss the spinner and leave a readable error', async () => {
    const f = fixture();
    f.message({type: 'render', pdfPath: 'missing.pdf'});
    f.loads[0].reject(new Error('missing PDF'));
    await flush();
    assert.equal(f.elements.get('loading').classList.contains('hidden'), true);
    assert.match(f.elements.get('error').textContent, /missing PDF/);
});

const assert = require('node:assert/strict');
const {test} = require('node:test');
const {fixture, flush, deferred} = require('./helpers/viewer.cjs');

test('resize during drawing never resets an in-use canvas or publishes a partial image', async () => {
    const f = fixture();
    const initialCanvas = f.elements.get('canvas');
    await f.load();
    const first = f.renders[0];
    assert.equal(f.elements.get('canvas'), initialCanvas);
    f.resize(600); f.tick(); await flush();
    assert.equal(f.unsafeResizes.length, 0, 'resetting the live canvas corrupts PDF.js transforms');
    assert.equal(first.cancelled, true);
    assert.notEqual(f.renders.at(-1).canvas, first.canvas);
    assert.equal(f.publications.length, 0);
    await f.finish();
    assert.equal(f.publications.length, 1);
    assert.equal(f.elements.get('canvas').style.width, '540px');
    assert.equal(f.elements.get('canvas').width, 1080);
});

test('a burst of resize events produces one render at the final width', async () => {
    const f = fixture();
    await f.load(); await f.finish();
    for (let i = 0; i < 50; ++i) f.resize(700 + i);
    f.tick(); await flush(); await f.finish();
    assert.equal(f.renders.length, 2);
    assert.equal(f.elements.get('canvas').style.width, (749 * 0.9) + 'px');
});

test('late PDF loads cannot replace the newest figure and old resources are released', async () => {
    const f = fixture();
    f.message({type: 'render', pdfPath: 'old'});
    f.message({type: 'render', pdfPath: 'new'});
    f.loads[1].resolve(f.makePdf('new'));
    await flush(); await f.finish();
    const newest = f.elements.get('canvas');
    f.loads[0].resolve(f.makePdf('old'));
    await flush(); await f.finish();
    assert.equal(f.loads[0].destroyed, true);
    assert.equal(f.elements.get('canvas'), newest);
    assert.deepEqual(f.renders.map(render => render.name), ['new']);
});

test('late getPage callbacks are ignored after switching figures', async () => {
    const f = fixture(), pageDelay = deferred();
    await f.load('old', {pageDelay});
    await f.load('new'); await f.finish();
    pageDelay.resolve();
    await flush(); await f.finish();
    assert.deepEqual(f.renders.map(render => render.name), ['new']);
});

test('hidden zero-width panels preserve the last image and recover when shown', async () => {
    const f = fixture();
    await f.load(); await f.finish();
    const lastGood = f.elements.get('canvas');
    f.resize(0); f.tick(); await flush();
    assert.equal(f.renders.length, 1);
    assert.equal(f.elements.get('canvas'), lastGood);
    f.resize(800); f.tick(); await flush(); await f.finish();
    assert.equal(f.elements.get('canvas').style.width, '720px');
});

test('zooming during a pending render publishes only the final zoom', async () => {
    const f = fixture();
    await f.load();
    f.click('zoomIn'); await flush();
    f.click('zoomOut'); await flush();
    assert.equal(f.renders.slice(0, -1).every(render => render.cancelled), true);
    await f.finish();
    assert.equal(f.publications.length, 1);
    assert.equal(f.elements.get('zoomLevel').value, '180%');
    assert.equal(f.elements.get('canvas').style.width, '900px');
});

test('compilation errors invalidate pending work and the next success recovers', async () => {
    const f = fixture();
    await f.load('old');
    f.message({type: 'error', message: 'LaTeX failed'});
    await flush(); await f.finish();
    assert.equal(f.publications.length, 0);
    assert.equal(f.loads[0].destroyed, true);
    assert.equal(f.elements.get('error').textContent, 'LaTeX failed');
    await f.load('fixed'); await f.finish();
    assert.equal(f.elements.get('error').classList.contains('hidden'), true);
    assert.equal(f.elements.get('viewport').classList.contains('hidden'), false);
});

test('render failures are reported and page navigation still works after retry', async () => {
    const f = fixture();
    await f.load('multi', {numPages: 2});
    f.renders[0].done = true;
    f.renders[0].reject(new Error('render failure'));
    await flush();
    assert.match(f.elements.get('error').textContent, /render failure/);
    f.click('fitWidth'); await flush(); await f.finish();
    f.click('nextPage'); await flush(); await f.finish();
    assert.equal(f.elements.get('pageInfo').textContent, 'Page 2 / 2');
    assert.equal(f.elements.get('error').classList.contains('hidden'), true);
    f.click('prevPage'); await flush(); await f.finish();
    assert.equal(f.elements.get('pageInfo').textContent, 'Page 1 / 2');
});


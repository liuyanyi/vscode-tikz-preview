// Capture the real PDF.js resize race without modifying screenshots or canvas state.
// Run from the repository root after npm ci and npx playwright install chromium.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const {createRequire} = require('node:module');
const root = process.cwd();
const requireFromRepo = createRequire(path.join(root, 'package.json'));
const {chromium} = requireFromRepo('playwright');
const esbuild = requireFromRepo('esbuild');
const output = process.env.RACE_EVIDENCE_OUTPUT || path.join(root, 'docs/upstream/assets');
const git = process.env.GIT_BIN || 'git';
const refs = {before: '08d06184b74e3580cd9237e8172eeac90a3b99b4', after: 'codex/fix-preview-render-races'};
const show = (ref, file) => execFileSync(git, ['show', ref + ':' + file], {cwd: root, encoding: 'utf8'});
const viewers = Object.fromEntries(Object.entries(refs).map(([name, ref]) => [name, show(ref, 'media/viewer.js')]));
const originalPreview = esbuild.transformSync(show(refs.before, 'src/preview.ts'), {loader: 'ts', format: 'cjs'}).code;

function pdf() {
    const stream = [
        '0.96 0.97 1 rg 0 0 640 360 re f',
        '0.1 0.15 0.25 rg BT /F1 26 Tf 28 312 Td (TikZ Preview - render race) Tj ET',
        '0.12 0.42 0.75 rg 28 140 170 110 re f',
        '0.25 0.60 0.36 rg 235 140 170 110 re f',
        '0.78 0.36 0.12 rg 442 140 170 110 re f',
        '1 1 1 rg BT /F1 22 Tf 68 190 Td (INPUT) Tj ET',
        '1 1 1 rg BT /F1 22 Tf 264 190 Td (RENDER) Tj ET',
        '1 1 1 rg BT /F1 22 Tf 472 190 Td (OUTPUT) Tj ET',
        '0.15 0.20 0.30 RG 3 w 198 195 m 235 195 l S 405 195 m 442 195 l S',
        '0.1 0.15 0.25 rg BT /F1 19 Tf 28 78 Td (Resize the panel while PDF.js is drawing.) Tj ET',
        'BT /F1 17 Tf 28 44 Td (The final image should keep its scale and orientation.) Tj ET',
        ''
    ].join('\n');
    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 640 360] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
        `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
    ];
    let text = '%PDF-1.4\n', offsets = [];
    objects.forEach((object, i) => {offsets.push(Buffer.byteLength(text)); text += `${i + 1} 0 obj\n${object}\nendobj\n`;});
    const xref = Buffer.byteLength(text);
    text += `xref\n0 6\n0000000000 65535 f \n${offsets.map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('')}`;
    text += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(text);
}

function html(origin, variant) {
    let panel;
    const uri = value => ({fsPath: value, toString: () => origin + value});
    const vscode = {ViewColumn: {Beside: 2},
        Uri: {joinPath: (base, ...parts) => uri(path.posix.join(base.fsPath, ...parts)), file: uri},
        window: {createOutputChannel: () => ({}), createWebviewPanel: () => {
            panel = {onDidDispose() {}, webview: {cspSource: origin, asWebviewUri: value => value}};
            return panel;
        }}};
    const module = {exports: {}};
    vm.runInNewContext(originalPreview, {module, require: name => {if (name === 'vscode') return vscode; throw new Error(name);}});
    new module.exports.PreviewManager(uri('/' + variant)).show('public-example.tikz', '/');
    return panel.webview.html;
}

async function main() {
    fs.mkdirSync(output, {recursive: true});
    const bytes = pdf();
    fs.writeFileSync(path.join(output, 'render-race-example.pdf'), bytes);
    let origin;
    const server = http.createServer((request, response) => {
        const url = new URL(request.url, origin), parts = url.pathname.split('/').filter(Boolean);
        const variant = parts[0];
        if (!viewers[variant]) {response.writeHead(404).end(); return;}
        if (parts.length === 1) {response.setHeader('Content-Type', 'text/html'); response.end(html(origin, variant));}
        else if (url.pathname.endsWith('/sample.pdf')) {response.setHeader('Content-Type', 'application/pdf'); response.end(bytes);}
        else if (parts[1] === 'media' && parts[2] === 'viewer.js') {
            response.setHeader('Content-Type', 'application/javascript');
            response.end(viewers[variant] + '\nwindow.__viewerReady = true;');
        } else if (parts[1] === 'media' && ['pdf.min.js', 'pdf.worker.min.js'].includes(parts[2])) {
            response.setHeader('Content-Type', 'application/javascript');
            response.end(fs.readFileSync(path.join(root, 'media', parts[2])));
        } else {response.writeHead(404).end();}
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = 'http://127.0.0.1:' + server.address().port;
    const browser = await chromium.launch({headless: true});
    const results = {};
    try {
        for (const name of ['before', 'after', 'baseline']) {
            const variant = name === 'baseline' ? 'after' : name;
            const context = await browser.newContext({viewport: {width: name === 'baseline' ? 900 : 1000, height: 640}, deviceScaleFactor: 2});
            const page = await context.newPage(), errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.goto(origin + '/' + variant);
            await page.waitForFunction(() => window.__viewerReady);
            await page.evaluate(hold => {
                window.__race = {held: false, tasks: [], hold};
                const original = pdfjsLib.getDocument, wrapped = new WeakSet();
                pdfjsLib.getDocument = source => {
                    const loading = original(source);
                    return {destroy: () => loading.destroy(), promise: loading.promise.then(pdf => {
                        const getPage = pdf.getPage.bind(pdf);
                        pdf.getPage = async number => {
                            const page = await getPage(number);
                            if (!wrapped.has(page)) {
                                wrapped.add(page);
                                const render = page.render.bind(page);
                                page.render = options => {
                                    const task = render(options), record = {done: false, cancelled: false};
                                    window.__race.tasks.push(record);
                                    task.onContinue = continuation => {
                                        if (window.__race.hold && !window.__race.held) {
                                            window.__race.held = true; window.__race.resume = continuation;
                                        } else {continuation();}
                                    };
                                    task.promise.then(() => {record.done = true;}, error => {
                                        record.done = true; record.cancelled = error.name === 'RenderingCancelledException';
                                    });
                                    return task;
                                };
                            }
                            return page;
                        };
                        return pdf;
                    })};
                };
            }, name !== 'baseline');
            await page.evaluate(url => window.postMessage({type: 'render', pdfPath: url}, '*'), origin + '/' + variant + '/sample.pdf');
            if (name !== 'baseline') {
                await page.waitForFunction(() => window.__race.held);
                await page.setViewportSize({width: 900, height: 640});
                // Let the real resize handler run (including the fixed 120 ms debounce).
                await page.waitForTimeout(250);
                await page.evaluate(() => window.__race.resume());
            }
            await page.waitForFunction(() => window.__race.tasks.length && window.__race.tasks.every(task => task.done));
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            const hash = await page.locator('#canvas').evaluate(async canvas => {
                const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
                return new Uint8Array(await crypto.subtle.digest('SHA-256', pixels)).toHex();
            });
            results[name] = {hash, errors, tasks: await page.evaluate(() => window.__race.tasks)};
            if (name !== 'baseline') await page.screenshot({path: path.join(output, 'render-race-' + name + '.png')});
            await context.close();
        }
        if (results.after.hash !== results.baseline.hash) throw new Error('Fixed render differs from the uninterrupted baseline.');
        if (results.before.hash === results.baseline.hash) throw new Error('The original viewer did not reproduce the race.');
        if (results.after.errors.length) throw new Error('The fixed viewer raised a browser error.');
        fs.writeFileSync(path.join(output, 'render-race-results.json'), JSON.stringify({refs, pdfjs: requireFromRepo('pdfjs-dist/package.json').version,
            browser: browser.version(), fixedMatchesBaseline: true, originalDiffersFromBaseline: true, results}, null, 2) + '\n');
        console.log(JSON.stringify({output, fixedMatchesBaseline: true, originalDiffersFromBaseline: true, results}));
    } finally {await browser.close(); await new Promise(resolve => server.close(resolve));}
}
main().catch(error => {console.error(error.stack); process.exitCode = 1;});

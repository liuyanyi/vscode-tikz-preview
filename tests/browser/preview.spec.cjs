const {test, expect} = require('@playwright/test');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');
const esbuild = require('esbuild');

// Public, generated vector/text fixtures; no TeX installation or private files.
function samplePdf(label, red) {
    const commands = `0.95 0.96 1 rg 0 0 400 200 re f\n${red ? '0.8 0.2 0.1' : '0.1 0.4 0.8'} rg 25 35 140 70 re f\n0 0 0 rg BT /F1 22 Tf 25 150 Td (${label}) Tj ET\n`;
    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
        `<< /Length ${Buffer.byteLength(commands)} >>\nstream\n${commands}endstream`,
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
    ];
    let pdf = '%PDF-1.4\n', offsets = [0];
    objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
    const xref = Buffer.byteLength(pdf);
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    pdf += offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('');
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(pdf);
}

function previewHtml(origin) {
    let panel;
    const uri = value => ({fsPath: value, toString: () => origin + value});
    const vscode = {
        l10n: {t: value => value}, ViewColumn: {Beside: 2},
        Uri: {joinPath: (base, ...parts) => uri(path.posix.join(base.fsPath, ...parts)), file: uri},
        window: {
            createOutputChannel: () => ({}),
            createWebviewPanel: () => {
                panel = {onDidDispose() {}, webview: {cspSource: origin, asWebviewUri: value => value, onDidReceiveMessage() {}}};
                return panel;
            }
        }
    };
    const module = {exports: {}};
    const code = esbuild.transformSync(fs.readFileSync(path.join(__dirname, '../../src/preview.ts'), 'utf8'),
        {loader: 'ts', format: 'cjs'}).code;
    vm.runInNewContext(code, {module, require: name => {if (name === 'vscode') return vscode; throw new Error(name);}});
    const preview = new module.exports.PreviewManager(uri('/'));
    preview.show('sample.tikz', '/');
    return panel.webview.html;
}

let server, origin;
test.beforeAll(async () => {
    server = http.createServer((request, response) => {
        const url = new URL(request.url, origin);
        if (url.pathname === '/') {
            response.setHeader('Content-Type', 'text/html; charset=utf-8');
            response.end(previewHtml(origin));
        } else if (['/media/viewer.js', '/media/pdf.min.js', '/media/pdf.worker.min.js'].includes(url.pathname)) {
            response.setHeader('Content-Type', 'application/javascript');
            response.end(fs.readFileSync(path.join(__dirname, '../..', url.pathname)));
        } else if (url.pathname === '/sample-a.pdf' || url.pathname === '/sample-b.pdf') {
            response.setHeader('Content-Type', 'application/pdf');
            setTimeout(() => response.end(samplePdf(url.pathname === '/sample-a.pdf' ? 'Figure A' : 'Figure B', url.pathname === '/sample-b.pdf')), 150);
        } else { response.writeHead(404).end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async () => { await new Promise(resolve => server.close(resolve)); });

async function open(page) {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
        window.__hostMessages = [];
        window.acquireVsCodeApi = () => ({postMessage: message => window.__hostMessages.push(message)});
    });
    await page.goto(origin);
    await page.waitForFunction(() => window.__hostMessages.some(message => message.type === 'ready'));
    return errors;
}
async function send(page, message) { await page.evaluate(message => window.postMessage(message, '*'), message); }
async function pixelHash(page) {
    return page.locator('#canvas').evaluate(async canvas => {
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        return new Uint8Array(await crypto.subtle.digest('SHA-256', pixels)).toHex();
    });
}

test('compilation and rendering keep the old figure hidden until the new PDF is complete', async ({page}, testInfo) => {
    const errors = await open(page);
    await send(page, {type: 'loading', fileName: 'example-图.tikz'});
    await expect(page.locator('#loading')).toBeVisible();
    await expect(page.locator('#loadingText')).toHaveText('Compiling…');
    await expect(page.locator('#loadingFile')).toHaveText('example-图.tikz');
    await expect(page.locator('#zoomIn')).toBeDisabled();
    await page.screenshot({path: testInfo.outputPath('compiling.png')});
    await send(page, {type: 'render', pdfPath: origin + '/sample-a.pdf'});
    await expect(page.locator('#loadingText')).toHaveText('Rendering preview…');
    await expect(page.locator('#viewport')).toBeHidden();
    await expect(page.locator('#loading')).toBeHidden();
    await expect(page.locator('#canvas')).toBeVisible();
    await expect(page.locator('#zoomIn')).toBeEnabled();
    await page.screenshot({path: testInfo.outputPath('rendered.png')});
    expect(errors).toEqual([]);
});

test('resize, zoom, hidden panels and rapid switches preserve the final PDF pixels', async ({page}) => {
    const errors = await open(page);
    await page.evaluate(() => {
        const original = pdfjsLib.getDocument;
        const wrapped = new WeakSet();
        window.__renderTasks = [];
        pdfjsLib.getDocument = source => {
            const loading = original(source);
            return {destroy: () => loading.destroy(), promise: loading.promise.then(pdf => {
                const getPage = pdf.getPage.bind(pdf);
                pdf.getPage = async num => {
                    const page = await getPage(num);
                    if (!wrapped.has(page)) {
                        wrapped.add(page);
                        const render = page.render.bind(page);
                        page.render = options => {
                            const task = render(options), record = {done: false, cancelled: false};
                            window.__renderTasks.push(record);
                            task.onContinue = continuation => setTimeout(continuation, 10);
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
    });
    await send(page, {type: 'render', pdfPath: origin + '/sample-a.pdf'});
    await expect(page.locator('#loading')).toBeHidden();
    const baseline = await pixelHash(page);
    await page.evaluate(async () => {
        for (let i = 0; i < 30; ++i) {
            document.getElementById(i % 2 ? 'zoomIn' : 'zoomOut').click();
            window.dispatchEvent(new Event('resize'));
            await new Promise(resolve => setTimeout(resolve, 2));
        }
        document.body.style.display = 'none';
        window.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(150);
    await page.evaluate(() => {document.body.style.display = ''; window.dispatchEvent(new Event('resize'));});
    await send(page, {type: 'loading', fileName: 'figure-b.tikz'});
    await send(page, {type: 'render', pdfPath: origin + '/sample-b.pdf'});
    await send(page, {type: 'loading', fileName: 'figure-a.tikz'});
    await send(page, {type: 'render', pdfPath: origin + '/sample-a.pdf'});
    await expect(page.locator('#loading')).toBeHidden();
    await page.locator('#fitWidth').click();
    await page.waitForFunction(() => window.__renderTasks.every(task => task.done));
    expect(await pixelHash(page)).toEqual(baseline);
    expect(await page.evaluate(() => window.__renderTasks.filter(task => task.cancelled).length)).toBeGreaterThan(0);
    expect(errors).toEqual([]);
});

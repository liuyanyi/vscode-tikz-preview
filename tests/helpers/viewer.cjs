const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../media/viewer.js'), 'utf8');
const flush = async () => { for (let i = 0; i < 12; ++i) await Promise.resolve(); };
function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return {promise, resolve, reject};
}

function fixture({strings} = {}) {
    const elements = new Map(), listeners = {}, timers = new Map();
    const loads = [], renders = [], publications = [], unsafeResizes = [], outgoing = [];
    let timerId = 0;
    function element(id) {
        const classes = new Set();
        const node = {
            id, style: {}, value: '100%', textContent: '', clientWidth: 1000,
            events: {}, classList: {
                add: value => classes.add(value), remove: value => classes.delete(value),
                contains: value => classes.has(value),
                toggle(value, on) { if (on) classes.add(value); else classes.delete(value); }
            },
            addEventListener(type, listener) { this.events[type] = listener; },
            getContext() { return {canvas: this}; },
            replaceWith(next) {
                elements.set('canvas', next);
                publications.push(next);
            }
        };
        for (const property of ['width', 'height']) {
            let size = 0;
            Object.defineProperty(node, property, {
                get: () => size,
                set(value) {
                    if (renders.some(render => render.canvas === node && !render.done)) {
                        unsafeResizes.push({property, value});
                    }
                    size = value;
                }
            });
        }
        return node;
    }
    for (const id of ['canvas', 'viewport', 'error', 'zoomLevel', 'pageInfo',
        'prevPage', 'nextPage', 'zoomIn', 'zoomOut', 'fitWidth', 'loading',
        'loadingText', 'loadingFile']) elements.set(id, element(id));
    elements.get('error').classList.add('hidden');
    function makePdf(name, {numPages = 1, pageDelay = null} = {}) {
        return {
            name, numPages,
            getPage(num) {
                const page = {
                    getViewport: ({scale}) => ({width: 500 * scale, height: 250 * scale}),
                    render({canvas, canvasContext, viewport}) {
                        const pending = deferred();
                        const render = {
                            ...pending, canvas: canvas || canvasContext.canvas,
                            viewport, name, num, done: false, cancelled: false,
                            cancel() {
                                this.cancelled = this.done = true;
                                pending.reject(Object.assign(new Error('cancelled'), {name: 'RenderingCancelledException'}));
                            },
                            finish() { this.done = true; pending.resolve(); }
                        };
                        renders.push(render);
                        return render;
                    }
                };
                return pageDelay ? pageDelay.promise.then(() => page) : Promise.resolve(page);
            }
        };
    }
    const context = {
        PREVIEW_STRINGS: strings,
        acquireVsCodeApi: () => ({postMessage: message => outgoing.push(message)}),
        pdfjsLib: {GlobalWorkerOptions: {}, getDocument({url}) {
            const pending = deferred();
            const task = {...pending, url, destroyed: false,
                destroy() { this.destroyed = true; return Promise.resolve(); }};
            loads.push(task);
            return task;
        }},
        document: {getElementById: id => elements.get(id), createElement: () => element('')},
        window: {devicePixelRatio: 2, addEventListener: (type, fn) => { listeners[type] = fn; }},
        setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; },
        clearTimeout(id) { timers.delete(id); }
    };
    vm.runInNewContext(source, context);
    const api = {
        elements, loads, renders, publications, unsafeResizes, outgoing, context, makePdf,
        message(data) { listeners.message({data}); },
        resize(width) {
            elements.get('viewport').clientWidth = width;
            elements.get('loading').clientWidth = width;
            listeners.resize();
        },
        tick() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => fn()); },
        click(id) { elements.get(id).events.click(); },
        async load(name = 'figure', options) {
            this.message({type: 'render', pdfPath: name});
            loads.at(-1).resolve(makePdf(name, options));
            await flush();
        },
        async finish() {
            renders.filter(render => !render.done).forEach(render => render.finish());
            await flush();
        }
    };
    return api;
}


module.exports = {fixture, flush, deferred};

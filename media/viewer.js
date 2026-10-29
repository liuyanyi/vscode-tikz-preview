(function () {
    'use strict';
    pdfjsLib.GlobalWorkerOptions.workerSrc = globalThis.WORKER_SRC_PLACEHOLDER;

    var pdfDoc = null;
    var loadingTask = null;
    var renderTask = null;
    var loadRevision = 0;
    var renderRevision = 0;
    var resizeTimer = null;
    var currentPage = 1;
    var currentScale = 1;
    var fitWidth = true;

    var canvas = document.getElementById('canvas');
    var viewportEl = document.getElementById('viewport');
    var errorDiv = document.getElementById('error');
    var zoomLevel = document.getElementById('zoomLevel');
    var pageInfo = document.getElementById('pageInfo');
    var prevBtn = document.getElementById('prevPage');
    var nextBtn = document.getElementById('nextPage');

    function cancelRender() {
        ++renderRevision;
        if (renderTask) {
            renderTask.cancel();
            renderTask = null;
        }
    }

    function showError(message) {
        errorDiv.textContent = message;
        errorDiv.classList.remove('hidden');
        viewportEl.classList.add('hidden');
    }

    function updateUI() {
        if (!pdfDoc) { return; }
        zoomLevel.value = Math.round(currentScale * 100) + '%';
        pageInfo.textContent = 'Page ' + currentPage + ' / ' + pdfDoc.numPages;
        prevBtn.classList.toggle('hidden', pdfDoc.numPages <= 1);
        nextBtn.classList.toggle('hidden', pdfDoc.numPages <= 1);
    }

    async function renderPage(num) {
        cancelRender();
        var revision = renderRevision;
        var doc = pdfDoc;
        if (!doc) { return; }
        var task = null;
        try {
            var page = await doc.getPage(num);
            if (revision !== renderRevision || doc !== pdfDoc) { return; }
            if (fitWidth) {
                // Hidden webviews can report zero width. Keep the last good image.
                var width = viewportEl.clientWidth;
                if (width <= 32) { return; }
                var baseViewport = page.getViewport({ scale: 1 });
                currentScale = width * 0.9 / baseViewport.width;
            }
            var pixelRatio = window.devicePixelRatio || 1;
            var vp = page.getViewport({ scale: currentScale * pixelRatio });

            // Never resize a canvas that PDF.js may still be drawing into.
            // Its saved transforms become invalid when width/height are reset.
            var nextCanvas = document.createElement('canvas');
            nextCanvas.id = 'canvas';
            nextCanvas.width = Math.ceil(vp.width);
            nextCanvas.height = Math.ceil(vp.height);
            nextCanvas.style.width = (vp.width / pixelRatio) + 'px';
            nextCanvas.style.height = (vp.height / pixelRatio) + 'px';
            task = page.render({
                canvas: nextCanvas,
                canvasContext: nextCanvas.getContext('2d'),
                viewport: vp
            });
            renderTask = task;
            await task.promise;
            if (revision !== renderRevision || doc !== pdfDoc) { return; }
            canvas.replaceWith(nextCanvas);
            canvas = nextCanvas;
            currentPage = num;
            updateUI();
            errorDiv.classList.add('hidden');
            viewportEl.classList.remove('hidden');
        } catch (err) {
            if (revision === renderRevision && doc === pdfDoc
                && err.name !== 'RenderingCancelledException') {
                showError('Failed to render PDF: ' + err.message);
            }
        } finally {
            if (renderTask === task) { renderTask = null; }
        }
    }

    function releaseDocument() {
        cancelRender();
        pdfDoc = null;
        if (loadingTask) {
            var oldTask = loadingTask;
            loadingTask = null;
            // destroy() also releases the old document's worker and font data.
            Promise.resolve(oldTask.destroy()).catch(function () {});
        }
    }

    async function loadDocument(pdfPath) {
        var revision = ++loadRevision;
        releaseDocument();
        errorDiv.classList.add('hidden');
        viewportEl.classList.remove('hidden');
        try {
            var task = pdfjsLib.getDocument({ url: pdfPath, disableWorker: true });
            loadingTask = task;
            var pdf = await task.promise;
            if (revision !== loadRevision) { return; }
            pdfDoc = pdf;
            currentPage = 1;
            await renderPage(1);
        } catch (err) {
            if (revision === loadRevision) {
                showError('Failed to load PDF: ' + err.message);
            }
        }
    }

    function applyZoomInput() {
        var num = parseFloat(zoomLevel.value.replace('%', '').trim());
        if (Number.isFinite(num) && num > 0) {
            fitWidth = false;
            currentScale = Math.min(5, Math.max(0.1, num / 100));
            renderPage(currentPage);
        } else {
            zoomLevel.value = Math.round(currentScale * 100) + '%';
        }
    }

    zoomLevel.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            zoomLevel.blur();
        }
    });
    zoomLevel.addEventListener('blur', applyZoomInput);

    document.getElementById('zoomIn').addEventListener('click', function () {
        fitWidth = false;
        currentScale = Math.min(5, currentScale * 1.25);
        renderPage(currentPage);
    });
    document.getElementById('zoomOut').addEventListener('click', function () {
        fitWidth = false;
        currentScale = Math.max(0.1, currentScale / 1.25);
        renderPage(currentPage);
    });
    document.getElementById('fitWidth').addEventListener('click', function () {
        fitWidth = true;
        renderPage(currentPage);
    });
    prevBtn.addEventListener('click', function () {
        if (currentPage > 1) { renderPage(currentPage - 1); }
    });
    nextBtn.addEventListener('click', function () {
        if (pdfDoc && currentPage < pdfDoc.numPages) { renderPage(currentPage + 1); }
    });

    window.addEventListener('message', function (event) {
        var msg = event.data;
        if (!msg) { return; }
        if (msg.type === 'render') {
            loadDocument(msg.pdfPath);
        } else if (msg.type === 'error') {
            ++loadRevision;
            releaseDocument();
            showError(msg.message);
        }
    });

    window.addEventListener('resize', function () {
        if (resizeTimer !== null) { clearTimeout(resizeTimer); }
        resizeTimer = setTimeout(function () {
            resizeTimer = null;
            if (fitWidth && viewportEl.clientWidth > 32) { renderPage(currentPage); }
        }, 120);
    });

})();

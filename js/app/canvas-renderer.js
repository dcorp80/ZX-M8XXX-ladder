/**
 * Canvas Renderer - Host-side canvas blitting for the emulator display.
 * Handles ImageData creation, putImageData, and overlay drawing.
 * This separates DOM/Canvas concerns from the emulation kernel (spectrum.js).
 */

export function initCanvasRenderer(canvas, spectrum, overlayRenderer) {
    const ctx = canvas.getContext('2d');
    const dims = spectrum.getScreenDimensions();
    canvas.width = dims.width;
    canvas.height = dims.height;
    let imageData = ctx.createImageData(dims.width, dims.height);

    function render(frameBuffer) {
        imageData.data.set(frameBuffer);
        ctx.putImageData(imageData, 0, 0);
        overlayRenderer.drawOverlay();
    }

    function resize() {
        const dims = spectrum.getScreenDimensions();
        canvas.width = dims.width;
        canvas.height = dims.height;
        imageData = ctx.createImageData(dims.width, dims.height);
    }

    return { render, resize, canvas, ctx };
}

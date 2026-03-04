/**
 * Overlay Renderer - Host-side overlay drawing for the emulator display.
 * Extracted from spectrum.js Phase 4: owns overlay mode, zoom, previousFrameBuffer,
 * and all overlay drawing methods. The kernel no longer knows about overlays.
 */

export function initOverlayRenderer(overlayCanvas, spectrum) {
    const overlayCtx = overlayCanvas ? overlayCanvas.getContext('2d') : null;
    let currentOverlayCtx = overlayCtx;

    let overlayMode = 'none';
    let zoom = 1;
    let previousFrameBuffer = null;

    // Initialize previousFrameBuffer from current dimensions
    const initDims = spectrum.getScreenDimensions();
    previousFrameBuffer = new Uint8ClampedArray(initDims.width * initDims.height * 4);

    function getOverlayMode() {
        return overlayMode;
    }

    function isBorderOnly() {
        return overlayMode === 'screen' || overlayMode === 'reveal' || overlayMode === 'beamscreen';
    }

    function isBeamMode() {
        return overlayMode === 'beam' || overlayMode === 'beamscreen';
    }

    function setMode(mode) {
        overlayMode = mode;
        spectrum.ula.borderOnly = isBorderOnly();
    }

    function setZoomLevel(z) {
        zoom = z;
        // Update overlay context reference after canvas resize
        if (overlayCanvas) {
            currentOverlayCtx = overlayCanvas.getContext('2d');
        }
    }

    function onDisplayDimensionsChanged() {
        const dims = spectrum.getScreenDimensions();
        previousFrameBuffer = new Uint8ClampedArray(dims.width * dims.height * 4);
    }

    function savePreviousFrame(frameBuffer) {
        if (previousFrameBuffer && frameBuffer) {
            previousFrameBuffer.set(frameBuffer);
        }
    }

    /**
     * Apply border-only post-processing to frame buffer.
     * In border-only modes (screen/reveal/beamscreen), replaces the paper area
     * with border colors so overlays can show border effects underneath.
     */
    function applyBorderOnlyMode(frameBuffer) {
        if (!isBorderOnly()) return;

        const dims = spectrum.getScreenDimensions();
        const changes = spectrum.ula.borderChanges;
        const palette = spectrum.ula.palette;

        for (let y = dims.borderTop; y < dims.borderTop + dims.screenHeight; y++) {
            const lineStartTstate = spectrum.ula.calculateLineStartTstate(y);
            let currentColor = (changes && changes.length > 0) ? changes[0].color : spectrum.ula.borderColor;
            let changeIdx = 0;

            if (changes && changes.length > 0) {
                for (let i = 0; i < changes.length; i++) {
                    if (changes[i].tState <= lineStartTstate) {
                        currentColor = changes[i].color;
                        changeIdx = i + 1;
                    } else {
                        break;
                    }
                }
            }

            for (let x = dims.borderLeft; x < dims.borderLeft + dims.screenWidth; x++) {
                const pixelTstate = lineStartTstate + Math.floor(x / 2);
                if (changes) {
                    while (changeIdx < changes.length && changes[changeIdx].tState <= pixelTstate) {
                        currentColor = changes[changeIdx].color;
                        changeIdx++;
                    }
                }
                const colorIdx = currentColor & 7;
                const rgb = palette ? palette[colorIdx] : [0, 0, 0, 255];
                const idx = (y * dims.width + x) * 4;
                frameBuffer[idx] = rgb[0];
                frameBuffer[idx + 1] = rgb[1];
                frameBuffer[idx + 2] = rgb[2];
                frameBuffer[idx + 3] = 255;
            }
        }
    }

    /**
     * Process frame buffer after rendering: apply border-only mode and save for beam overlay.
     * Called by canvas-renderer before blitting to canvas.
     * @param {Uint8ClampedArray} frameBuffer
     * @param {boolean} skipSavePrevious - true during beam mode redraw (keep last complete frame)
     */
    function processFrame(frameBuffer, skipSavePrevious = false) {
        applyBorderOnlyMode(frameBuffer);
        if (!skipSavePrevious) {
            savePreviousFrame(frameBuffer);
        }
    }

    // ========== Overlay Drawing ==========

    function drawOverlay() {
        switch (overlayMode) {
            case 'grid':
                drawGrid();
                break;
            case 'box':
                drawBoxOverlay();
                break;
            case 'screen':
                drawScreenModeOverlay();
                break;
            case 'reveal':
                drawRevealOverlay();
                break;
            case 'beam':
                drawBeamOverlay(false);
                break;
            case 'beamscreen':
                drawBeamOverlay(true);
                break;
            case 'noattr':
                drawNoAttrOverlay();
                break;
            case 'nobitmap':
                drawNoBitmapOverlay();
                break;
            case 'none':
            default:
                if (currentOverlayCtx) {
                    currentOverlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
                }
                break;
        }
    }

    function drawBoxOverlay() {
        if (!currentOverlayCtx) return;
        const ctx = currentOverlayCtx;
        const dims = spectrum.getScreenDimensions();

        ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

        const borderTop = dims.borderTop * zoom;
        const borderLeft = dims.borderLeft * zoom;
        const screenWidth = dims.screenWidth * zoom;
        const screenHeight = dims.screenHeight * zoom;

        ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
        ctx.lineWidth = 1;
        ctx.strokeRect(borderLeft + 0.5, borderTop + 0.5, screenWidth - 1, screenHeight - 1);
    }

    function drawScreenModeOverlay() {
        if (!currentOverlayCtx) return;
        const ctx = currentOverlayCtx;
        const dims = spectrum.getScreenDimensions();

        ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

        const borderTop = dims.borderTop * zoom;
        const borderLeft = dims.borderLeft * zoom;
        const screenWidth = dims.screenWidth * zoom;
        const screenHeight = dims.screenHeight * zoom;

        ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)';
        ctx.lineWidth = 1;

        for (let row = 0; row <= dims.screenHeight; row += 8) {
            const y = Math.floor((dims.borderTop + row) * zoom) + 0.5;
            ctx.beginPath();
            ctx.moveTo(borderLeft, y);
            ctx.lineTo(borderLeft + screenWidth, y);
            ctx.stroke();
        }

        for (let col = 0; col <= dims.screenWidth; col += 8) {
            const x = Math.floor((dims.borderLeft + col) * zoom) + 0.5;
            ctx.beginPath();
            ctx.moveTo(x, borderTop);
            ctx.lineTo(x, borderTop + screenHeight);
            ctx.stroke();
        }

        ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
        ctx.lineWidth = 1;
        ctx.strokeRect(borderLeft + 0.5, borderTop + 0.5, screenWidth - 1, screenHeight - 1);
    }

    function drawRevealOverlay() {
        if (!currentOverlayCtx) return;
        const ctx = currentOverlayCtx;
        const dims = spectrum.getScreenDimensions();

        ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

        const borderTop = dims.borderTop * zoom;
        const borderLeft = dims.borderLeft * zoom;
        const screenWidth = dims.screenWidth * zoom;
        const screenHeight = dims.screenHeight * zoom;

        // Render the normal screen content (bitmaps + attributes) into a temp canvas
        const screen = spectrum.ula.memory.getScreenBase();
        const screenRam = screen.ram;
        const pal = spectrum.ula.palette;
        const ulaplus = spectrum.ula.ulaplus;
        const ulaPlusActive = ulaplus && ulaplus.enabled && ulaplus.paletteEnabled;
        const flashActive = spectrum.ula.flashState;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = dims.width;
        tempCanvas.height = dims.height;
        const tempCtx = tempCanvas.getContext('2d');
        const tempImageData = tempCtx.createImageData(dims.width, dims.height);
        const data = tempImageData.data;

        for (let y = 0; y < 192; y++) {
            const third = Math.floor(y / 64);
            const lineInThird = y & 0x07;
            const charRow = Math.floor((y & 0x38) / 8);
            const pixelAddr = (third << 11) | (lineInThird << 8) | (charRow << 5);
            const attrAddr = 0x1800 + Math.floor(y / 8) * 32;
            const screenY = y + dims.borderTop;

            for (let col = 0; col < 32; col++) {
                const pixelByte = screenRam[pixelAddr + col];
                const attr = screenRam[attrAddr + col];

                let inkR, inkG, inkB, paperR, paperG, paperB;
                if (ulaPlusActive) {
                    const clut = ((attr >> 6) & 0x03) << 4;
                    const inkIdx = clut + (attr & 0x07);
                    const paperIdx = clut + 8 + ((attr >> 3) & 0x07);
                    const inkGrb = ulaplus.palette[inkIdx];
                    const paperGrb = ulaplus.palette[paperIdx];
                    const ig3 = (inkGrb >> 5) & 7, ir3 = (inkGrb >> 2) & 7, ib2 = inkGrb & 3;
                    inkR = (ir3 << 5) | (ir3 << 2) | (ir3 >> 1);
                    inkG = (ig3 << 5) | (ig3 << 2) | (ig3 >> 1);
                    inkB = (ib2 << 6) | (ib2 << 4) | (ib2 << 2) | ib2;
                    const pg3 = (paperGrb >> 5) & 7, pr3 = (paperGrb >> 2) & 7, pb2 = paperGrb & 3;
                    paperR = (pr3 << 5) | (pr3 << 2) | (pr3 >> 1);
                    paperG = (pg3 << 5) | (pg3 << 2) | (pg3 >> 1);
                    paperB = (pb2 << 6) | (pb2 << 4) | (pb2 << 2) | pb2;
                } else {
                    let ink = attr & 0x07;
                    let paper = (attr >> 3) & 0x07;
                    const bright = (attr & 0x40) ? 8 : 0;
                    if ((attr & 0x80) && flashActive) {
                        const tmp = ink; ink = paper; paper = tmp;
                    }
                    const inkRgb = pal[ink + bright];
                    const paperRgb = pal[paper + bright];
                    inkR = inkRgb[0]; inkG = inkRgb[1]; inkB = inkRgb[2];
                    paperR = paperRgb[0]; paperG = paperRgb[1]; paperB = paperRgb[2];
                }

                for (let bit = 7; bit >= 0; bit--) {
                    const px = dims.borderLeft + col * 8 + (7 - bit);
                    const idx = (screenY * dims.width + px) * 4;
                    if (pixelByte & (1 << bit)) {
                        data[idx] = inkR; data[idx + 1] = inkG; data[idx + 2] = inkB;
                    } else {
                        data[idx] = paperR; data[idx + 1] = paperG; data[idx + 2] = paperB;
                    }
                    data[idx + 3] = 128;  // 50% transparent — border shows through
                }
            }
        }

        tempCtx.putImageData(tempImageData, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tempCanvas, 0, 0, dims.width, dims.height,
                      0, 0, dims.width * zoom, dims.height * zoom);

        ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
        ctx.lineWidth = 1;
        ctx.strokeRect(borderLeft + 0.5, borderTop + 0.5, screenWidth - 1, screenHeight - 1);
    }

    function drawGrid() {
        if (!currentOverlayCtx) return;
        const ctx = currentOverlayCtx;
        const dims = spectrum.getScreenDimensions();

        ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

        const borderTop = dims.borderTop * zoom;
        const borderLeft = dims.borderLeft * zoom;
        const screenWidth = dims.screenWidth * zoom;
        const screenHeight = dims.screenHeight * zoom;
        const totalWidth = dims.width * zoom;
        const totalHeight = dims.height * zoom;

        // Draw border grid (magenta, every 8 pixels) - complete grid in all border areas
        ctx.strokeStyle = 'rgba(255, 0, 255, 0.4)';
        ctx.lineWidth = 1;

        // Top border area
        for (let row = 0; row <= dims.borderTop; row += 8) {
            const y = Math.floor(row * zoom) + 0.5;
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(totalWidth, y); ctx.stroke();
        }
        for (let col = 0; col <= dims.width; col += 8) {
            const x = Math.floor(col * zoom) + 0.5;
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, borderTop); ctx.stroke();
        }

        // Bottom border area
        for (let row = dims.borderTop + dims.screenHeight; row <= dims.height; row += 8) {
            const y = Math.floor(row * zoom) + 0.5;
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(totalWidth, y); ctx.stroke();
        }
        for (let col = 0; col <= dims.width; col += 8) {
            const x = Math.floor(col * zoom) + 0.5;
            ctx.beginPath(); ctx.moveTo(x, borderTop + screenHeight); ctx.lineTo(x, totalHeight); ctx.stroke();
        }

        // Left border area (middle section)
        for (let row = dims.borderTop; row <= dims.borderTop + dims.screenHeight; row += 8) {
            const y = Math.floor(row * zoom) + 0.5;
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(borderLeft, y); ctx.stroke();
        }
        for (let col = 0; col <= dims.borderLeft; col += 8) {
            const x = Math.floor(col * zoom) + 0.5;
            ctx.beginPath(); ctx.moveTo(x, borderTop); ctx.lineTo(x, borderTop + screenHeight); ctx.stroke();
        }

        // Right border area (middle section)
        for (let row = dims.borderTop; row <= dims.borderTop + dims.screenHeight; row += 8) {
            const y = Math.floor(row * zoom) + 0.5;
            ctx.beginPath(); ctx.moveTo(borderLeft + screenWidth, y); ctx.lineTo(totalWidth, y); ctx.stroke();
        }
        for (let col = dims.borderLeft + dims.screenWidth; col <= dims.width; col += 8) {
            const x = Math.floor(col * zoom) + 0.5;
            ctx.beginPath(); ctx.moveTo(x, borderTop); ctx.lineTo(x, borderTop + screenHeight); ctx.stroke();
        }

        // Draw screen grid (gray)
        ctx.strokeStyle = 'rgba(128, 128, 128, 0.5)';
        ctx.lineWidth = 1;
        const cellSize = 8 * zoom;

        for (let col = 0; col <= 32; col++) {
            const x = Math.floor(borderLeft + col * cellSize) + 0.5;
            ctx.beginPath(); ctx.moveTo(x, borderTop); ctx.lineTo(x, borderTop + screenHeight); ctx.stroke();
        }

        for (let row = 0; row <= 24; row++) {
            const y = Math.floor(borderTop + row * cellSize) + 0.5;
            ctx.beginPath(); ctx.moveTo(borderLeft, y); ctx.lineTo(borderLeft + screenWidth, y); ctx.stroke();
        }

        // Draw thirds dividers (cyan)
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.7)';
        ctx.lineWidth = 1;
        for (let third = 1; third < 3; third++) {
            const y = Math.floor(borderTop + third * 64 * zoom) + 0.5;
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(totalWidth, y); ctx.stroke();
        }

        // Draw quarter dividers
        for (let quarter = 1; quarter < 4; quarter++) {
            const x = Math.floor(borderLeft + quarter * 64 * zoom) + 0.5;
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, totalHeight); ctx.stroke();
        }

        // Draw numbers using small bitmap digits (scaled by zoom)
        const drawDigit = (x, y, digit, color) => {
            ctx.fillStyle = color;
            const patterns = {
                '0': [0b111, 0b101, 0b101, 0b101, 0b111],
                '1': [0b010, 0b110, 0b010, 0b010, 0b111],
                '2': [0b111, 0b001, 0b111, 0b100, 0b111],
                '3': [0b111, 0b001, 0b111, 0b001, 0b111],
                '4': [0b101, 0b101, 0b111, 0b001, 0b001],
                '5': [0b111, 0b100, 0b111, 0b001, 0b111],
                '6': [0b111, 0b100, 0b111, 0b101, 0b111],
                '7': [0b111, 0b001, 0b001, 0b001, 0b001],
                '8': [0b111, 0b101, 0b111, 0b101, 0b111],
                '9': [0b111, 0b101, 0b111, 0b001, 0b111],
            };
            const p = patterns[digit] || patterns['0'];
            for (let py = 0; py < 5; py++) {
                for (let px = 0; px < 3; px++) {
                    if (p[py] & (4 >> px)) {
                        ctx.fillRect(x + px * zoom, y + py * zoom, zoom, zoom);
                    }
                }
            }
        };

        const drawNumber = (x, y, num, color) => {
            const str = num.toString();
            for (let i = 0; i < str.length; i++) {
                drawDigit(x + i * 4 * zoom, y, str[i], color);
            }
        };

        // Row numbers on left border (yellow)
        for (let row = 0; row < 24; row++) {
            const y = borderTop + row * cellSize + zoom;
            drawNumber(borderLeft - 10 * zoom, y, row, '#FFFF00');
        }

        // Column numbers on top border (every 4th)
        for (let col = 0; col < 32; col += 4) {
            const x = borderLeft + col * cellSize + zoom;
            drawNumber(x, borderTop - 7 * zoom, col, '#FFFF00');
        }

        // Scanline numbers on right (cyan)
        for (let line = 0; line < 192; line += 8) {
            const y = borderTop + line * zoom + zoom;
            drawNumber(borderLeft + screenWidth + 2 * zoom, y, line, '#00FFFF');
        }

        // Draw 256x192 boundary lines extending into border areas (yellow)
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
        ctx.lineWidth = 1;

        const topY = Math.floor(borderTop) + 0.5;
        ctx.beginPath(); ctx.moveTo(0, topY); ctx.lineTo(borderLeft, topY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(borderLeft + screenWidth, topY); ctx.lineTo(totalWidth, topY); ctx.stroke();

        const bottomY = Math.floor(borderTop + screenHeight) + 0.5;
        ctx.beginPath(); ctx.moveTo(0, bottomY); ctx.lineTo(borderLeft, bottomY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(borderLeft + screenWidth, bottomY); ctx.lineTo(totalWidth, bottomY); ctx.stroke();

        const leftX = Math.floor(borderLeft) + 0.5;
        ctx.beginPath(); ctx.moveTo(leftX, 0); ctx.lineTo(leftX, borderTop); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(leftX, borderTop + screenHeight); ctx.lineTo(leftX, totalHeight); ctx.stroke();

        const rightX = Math.floor(borderLeft + screenWidth) + 0.5;
        ctx.beginPath(); ctx.moveTo(rightX, 0); ctx.lineTo(rightX, borderTop); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(rightX, borderTop + screenHeight); ctx.lineTo(rightX, totalHeight); ctx.stroke();

        ctx.strokeRect(borderLeft + 0.5, borderTop + 0.5, screenWidth - 1, screenHeight - 1);
    }

    function drawBeamOverlay(borderOnlyMode) {
        if (!currentOverlayCtx) return;
        const ctx = currentOverlayCtx;
        const dims = spectrum.getScreenDimensions();

        ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

        // Calculate current beam position from tStates
        const tStates = spectrum.cpu.tStates;
        const tstatesPerLine = spectrum.ula.TSTATES_PER_LINE;
        const tstatesPerFrame = spectrum.ula.TSTATES_PER_FRAME;

        const currentFrameLine = Math.floor(tStates / tstatesPerLine);
        const posInLine = tStates % tstatesPerLine;

        const firstVisibleFrameLine = spectrum.ula.FIRST_SCREEN_LINE - spectrum.ula.BORDER_TOP;
        const lastVisibleFrameLine = spectrum.ula.FIRST_SCREEN_LINE + spectrum.ula.SCREEN_HEIGHT + spectrum.ula.BORDER_BOTTOM - 1;

        let beamVisY = currentFrameLine - firstVisibleFrameLine;

        const lineStartTstate = spectrum.ula.calculateLineStartTstate ?
            spectrum.ula.calculateLineStartTstate(Math.max(0, beamVisY)) : 0;
        const currentTstate = currentFrameLine * tstatesPerLine + posInLine;
        const pixelX = Math.floor((currentTstate - lineStartTstate) * 2);

        const beamX = Math.max(0, Math.min(dims.width - 1, pixelX));
        const beamY = Math.max(0, Math.min(dims.height - 1, beamVisY));

        const borderTop = dims.borderTop * zoom;
        const borderLeft = dims.borderLeft * zoom;
        const screenWidth = dims.screenWidth * zoom;
        const screenHeight = dims.screenHeight * zoom;
        const totalWidth = dims.width * zoom;
        const totalHeight = dims.height * zoom;

        // Draw previous frame in grayscale
        if (previousFrameBuffer) {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = dims.width;
            tempCanvas.height = dims.height;
            const tempCtx = tempCanvas.getContext('2d');
            const tempImageData = tempCtx.createImageData(dims.width, dims.height);

            for (let i = 0; i < previousFrameBuffer.length; i += 4) {
                const gray = Math.round(
                    (previousFrameBuffer[i] * 0.299 +
                     previousFrameBuffer[i + 1] * 0.587 +
                     previousFrameBuffer[i + 2] * 0.114) * 0.5
                );
                tempImageData.data[i] = gray;
                tempImageData.data[i + 1] = gray;
                tempImageData.data[i + 2] = gray;
                tempImageData.data[i + 3] = 255;
            }
            tempCtx.putImageData(tempImageData, 0, 0);

            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(tempCanvas, 0, 0, dims.width, dims.height,
                          0, 0, totalWidth, totalHeight);
        }

        // Draw current frame progress (colored)
        const frameComplete = beamVisY >= dims.height;
        if (beamVisY >= 0 || frameComplete) {
            const currentFrame = spectrum.ula.frameBuffer;
            if (currentFrame) {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = dims.width;
                tempCanvas.height = dims.height;
                const tempCtx = tempCanvas.getContext('2d');
                const tempImageData = tempCtx.createImageData(dims.width, dims.height);

                const maxDrawY = frameComplete ? dims.height - 1 : Math.min(beamY, dims.height - 1);
                const maxDrawX = frameComplete ? dims.width : (beamX + 1);

                for (let y = 0; y <= maxDrawY; y++) {
                    for (let x = 0; x < dims.width; x++) {
                        if (!frameComplete && y === beamY && x >= maxDrawX) break;

                        const idx = (y * dims.width + x) * 4;
                        const isScreen = x >= dims.borderLeft && x < dims.borderLeft + dims.screenWidth &&
                                         y >= dims.borderTop && y < dims.borderTop + dims.screenHeight;

                        if (borderOnlyMode && isScreen) continue;

                        tempImageData.data[idx] = currentFrame[idx];
                        tempImageData.data[idx + 1] = currentFrame[idx + 1];
                        tempImageData.data[idx + 2] = currentFrame[idx + 2];
                        tempImageData.data[idx + 3] = 255;
                    }
                }
                tempCtx.putImageData(tempImageData, 0, 0);

                ctx.drawImage(tempCanvas, 0, 0, dims.width, dims.height,
                              0, 0, totalWidth, totalHeight);
            }
        }

        // Draw grid overlay (8-pixel spacing)
        ctx.strokeStyle = 'rgba(255, 0, 255, 0.3)';
        ctx.lineWidth = 1;
        for (let row = 0; row <= dims.height; row += 8) {
            const y = Math.floor(row * zoom) + 0.5;
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(totalWidth, y); ctx.stroke();
        }
        for (let col = 0; col <= dims.width; col += 8) {
            const x = Math.floor(col * zoom) + 0.5;
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, totalHeight); ctx.stroke();
        }

        // Draw beam position marker (cyan crosshair)
        if (beamVisY >= 0 && beamVisY < dims.height && beamX >= 0 && beamX < dims.width) {
            const bx = beamX * zoom;
            const by = beamY * zoom;

            ctx.strokeStyle = '#00FFFF';
            ctx.lineWidth = 1;

            ctx.beginPath(); ctx.moveTo(0, by + 0.5); ctx.lineTo(totalWidth, by + 0.5); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(bx + 0.5, 0); ctx.lineTo(bx + 0.5, totalHeight); ctx.stroke();

            ctx.fillStyle = '#FF0000';
            ctx.beginPath();
            ctx.arc(bx, by, 2, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw beam info text
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `${12 * zoom}px monospace`;
        ctx.fillText(`T:${tStates} Line:${currentFrameLine} Pos:${posInLine}`, 4, 14 * zoom);
        ctx.fillText(`VisY:${beamY} X:${beamX}`, 4, 28 * zoom);

        // Draw screen area boundary (yellow box)
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
        ctx.lineWidth = 1;
        ctx.strokeRect(borderLeft + 0.5, borderTop + 0.5, screenWidth - 1, screenHeight - 1);
    }

    function drawNoAttrOverlay() {
        if (!currentOverlayCtx) return;
        const ctx = currentOverlayCtx;
        const dims = spectrum.getScreenDimensions();
        const palette = spectrum.ula.palette;

        const color0 = palette ? palette[0] : [0, 0, 0, 255];
        const color7 = palette ? palette[7] : [205, 205, 205, 255];

        ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = dims.width;
        tempCanvas.height = dims.height;
        const tempCtx = tempCanvas.getContext('2d');
        const tempImageData = tempCtx.createImageData(dims.width, dims.height);

        const frameBuffer = spectrum.ula.frameBuffer;
        if (!frameBuffer) return;

        for (let y = dims.borderTop; y < dims.borderTop + dims.screenHeight; y++) {
            for (let x = dims.borderLeft; x < dims.borderLeft + dims.screenWidth; x++) {
                const idx = (y * dims.width + x) * 4;
                const r = frameBuffer[idx];
                const g = frameBuffer[idx + 1];
                const b = frameBuffer[idx + 2];

                const lum = 0.299 * r + 0.587 * g + 0.114 * b;

                const color = lum > 64 ? color7 : color0;
                tempImageData.data[idx] = color[0];
                tempImageData.data[idx + 1] = color[1];
                tempImageData.data[idx + 2] = color[2];
                tempImageData.data[idx + 3] = 255;
            }
        }

        tempCtx.putImageData(tempImageData, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tempCanvas, dims.borderLeft, dims.borderTop, dims.screenWidth, dims.screenHeight,
                      dims.borderLeft * zoom, dims.borderTop * zoom, dims.screenWidth * zoom, dims.screenHeight * zoom);
    }

    function drawNoBitmapOverlay() {
        if (!currentOverlayCtx) return;
        const ctx = currentOverlayCtx;
        const dims = spectrum.getScreenDimensions();
        const frameBuffer = spectrum.ula.frameBuffer;
        if (!frameBuffer) return;

        ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = dims.width;
        tempCanvas.height = dims.height;
        const tempCtx = tempCanvas.getContext('2d');
        const tempImageData = tempCtx.createImageData(dims.width, dims.height);
        const data = tempImageData.data;

        // Copy border from frame buffer
        for (let y = 0; y < dims.height; y++) {
            for (let x = 0; x < dims.width; x++) {
                const isScreen = x >= dims.borderLeft && x < dims.borderLeft + dims.screenWidth &&
                                 y >= dims.borderTop && y < dims.borderTop + dims.screenHeight;
                if (!isScreen) {
                    const idx = (y * dims.width + x) * 4;
                    data[idx] = frameBuffer[idx];
                    data[idx + 1] = frameBuffer[idx + 1];
                    data[idx + 2] = frameBuffer[idx + 2];
                    data[idx + 3] = 255;
                }
            }
        }

        // For each 8x8 cell, detect ink/paper, fill with paper + X cross in ink
        for (let charRow = 0; charRow < 24; charRow++) {
            for (let charCol = 0; charCol < 32; charCol++) {
                const cellX = dims.borderLeft + charCol * 8;
                const cellY = dims.borderTop + charRow * 8;

                const colors = new Map();
                for (let ly = 0; ly < 8; ly++) {
                    for (let px = 0; px < 8; px++) {
                        const idx = ((cellY + ly) * dims.width + cellX + px) * 4;
                        const key = (frameBuffer[idx] << 16) | (frameBuffer[idx + 1] << 8) | frameBuffer[idx + 2];
                        colors.set(key, (colors.get(key) || 0) + 1);
                    }
                }

                const sorted = [...colors.entries()].sort((a, b) => b[1] - a[1]);
                const paperKey = sorted[0] ? sorted[0][0] : 0;
                const inkKey = sorted[1] ? sorted[1][0] : paperKey;
                const paperR = (paperKey >> 16) & 0xFF, paperG = (paperKey >> 8) & 0xFF, paperB = paperKey & 0xFF;
                const inkR = (inkKey >> 16) & 0xFF, inkG = (inkKey >> 8) & 0xFF, inkB = inkKey & 0xFF;
                const sameColor = (paperKey === inkKey);

                for (let ly = 0; ly < 8; ly++) {
                    for (let px = 0; px < 8; px++) {
                        const idx = ((cellY + ly) * dims.width + cellX + px) * 4;
                        data[idx] = paperR;
                        data[idx + 1] = paperG;
                        data[idx + 2] = paperB;
                        data[idx + 3] = 255;
                    }
                }

                if (!sameColor) {
                    for (let d = 0; d < 8; d++) {
                        const idx1 = ((cellY + d) * dims.width + cellX + d) * 4;
                        data[idx1] = inkR; data[idx1 + 1] = inkG; data[idx1 + 2] = inkB;
                        const idx2 = ((cellY + d) * dims.width + cellX + 7 - d) * 4;
                        data[idx2] = inkR; data[idx2 + 1] = inkG; data[idx2 + 2] = inkB;
                    }
                }
            }
        }

        tempCtx.putImageData(tempImageData, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tempCanvas, 0, 0, dims.width, dims.height,
                      0, 0, dims.width * zoom, dims.height * zoom);
    }

    return {
        drawOverlay,
        processFrame,
        setMode,
        setZoomLevel,
        getOverlayMode,
        isBorderOnly,
        isBeamMode,
        onDisplayDimensionsChanged,
        savePreviousFrame
    };
}

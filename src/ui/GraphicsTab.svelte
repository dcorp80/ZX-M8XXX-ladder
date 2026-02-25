<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import type { EmulatorController } from '../core/emulator-controller';

    let { emulator }: { emulator: EmulatorController } = $props();

    // ---- Helpers ----
    function hex16(v: number) { return v.toString(16).toUpperCase().padStart(4, '0'); }
    function hex8(v: number) { return v.toString(16).toUpperCase().padStart(2, '0'); }

    // ---- Constants ----
    const GFX_DUMP_COLS = 24;
    const GFX_DUMP_ROWS = 302;
    const ANCHOR_ROW = 8;

    // ---- Canvas refs ----
    let dumpCanvas: HTMLCanvasElement;
    let previewCanvas: HTMLCanvasElement;
    let dumpWrap: HTMLDivElement;
    let dumpCtx: CanvasRenderingContext2D | null = null;
    let previewCtx: CanvasRenderingContext2D | null = null;

    // ---- State ----
    let spriteAddress = $state(0x3000);
    let addrInput = $state('3000');
    let widthBytes = $state(24);
    let widthInput = $state('24');
    let heightRows = $state(8);
    let heightInput = $state('8');
    let invert = $state(false);
    let showGrid = $state(true);
    let charMode = $state(false);
    let zoom = $state(2);
    let commentText = $state('');
    let infoText = $state('3000h: 192x8');

    // ---- Tooltip state ----
    let tooltipText = $state('');
    let tooltipX = $state(0);
    let tooltipY = $state(0);
    let tooltipVisible = $state(false);
    let tooltipTimeout: ReturnType<typeof setTimeout> | null = null;

    // ---- Derived params ----
    function getParams() {
        const w = Math.max(1, Math.min(32, widthBytes));
        const h = Math.max(1, Math.min(64, heightRows));
        return {
            widthBytes: w, heightRows: h,
            widthPx: w * 8,
            bytesPerSprite: w * h,
            invert, showGrid, charMode
        };
    }

    // ---- Render functions ----
    function renderGfxDump() {
        if (!dumpCtx || !emulator.romLoaded) return;
        const p = getParams();
        const canvasWidth = GFX_DUMP_COLS * 8 * zoom;
        const canvasHeight = GFX_DUMP_ROWS * zoom;
        const viewStartAddr = (spriteAddress - p.widthBytes * ANCHOR_ROW) & 0xffff;

        dumpCanvas.width = canvasWidth;
        dumpCanvas.height = canvasHeight;

        // Clear
        dumpCtx.fillStyle = '#808080';
        dumpCtx.fillRect(0, 0, canvasWidth, canvasHeight);

        const fgColor = p.invert ? '#000000' : '#00cc00';
        const bgColor = p.invert ? '#00cc00' : '#000000';

        for (let row = 0; row < GFX_DUMP_ROWS; row++) {
            for (let col = 0; col < p.widthBytes; col++) {
                let addr: number;
                if (p.charMode) {
                    const charRow = Math.floor(row / 8);
                    const lineInChar = row % 8;
                    addr = (viewStartAddr + (charRow * p.widthBytes + col) * 8 + lineInChar) & 0xffff;
                } else {
                    addr = (viewStartAddr + row * p.widthBytes + col) & 0xffff;
                }
                const byte = emulator.peek(addr);
                const x = col * 8 * zoom;
                const y = row * zoom;

                dumpCtx.fillStyle = bgColor;
                dumpCtx.fillRect(x, y, 8 * zoom, zoom);

                dumpCtx.fillStyle = fgColor;
                for (let bit = 0; bit < 8; bit++) {
                    if ((byte >> (7 - bit)) & 1) {
                        dumpCtx.fillRect(x + bit * zoom, y, zoom, zoom);
                    }
                }
            }
        }

        // Selection rectangle
        const rectX = 0;
        const rectY = ANCHOR_ROW * zoom;
        const rectW = p.widthBytes * 8 * zoom;
        const rectH = p.heightRows * zoom;
        dumpCtx.strokeStyle = '#ff0000';
        dumpCtx.lineWidth = 2;
        dumpCtx.strokeRect(rectX + 1, rectY + 1, rectW - 2, rectH - 2);

        // Grid
        if (p.showGrid) {
            dumpCtx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            dumpCtx.lineWidth = 1;
            const spriteWidthPx = p.widthBytes * 8 * zoom;
            for (let col = 0; col <= p.widthBytes; col++) {
                const gx = col * 8 * zoom;
                dumpCtx.beginPath();
                dumpCtx.moveTo(gx + 0.5, 0);
                dumpCtx.lineTo(gx + 0.5, canvasHeight);
                dumpCtx.stroke();
            }
            for (let r = 0; r <= GFX_DUMP_ROWS; r += 8) {
                const gy = r * zoom;
                dumpCtx.beginPath();
                dumpCtx.moveTo(0, gy + 0.5);
                dumpCtx.lineTo(spriteWidthPx, gy + 0.5);
                dumpCtx.stroke();
            }
        }
    }

    function renderGfxPreview() {
        if (!previewCtx || !emulator.romLoaded) return;
        const p = getParams();
        const pz = 2; // preview zoom
        const canvasW = p.widthPx * pz;
        const canvasH = p.heightRows * pz;

        previewCanvas.width = canvasW;
        previewCanvas.height = canvasH;

        const fgColor = p.invert ? '#000000' : '#00cc00';
        const bgColor = p.invert ? '#00cc00' : '#000000';

        previewCtx.fillStyle = bgColor;
        previewCtx.fillRect(0, 0, canvasW, canvasH);

        for (let row = 0; row < p.heightRows; row++) {
            for (let byteX = 0; byteX < p.widthBytes; byteX++) {
                let addr: number;
                if (p.charMode) {
                    const charRow = Math.floor(row / 8);
                    const lineInChar = row % 8;
                    addr = (spriteAddress + (charRow * p.widthBytes + byteX) * 8 + lineInChar) & 0xffff;
                } else {
                    addr = (spriteAddress + row * p.widthBytes + byteX) & 0xffff;
                }
                const byte = emulator.peek(addr);

                previewCtx.fillStyle = bgColor;
                previewCtx.fillRect(byteX * 8 * pz, row * pz, 8 * pz, pz);

                previewCtx.fillStyle = fgColor;
                for (let bit = 0; bit < 8; bit++) {
                    if ((byte >> (7 - bit)) & 1) {
                        previewCtx.fillRect((byteX * 8 + bit) * pz, row * pz, pz, pz);
                    }
                }
            }
        }

        // Border
        previewCtx.strokeStyle = '#ff0000';
        previewCtx.lineWidth = 2;
        previewCtx.strokeRect(1, 1, canvasW - 2, canvasH - 2);

        // Grid
        if (p.showGrid) {
            previewCtx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            previewCtx.lineWidth = 1;
            for (let x = 8; x < p.widthPx; x += 8) {
                previewCtx.beginPath();
                previewCtx.moveTo(x * pz + 0.5, 0);
                previewCtx.lineTo(x * pz + 0.5, canvasH);
                previewCtx.stroke();
            }
            for (let y = 8; y <= p.heightRows; y += 8) {
                previewCtx.beginPath();
                previewCtx.moveTo(0, y * pz + 0.5);
                previewCtx.lineTo(canvasW, y * pz + 0.5);
                previewCtx.stroke();
            }
        }

        infoText = `${hex16(spriteAddress)}h: ${p.widthPx}x${p.heightRows}`;
    }

    function updateViewer() {
        renderGfxDump();
        renderGfxPreview();
    }

    // ---- Navigation ----
    function navigate(delta: number) {
        spriteAddress = (spriteAddress + delta) & 0xffff;
        addrInput = hex16(spriteAddress);
        updateViewer();
    }

    function goToAddress() {
        spriteAddress = parseInt(addrInput, 16) || 0;
        updateViewer();
    }

    function navByteBack() { const p = getParams(); navigate(p.charMode ? -p.heightRows : -1); }
    function navByteFwd()  { const p = getParams(); navigate(p.charMode ?  p.heightRows :  1); }
    function navLineBack() { const p = getParams(); navigate(p.charMode ? -1 : -p.widthBytes); }
    function navLineFwd()  { const p = getParams(); navigate(p.charMode ?  1 :  p.widthBytes); }
    function navRowBack()  { const p = getParams(); navigate(-p.widthBytes * 8); }
    function navRowFwd()   { const p = getParams(); navigate( p.widthBytes * 8); }
    function navSprBack()  { const p = getParams(); navigate(-p.bytesPerSprite); }
    function navSprFwd()   { const p = getParams(); navigate( p.bytesPerSprite); }
    function navPageBack() { const p = getParams(); navigate(-p.widthBytes * 8 * 24); }
    function navPageFwd()  { const p = getParams(); navigate( p.widthBytes * 8 * 24); }

    // ---- Width/Height spinners ----
    function setWidth(v: number) {
        widthBytes = Math.max(1, Math.min(32, v));
        widthInput = String(widthBytes);
        updateViewer();
    }
    function setHeight(v: number) {
        heightRows = Math.max(1, Math.min(64, v));
        heightInput = String(heightRows);
        updateViewer();
    }
    function applyWidthInput() {
        setWidth(parseInt(widthInput) || 1);
    }
    function applyHeightInput() {
        setHeight(parseInt(heightInput) || 8);
    }
    function heightDec8() {
        const cur = heightRows;
        const rem = cur % 8;
        setHeight(rem === 0 ? Math.max(8, cur - 8) : Math.max(8, cur - rem));
    }
    function heightInc8() {
        const cur = heightRows;
        const rem = cur % 8;
        setHeight(rem === 0 ? Math.min(64, cur + 8) : Math.min(64, cur + (8 - rem)));
    }

    // ---- Option changes ----
    function onOptionChange() {
        updateViewer();
    }

    // ---- Mouse wheel ----
    function onWheel(e: WheelEvent) {
        e.preventDefault();
        const p = getParams();
        const step = p.charMode ? 1 : p.widthBytes;
        navigate(e.deltaY > 0 ? step : -step);
    }

    // ---- Canvas click tooltip ----
    function onDumpClick(e: MouseEvent) {
        const p = getParams();
        const rect = dumpCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const col = Math.floor(x / (8 * zoom));
        const row = Math.floor(y / zoom);
        if (col >= p.widthBytes) return;

        const viewStartAddr = (spriteAddress - p.widthBytes * ANCHOR_ROW) & 0xffff;
        let addr: number;
        if (p.charMode) {
            const charRow = Math.floor(row / 8);
            const lineInChar = row % 8;
            addr = (viewStartAddr + (charRow * p.widthBytes + col) * 8 + lineInChar) & 0xffff;
        } else {
            addr = (viewStartAddr + row * p.widthBytes + col) & 0xffff;
        }

        tooltipText = hex16(addr) + 'h';
        tooltipX = e.clientX + 10;
        tooltipY = e.clientY - 25;
        tooltipVisible = true;
        if (tooltipTimeout) clearTimeout(tooltipTimeout);
        tooltipTimeout = setTimeout(() => { tooltipVisible = false; }, 2000);
    }

    // ---- Copy ASM ----
    function generateSpriteAsm(): string {
        const p = getParams();
        const lines: string[] = [];
        const addrHex = hex16(spriteAddress);
        if (commentText) lines.push(`; ${commentText}`);
        const charNote = p.charMode ? ', char-based' : '';
        lines.push(`; ${addrHex}h: ${p.widthPx}x${p.heightRows} (${p.bytesPerSprite} bytes${charNote})`);

        if (p.charMode) {
            lines.push(';');
            lines.push('; Visual:');
            for (let row = 0; row < p.heightRows; row++) {
                let vis = ';   ';
                for (let col = 0; col < p.widthBytes; col++) {
                    const charRow = Math.floor(row / 8);
                    const lineInChar = row % 8;
                    const addr = (spriteAddress + (charRow * p.widthBytes + col) * 8 + lineInChar) & 0xffff;
                    const byte = emulator.peek(addr);
                    for (let bit = 7; bit >= 0; bit--) vis += (byte >> bit) & 1 ? '\u2588' : '\u00B7';
                }
                lines.push(vis);
            }
            lines.push('');
            const charsWide = p.widthBytes;
            const charsTall = Math.ceil(p.heightRows / 8);
            for (let cy = 0; cy < charsTall; cy++) {
                for (let cx = 0; cx < charsWide; cx++) {
                    const charBase = spriteAddress + (cy * charsWide + cx) * 8;
                    lines.push(`; Char ${cx},${cy}`);
                    const rowBytes: string[] = [];
                    for (let ln = 0; ln < 8; ln++) {
                        rowBytes.push('$' + hex8(emulator.peek((charBase + ln) & 0xffff)));
                    }
                    lines.push('        db ' + rowBytes.join(', '));
                }
            }
        } else {
            lines.push('');
            for (let row = 0; row < p.heightRows; row++) {
                const rowBytes: string[] = [];
                const visParts: string[] = [];
                for (let col = 0; col < p.widthBytes; col++) {
                    const addr = (spriteAddress + row * p.widthBytes + col) & 0xffff;
                    const byte = emulator.peek(addr);
                    rowBytes.push('$' + hex8(byte));
                    let vis = '';
                    for (let bit = 7; bit >= 0; bit--) vis += (byte >> bit) & 1 ? '\u2588' : '\u00B7';
                    visParts.push(vis);
                }
                lines.push('        db ' + rowBytes.join(', ') + ' ; ' + visParts.join(' '));
            }
        }
        return lines.join('\n');
    }

    function copyAsm() {
        const text = generateSpriteAsm();
        navigator.clipboard.writeText(text).catch(() => alert(text));
    }

    function saveAsm() {
        const text = generateSpriteAsm();
        const addrHex = hex16(spriteAddress);
        const filename = commentText
            ? commentText.replace(/[^a-zA-Z0-9_-]/g, '_') + '.asm'
            : 'sprite_' + addrHex + '.asm';
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
    }

    // ---- Key handler ----
    function onEnter(e: KeyboardEvent, fn: () => void) {
        if (e.key === 'Enter') fn();
    }

    // ---- Lifecycle ----
    let refreshInterval: ReturnType<typeof setInterval> | null = null;

    onMount(() => {
        dumpCtx = dumpCanvas.getContext('2d');
        previewCtx = previewCanvas.getContext('2d');
        updateViewer();
        refreshInterval = setInterval(() => {
            if (emulator.romLoaded) updateViewer();
        }, 500);
    });

    onDestroy(() => {
        if (refreshInterval) clearInterval(refreshInterval);
        if (tooltipTimeout) clearTimeout(tooltipTimeout);
    });
</script>

<div class="graphics-container">
    <div class="graphics-body">
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="graphics-dump-wrap" bind:this={dumpWrap} onwheel={onWheel}>
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <canvas class="graphics-dump-canvas" bind:this={dumpCanvas} onclick={onDumpClick}></canvas>
        </div>
        <div class="gfx-col-address">
            <div class="gfx-control-group">
                <label>Address</label>
                <input type="text" class="gfx-addr-input" bind:value={addrInput} maxlength="4" title="Memory address in hex (Enter to apply)" onkeydown={(e) => onEnter(e, goToAddress)}>
            </div>
            <div class="gfx-control-group">
                <label>Navigate</label>
                <div class="gfx-nav-buttons">
                    <button onclick={navByteBack} title="Back 1 byte">-1</button>
                    <button onclick={navByteFwd} title="Forward 1 byte">+1</button>
                </div>
                <div class="gfx-nav-buttons">
                    <button onclick={navLineBack} title="Back 1 line">-Line</button>
                    <button onclick={navLineFwd} title="Forward 1 line">+Line</button>
                </div>
                <div class="gfx-nav-buttons">
                    <button onclick={navRowBack} title="Back 8 lines">-Row</button>
                    <button onclick={navRowFwd} title="Forward 8 lines">+Row</button>
                </div>
                <div class="gfx-nav-buttons">
                    <button onclick={navSprBack} title="Previous sprite">-Spr</button>
                    <button onclick={navSprFwd} title="Next sprite">+Spr</button>
                </div>
                <div class="gfx-nav-buttons">
                    <button onclick={navPageBack} title="Back 24 rows (192 lines)">-Page</button>
                    <button onclick={navPageFwd} title="Forward 24 rows (192 lines)">+Page</button>
                </div>
            </div>
            <div class="gfx-control-group">
                <label>Width (bytes)</label>
                <div class="gfx-spinner">
                    <button onclick={() => setWidth(1)} title="Minimum width (1 byte)" disabled={widthBytes <= 1}>|&lt;</button>
                    <button onclick={() => setWidth(widthBytes - 1)} title="Decrease width" disabled={widthBytes <= 1}>-</button>
                    <input type="text" bind:value={widthInput} maxlength="2" title="Sprite width in bytes (1-32)" onkeydown={(e) => onEnter(e, applyWidthInput)} onblur={applyWidthInput}>
                    <button onclick={() => setWidth(widthBytes + 1)} title="Increase width" disabled={widthBytes >= 32}>+</button>
                    <button onclick={() => setWidth(32)} title="Maximum width (32 bytes)" disabled={widthBytes >= 32}>&gt;|</button>
                </div>
            </div>
            <div class="gfx-control-group">
                <label>Height (lines)</label>
                <div class="gfx-spinner">
                    <button onclick={heightDec8} title="Decrease height by 8 lines" disabled={heightRows <= 8}>-8</button>
                    <button onclick={() => setHeight(heightRows - 1)} title="Decrease height" disabled={heightRows <= 1}>-</button>
                    <input type="text" bind:value={heightInput} maxlength="2" title="Sprite height in lines (1-64)" onkeydown={(e) => onEnter(e, applyHeightInput)} onblur={applyHeightInput}>
                    <button onclick={() => setHeight(heightRows + 1)} title="Increase height" disabled={heightRows >= 64}>+</button>
                    <button onclick={heightInc8} title="Increase height by 8 lines" disabled={heightRows >= 64}>+8</button>
                </div>
            </div>
            <div class="gfx-control-group gfx-checkboxes">
                <label title="Invert colors (white on black)"><input type="checkbox" bind:checked={invert} onchange={onOptionChange}> Invert</label>
                <label title="Show pixel grid overlay"><input type="checkbox" bind:checked={showGrid} onchange={onOptionChange}> Grid</label>
                <label title="Character mode: 8x8 tiles stored sequentially"><input type="checkbox" bind:checked={charMode} onchange={onOptionChange}> Char</label>
                <div class="gfx-zoom-inline">
                    <label title="1:1 zoom"><input type="radio" name="gfxZoom" value={1} bind:group={zoom} onchange={onOptionChange}> x1</label>
                    <label title="2:1 zoom"><input type="radio" name="gfxZoom" value={2} bind:group={zoom} onchange={onOptionChange}> x2</label>
                    <label title="3:1 zoom"><input type="radio" name="gfxZoom" value={3} bind:group={zoom} onchange={onOptionChange}> x3</label>
                </div>
            </div>
            <div class="gfx-control-group">
                <label>Preview</label>
                <div class="gfx-preview-wrap">
                    <canvas class="gfx-preview-canvas" bind:this={previewCanvas}></canvas>
                </div>
                <div class="gfx-info">{infoText}</div>
            </div>
        </div>
        <div class="gfx-col-actions">
            <div class="gfx-control-group">
                <label>Comment</label>
                <input type="text" bind:value={commentText} placeholder="Sprite name..." maxlength="40" title="Label for the graphics region">
            </div>
            <div class="gfx-control-group gfx-actions">
                <button title="Mark selected area as graphics region (not yet wired)">Mark</button>
                <button onclick={copyAsm} title="Copy selection as assembly DEFB statements">Copy</button>
                <button onclick={saveAsm} title="Save selection as .asm file">Save</button>
                <button title="Export all marked graphics regions (not yet wired)">Export</button>
            </div>
            <div class="gfx-control-group gfx-actions">
                <button title="Go to address in Disassembler (not yet wired)">→Disasm</button>
                <button title="Go to address in Memory view (not yet wired)">→Memdump</button>
            </div>
        </div>
    </div>
</div>

{#if tooltipVisible}
    <div class="gfx-tooltip" style="left: {tooltipX}px; top: {tooltipY}px;">{tooltipText}</div>
{/if}

<style>
    .graphics-container {
        padding: 10px;
        height: auto;
        display: flex;
        flex-direction: column;
    }
    .graphics-body {
        display: flex;
        gap: 10px;
        flex: 1;
        overflow: visible;
    }
    .graphics-dump-wrap {
        flex: 1;
        overflow: auto;
        background: #000;
        border: 1px solid var(--bg-button);
        max-height: calc(100vh - 200px);
    }
    .graphics-dump-canvas {
        image-rendering: pixelated;
        display: block;
    }
    .gfx-col-address,
    .gfx-col-actions {
        display: flex;
        flex-direction: column;
        gap: 6px;
        flex-shrink: 0;
    }
    .gfx-control-group {
        background: var(--bg-secondary);
        border: 1px solid var(--bg-button);
        border-radius: 4px;
        padding: 8px;
    }
    .gfx-control-group label {
        display: block;
        font-size: 10px;
        color: var(--text-secondary);
        margin-bottom: 4px;
    }
    .gfx-control-group input[type="text"] {
        width: 100%;
        padding: 4px 6px;
        background: var(--bg-primary);
        border: 1px solid var(--bg-button);
        color: var(--text-primary);
        border-radius: 3px;
        font-family: monospace;
        font-size: 12px;
        box-sizing: border-box;
    }
    .gfx-addr-input {
        width: 50px !important;
    }
    .gfx-spinner {
        display: flex;
        gap: 2px;
    }
    .gfx-spinner input {
        width: 30px !important;
        max-width: 30px;
        flex: 0 0 30px;
        text-align: center;
    }
    .gfx-spinner button {
        width: 28px;
        padding: 4px;
        background: var(--bg-button);
        border: 1px solid var(--bg-button);
        color: var(--text-primary);
        cursor: pointer;
        border-radius: 3px;
        font-size: 11px;
    }
    .gfx-spinner button:hover {
        background: var(--accent);
        color: var(--bg-primary);
    }
    .gfx-spinner button:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
    .gfx-spinner button:disabled:hover {
        background: var(--bg-button);
        color: var(--text-primary);
    }
    .gfx-checkboxes label {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        margin-right: 10px;
        cursor: pointer;
    }
    .gfx-zoom-inline {
        display: flex;
        gap: 6px;
        margin-top: 4px;
    }
    .gfx-zoom-inline label {
        margin-right: 0;
    }
    .gfx-nav-buttons {
        display: flex;
        gap: 2px;
        margin-bottom: 2px;
        width: 160px;
    }
    .gfx-nav-buttons button {
        flex: 1;
        padding: 4px 6px;
        background: var(--bg-button);
        border: 1px solid var(--bg-button);
        color: var(--text-primary);
        cursor: pointer;
        border-radius: 3px;
        font-size: 10px;
    }
    .gfx-nav-buttons button:hover {
        background: var(--accent);
        color: var(--bg-primary);
    }
    .gfx-preview-wrap {
        background: #000;
        border: 1px solid var(--bg-button);
        padding: 4px;
        display: flex;
        justify-content: center;
        align-items: flex-start;
        overflow: hidden;
        max-width: 160px;
        min-height: 200px;
    }
    .gfx-preview-canvas {
        image-rendering: pixelated;
        max-width: 100%;
    }
    .gfx-info {
        font-size: 10px;
        color: var(--text-secondary);
        text-align: center;
        margin-top: 4px;
    }
    .gfx-actions {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    .gfx-actions button {
        padding: 6px 8px;
        background: var(--bg-button);
        border: 1px solid var(--accent);
        color: var(--accent);
        cursor: pointer;
        border-radius: 3px;
        font-size: 11px;
    }
    .gfx-actions button:hover {
        background: var(--accent);
        color: var(--bg-primary);
    }
    .gfx-tooltip {
        position: fixed;
        background: rgba(0, 0, 0, 0.9);
        color: #fff;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-family: monospace;
        pointer-events: none;
        z-index: 1000;
    }

    @media (min-width: 1400px) {
        .graphics-container {
            max-height: calc(100vh - 100px) !important;
        }
        .graphics-dump-wrap {
            max-height: calc(100vh - 180px) !important;
        }
    }
</style>

<script lang="ts">
    import type { EmulatorController } from '../../core/emulator-controller';

    let { emulator }: { emulator: EmulatorController } = $props();

    let visible = $state(false);
    let viewMode = $state<'heatmap' | 'banks'>('heatmap');
    let canvasElement = $state<HTMLCanvasElement | null>(null);

    export function show() {
        visible = true;
        if (canvasElement) {
            renderMemoryMap();
        }
    }

    function close() {
        visible = false;
    }

    function setViewMode(mode: 'heatmap' | 'banks') {
        viewMode = mode;
        if (visible && canvasElement) {
            renderMemoryMap();
        }
    }

    function renderMemoryMap() {
        if (!canvasElement) return;
        const ctx = canvasElement.getContext('2d');
        if (!ctx) return;

        const width = canvasElement.width;
        const height = canvasElement.height;
        const memorySize = 65536; // 64KB

        if (viewMode === 'heatmap') {
            // Placeholder: render simple memory heatmap
            const imageData = ctx.createImageData(width, height);
            const data = imageData.data;

            for (let i = 0; i < data.length; i += 4) {
                // Simple gradient for visualization
                const value = Math.floor((i / data.length) * 255);
                data[i] = value;
                data[i + 1] = 0;
                data[i + 2] = 255 - value;
                data[i + 3] = 255;
            }
            ctx.putImageData(imageData, 0, 0);
        } else {
            // Banks view - simple placeholder
            ctx.fillStyle = 'var(--bg-primary)';
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = 'var(--cyan)';
            ctx.font = '12px monospace';
            ctx.fillText('Memory Bank View', 10, height / 2);
        }
    }

    $effect(() => {
        if (visible && canvasElement) {
            renderMemoryMap();
        }
    });
</script>

{#if visible}
    <div class="memmap-dialog">
        <div class="memmap-content">
            <div class="memmap-header">
                <div class="memmap-view-toggle">
                    <button
                        class="memmap-view-btn"
                        class:active={viewMode === 'heatmap'}
                        onclick={() => setViewMode('heatmap')}
                    >
                        Heatmap
                    </button>
                    <button
                        class="memmap-view-btn"
                        class:active={viewMode === 'banks'}
                        onclick={() => setViewMode('banks')}
                    >
                        Banks
                    </button>
                </div>
                <button class="memmap-close" onclick={close}>Close</button>
            </div>

            <h3 class="memmap-title">Memory Layout</h3>

            <div class="memmap-body">
                <div class="memmap-canvas-container">
                    <canvas bind:this={canvasElement} id="memmapCanvas" width="512" height="512"></canvas>
                    <div class="memmap-tooltip"></div>
                </div>

                <div class="memmap-sidebar">
                    <div class="memmap-legend">
                        <div class="memmap-legend-item">
                            <div class="memmap-legend-color" style="background: #ff0000;"></div>
                            <span>Code</span>
                        </div>
                        <div class="memmap-legend-item">
                            <div class="memmap-legend-color" style="background: #00ff00;"></div>
                            <span>Data</span>
                        </div>
                        <div class="memmap-legend-item">
                            <div class="memmap-legend-color" style="background: #0000ff;"></div>
                            <span>Graphics</span>
                        </div>
                        <div class="memmap-legend-item">
                            <div class="memmap-legend-color" style="background: #808080;"></div>
                            <span>Uninitialized</span>
                        </div>
                    </div>

                    <div class="memmap-stats">
                        <table>
                            <tbody>
                                <tr>
                                    <td>Region</td>
                                    <td>Bytes</td>
                                    <td>%</td>
                                </tr>
                                <tr>
                                    <td>Code</td>
                                    <td>0</td>
                                    <td>0%</td>
                                </tr>
                                <tr>
                                    <td>Data</td>
                                    <td>0</td>
                                    <td>0%</td>
                                </tr>
                                <tr class="total">
                                    <td>Total</td>
                                    <td>65536</td>
                                    <td>100%</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div class="memmap-addr-info">Address Info:
                    </div>
                </div>
            </div>

            <div class="memmap-heatmap-scale">
                <span>Access Frequency:</span>
                <div class="memmap-gradient"></div>
            </div>
        </div>
    </div>
{/if}

<style>
    .memmap-dialog {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    }

    .memmap-content {
        background: var(--bg-secondary);
        border-radius: 8px;
        padding: 10px 15px 15px 15px;
        max-width: 90vw;
        max-height: 90vh;
        overflow: auto;
        min-width: 750px;
        position: relative;
    }

    .memmap-header {
        position: absolute;
        top: 8px;
        right: 10px;
        z-index: 10;
        display: flex;
        gap: 10px;
    }

    .memmap-title {
        margin: 0;
        margin-top: auto;
        color: var(--text-secondary);
        font-size: 12px;
        font-weight: normal;
        margin-bottom: 15px;
    }

    .memmap-view-toggle {
        display: flex;
        gap: 2px;
    }

    .memmap-view-btn {
        background: var(--bg-button);
        border: 1px solid var(--bg-button);
        color: var(--text-secondary);
        padding: 4px 12px;
        cursor: pointer;
        font-size: 11px;
    }

    .memmap-view-btn:first-child {
        border-radius: 4px 0 0 4px;
    }

    .memmap-view-btn:last-child {
        border-radius: 0 4px 4px 0;
    }

    .memmap-view-btn.active {
        background: var(--accent);
        color: var(--bg-primary);
        border-color: var(--accent);
    }

    .memmap-view-btn:hover:not(.active) {
        background: var(--bg-button-hover);
    }

    .memmap-close {
        background: var(--bg-button);
        border: none;
        color: var(--text-primary);
        padding: 5px 15px;
        border-radius: 4px;
        cursor: pointer;
    }

    .memmap-close:hover {
        background: var(--bg-button-hover);
    }

    .memmap-body {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        align-items: flex-start;
        margin-top: 30px;
    }

    .memmap-canvas-container {
        position: relative;
        width: 512px;
        height: 512px;
        flex-shrink: 0;
    }

    #memmapCanvas {
        border: 1px solid var(--bg-button);
        cursor: crosshair;
        image-rendering: pixelated;
    }

    .memmap-tooltip {
        position: absolute;
        background: rgba(0, 0, 0, 0.9);
        color: #fff;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 11px;
        pointer-events: none;
        white-space: nowrap;
        display: none;
    }

    .memmap-sidebar {
        width: 220px;
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        min-height: 512px;
        padding-top: 5px;
    }

    .memmap-legend {
        margin-bottom: 15px;
    }

    .memmap-legend-item {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 4px 0;
        font-size: 12px;
    }

    .memmap-legend-color {
        width: 16px;
        height: 16px;
        border-radius: 2px;
    }

    .memmap-stats {
        font-size: 12px;
    }

    .memmap-stats table {
        width: 100%;
        border-collapse: collapse;
    }

    .memmap-stats td {
        padding: 3px 5px;
        color: var(--text-secondary);
    }

    .memmap-stats td:nth-child(2),
    .memmap-stats td:nth-child(3) {
        text-align: right;
        font-family: monospace;
    }

    .memmap-stats tr.total {
        border-top: 1px solid var(--bg-button);
        font-weight: bold;
        color: var(--text-primary);
    }

    .memmap-addr-info {
        margin-top: 15px;
        padding: 8px;
        background: var(--bg-primary);
        border-radius: 4px;
        font-family: monospace;
        font-size: 11px;
        height: 80px;
        overflow: hidden;
        white-space: pre-wrap;
        color: var(--text-secondary);
    }

    .memmap-heatmap-scale {
        display: flex;
        align-items: center;
        gap: 5px;
        margin-top: 10px;
        font-size: 10px;
        color: var(--text-secondary);
    }

    .memmap-gradient {
        flex: 1;
        height: 12px;
        background: linear-gradient(to right, #000, #0066ff, #00ff66, #ff6600, #fff);
        border-radius: 2px;
    }
</style>

<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import type { EmulatorController } from '../core/emulator-controller';
    let { emulator }: { emulator: EmulatorController } = $props();

    let fps = $state(0);
    let rzxPlaying = $state(false);
    let rzxFrame = $state(0);
    let rzxTotal = $state(0);
    let tapeLoaded = $state(false);
    let tapePlaying = $state(false);
    let tapeProgress = $state('');
    let diskLoaded = $state(false);

    let statusInterval: ReturnType<typeof setInterval>;

    onMount(() => {
        statusInterval = setInterval(updateStatus, 500);
        updateStatus();
    });

    onDestroy(() => {
        clearInterval(statusInterval);
    });

    function updateStatus() {
        fps = emulator.getFps();

        rzxPlaying = emulator.isRZXPlaying();
        if (rzxPlaying) {
            rzxFrame = emulator.getRZXFrame();
            rzxTotal = emulator.getRZXTotalFrames();
        }

        const pos = emulator.getTapePosition();
        tapeLoaded = pos && pos.totalBlocks > 0;
        tapePlaying = emulator.isTapePlaying();
        if (tapeLoaded) {
            tapeProgress = `${pos.currentBlock + 1}/${pos.totalBlocks}`;
        }

        // Disk: check via escape hatch — fdc or betaDisk have disk data
        const s = emulator.spectrum;
        diskLoaded = !!(s.fdc?.hasDisk?.(0) || s.betaDisk?.hasDisk?.());
    }

    function stopRzx() {
        emulator.rzxStop();
        updateStatus();
    }
</script>

<div class="status">
    <span class="status-item">
        <span class="status-value fps-value">{fps}</span>
    </span>
    {#if rzxPlaying}
        <span class="status-item">
            <span class="status-label">RZX:</span>
            <span class="status-value rzx-value">{rzxFrame}/{rzxTotal}</span>
            <button class="small-btn" title="Stop RZX playback" onclick={stopRzx}>Stop</button>
        </span>
    {/if}
    {#if tapeLoaded}
        <span class="status-item">
            <span class="status-label" title={tapePlaying ? 'Tape playing' : 'Tape loaded'}>{tapePlaying ? '▶️' : '📼'}</span>
            <span class="status-value tape-value">{tapeProgress}</span>
        </span>
    {/if}
    {#if diskLoaded}
        <span class="status-item">
            <span class="status-label" title="Disk loaded">💾</span>
        </span>
    {/if}
</div>

<style>
    .status {
        text-align: left;
        padding: 6px;
        background: var(--bg-secondary);
        border-radius: 4px;
        margin-bottom: 8px;
        font-family: monospace;
        border: none;
        box-shadow: none;
        outline: none;
        overflow: hidden;
    }
    .status-item { display: inline-block; margin: 0 6px; }
    .status-label { color: var(--text-secondary); }
    .status-value { color: var(--cyan); }
    .fps-value { min-width: 32px; display: inline-block; text-align: right; }
    .rzx-value { min-width: 130px; display: inline-block; font-variant-numeric: tabular-nums; }
    .tape-value { min-width: 30px; display: inline-block; text-align: right; }
    .small-btn {
        padding: 2px 6px;
        font-size: 10px;
        margin-left: 5px;
        background: var(--bg-button);
        border: 1px solid var(--bg-button);
        color: var(--text-primary);
        border-radius: 3px;
        cursor: pointer;
    }
    .small-btn:hover { background: var(--accent); }
</style>

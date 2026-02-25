<script lang="ts">
    import type { EmulatorController } from '../core/emulator-controller';
    let { emulator }: { emulator: EmulatorController } = $props();

    let running = $state(false);
    let soundEnabled = $state(false);

    // Poll running state at 500ms (matches original)
    let statusInterval: ReturnType<typeof setInterval>;
    import { onMount, onDestroy } from 'svelte';

    onMount(() => {
        statusInterval = setInterval(updateStatus, 500);
        updateStatus();
    });
    onDestroy(() => clearInterval(statusInterval));

    function updateStatus() {
        running = emulator.isRunning();
    }

    function toggleRun() {
        if (!emulator.romLoaded) return;
        emulator.toggle();
        updateStatus();
    }

    function resetMachine() {
        if (!confirm('Reset machine? This will lose current state.')) return;
        emulator.reset();
        updateStatus();
    }

    function changeSpeed(e: Event) {
        const speed = parseInt((e.target as HTMLSelectElement).value, 10);
        emulator.setSpeed(speed);
    }

    async function toggleSound() {
        if (!soundEnabled) {
            const audio = emulator.initAudio();
            await audio.start();
            audio.setMuted(false);
            soundEnabled = true;
            localStorage.setItem('zx-sound-enabled', 'true');
        } else {
            const audio = emulator.getAudio();
            if (audio) audio.setMuted(true);
            soundEnabled = false;
            localStorage.setItem('zx-sound-enabled', 'false');
        }
    }

    function toggleFullscreen() {
        const wrapper = document.querySelector('.screen-wrapper') as HTMLElement;
        if (!wrapper) return;
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            wrapper.requestFullscreen();
        }
    }

    function takeScreenshot() {
        const canvas = document.getElementById('screen') as HTMLCanvasElement;
        if (!canvas) return;
        canvas.toBlob((blob) => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `screenshot_${emulator.getMachineType()}_${Date.now()}.png`;
            a.click();
            URL.revokeObjectURL(url);
        }, 'image/png');
    }
</script>

<div class="controls">
    <button title="Save screenshot" onclick={takeScreenshot}>📷</button>
    <button class="primary run-btn" title="Run/Pause emulation (F5)" onclick={toggleRun}>
        {running ? 'Pause' : 'Run'}
    </button>
    <button title="Reset machine" onclick={resetMachine}>Reset</button>
    <select title="Emulation speed" onchange={changeSpeed}>
        <option value="10">10%</option>
        <option value="25">25%</option>
        <option value="50">50%</option>
        <option value="75">75%</option>
        <option value="100" selected>100%</option>
        <option value="200">200%</option>
        <option value="400">400%</option>
        <option value="0">Max</option>
    </select>
    <button title="Toggle sound" onclick={toggleSound}>{soundEnabled ? '🔊' : '🔇'}</button>
    <button title="Toggle fullscreen (F11)" onclick={toggleFullscreen}>⛶</button>
</div>

<style>
    .controls {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        justify-content: center;
        margin-bottom: 4px;
    }
    .controls :global(button),
    .controls :global(select) {
        padding: 2px 10px;
        font-size: 13px;
        height: 26px;
    }
    .run-btn { width: 90px; text-align: center; }
</style>

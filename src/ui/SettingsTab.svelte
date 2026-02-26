<script lang="ts">
    import { onMount } from 'svelte';
    import type { EmulatorController } from '../core/emulator-controller';
    import { MACHINE_PROFILES, DEFAULT_VISIBLE_MACHINES, getMachineTypes } from '../machines/profiles';
    import { PaletteManager, type Palette } from '../core/palette-manager';
    import { showMessage } from './toast.svelte';

    let { emulator }: { emulator: EmulatorController } = $props();

    type Subtab = 'display' | 'input' | 'media' | 'audio' | 'machines';
    let activeSubtab: Subtab = $state('display');

    const subtabs: { id: Subtab; label: string }[] = [
        { id: 'display', label: 'Display' },
        { id: 'input', label: 'Input' },
        { id: 'media', label: 'Media' },
        { id: 'audio', label: 'Audio' },
        { id: 'machines', label: 'Machines' },
    ];

    // ---- Display state ----
    let currentZoom = $state(1);
    let overlayMode = $state('normal');
    let invertDisplay = $state(localStorage.getItem('zxm8_invert') === 'true');
    let lateTimings = $state(localStorage.getItem('zxm8_lateTiming') === 'true');
    let palettes: Palette[] = $state([]);
    let selectedPalette = $state('default');
    let paletteColors = $derived(PaletteManager.getPalette(selectedPalette)?.colors ?? []);

    // ---- ULA+ state ----
    let ulaPlusEnabled = $state(localStorage.getItem('zxm8_ulaplus') === 'true');
    let ulaPlusStatus = $state('');
    let ulaPlusShowPreview = $state(false);
    let ulaplusPaletteGrid = $state<HTMLDivElement | null>(null);

    // ---- Input state ----
    let kempstonEnabled = $state(false);
    let kempstonExtended = $state(false);
    let gamepadEnabled = $state(false);
    let kempstonMouse = $state(false);
    let mouseWheel = $state(false);
    let betaDisk = $state(localStorage.getItem('zx-beta-disk') === 'true');

    // ---- Media state ----
    let flashLoad = $state(true);
    let tapeAudio = $state(true);

    // ---- Audio state ----
    let soundEnabled = $state(localStorage.getItem('zx-sound-enabled') !== 'false');
    let ay48k = $state(localStorage.getItem('zx-ay-48k') === 'true');
    let volume = $state(parseInt(localStorage.getItem('zx-volume') || '50'));
    let stereoMode = $state(localStorage.getItem('zx-stereo-mode') || 'abc');

    // ---- Machines state ----
    let visibleMachines = $state(getVisibleMachines());

    function getVisibleMachines(): string[] {
        try {
            const stored = localStorage.getItem('zx-visible-machines');
            if (stored) {
                const arr = JSON.parse(stored);
                if (!arr.includes('48k')) arr.unshift('48k');
                return arr;
            }
        } catch {}
        return DEFAULT_VISIBLE_MACHINES.slice();
    }

    function setVisibleMachines(arr: string[]) {
        visibleMachines = arr;
        localStorage.setItem('zx-visible-machines', JSON.stringify(arr));
    }

    // Group machines by group for the checkboxes
    function getMachineGroups(): Record<string, { id: string; name: string }[]> {
        const groups: Record<string, { id: string; name: string }[]> = {};
        for (const [id, p] of Object.entries(MACHINE_PROFILES)) {
            (groups[p.group] ||= []).push({ id, name: p.name });
        }
        return groups;
    }

    const machineGroups = getMachineGroups();

    // ---- Display handlers ----

    function updateCanvasSize() {
        if (document.fullscreenElement) return;
        const s = emulator.spectrum;
        const dims = s.ula.getDimensions();
        const canvas = document.getElementById('screen') as HTMLCanvasElement;
        const overlay = document.getElementById('overlayCanvas') as HTMLCanvasElement;
        if (!canvas || !overlay) return;

        canvas.width = dims.width;
        canvas.height = dims.height;
        canvas.style.width = (dims.width * currentZoom) + 'px';
        canvas.style.height = (dims.height * currentZoom) + 'px';
        overlay.width = dims.width * currentZoom;
        overlay.height = dims.height * currentZoom;
        overlay.style.width = (dims.width * currentZoom) + 'px';
        overlay.style.height = (dims.height * currentZoom) + 'px';
        emulator.setZoom(currentZoom);
    }

    function changeBorder(e: Event) {
        const value = (e.target as HTMLSelectElement).value;
        const s = emulator.spectrum;
        if (s.ula.setBorderPreset(value)) {
            s.updateDisplayDimensions();
            updateCanvasSize();
            emulator.redraw();
        }
    }

    function changeOverlay(e: Event) {
        overlayMode = (e.target as HTMLSelectElement).value;
        emulator.setOverlayMode(overlayMode);
        emulator.redraw();
    }

    function setZoom(level: number) {
        currentZoom = level;
        updateCanvasSize();
        emulator.renderToScreen();
    }

    function toggleInvert() {
        invertDisplay = !invertDisplay;
        const canvas = document.getElementById('screen') as HTMLCanvasElement;
        const overlay = document.getElementById('overlayCanvas') as HTMLCanvasElement;
        const filter = invertDisplay ? 'invert(1)' : '';
        if (canvas) canvas.style.filter = filter;
        if (overlay) overlay.style.filter = filter;
        localStorage.setItem('zxm8_invert', String(invertDisplay));
    }

    function toggleLateTimings() {
        lateTimings = !lateTimings;
        emulator.setLateTimings(lateTimings);
        localStorage.setItem('zxm8_lateTiming', String(lateTimings));
    }

    // ---- Input handlers ----

    function toggleKempston() {
        kempstonEnabled = !kempstonEnabled;
        emulator.kempstonEnabled = kempstonEnabled;
    }

    function toggleKempstonExtended() {
        kempstonExtended = !kempstonExtended;
        emulator.kempstonExtendedEnabled = kempstonExtended;
    }

    function toggleGamepad() {
        gamepadEnabled = !gamepadEnabled;
        emulator.gamepadEnabled = gamepadEnabled;
        if (gamepadEnabled) {
            kempstonEnabled = true;
            emulator.kempstonEnabled = true;
        }
    }

    function toggleKempstonMouse() {
        kempstonMouse = !kempstonMouse;
        emulator.kempstonMouseEnabled = kempstonMouse;
        if (!kempstonMouse && document.pointerLockElement) {
            document.exitPointerLock();
        }
    }

    function toggleMouseWheel() {
        mouseWheel = !mouseWheel;
        // Mouse wheel is handled by the mouse event forwarding
    }

    function toggleBetaDisk() {
        betaDisk = !betaDisk;
        const s = emulator.spectrum;
        s.betaDiskEnabled = betaDisk;
        localStorage.setItem('zx-beta-disk', String(betaDisk));
        if (betaDisk && !s.memory.hasTrdosRom?.()) {
            // TR-DOS ROM loading handled by rom-loader during boot
        }
        s.updateBetaDiskPagingFlag();
    }

    // ---- Media handlers ----

    function toggleFlashLoad() {
        flashLoad = !flashLoad;
        emulator.setTapeFlashLoad(flashLoad);
        if (flashLoad) emulator.stopTape();
    }

    function toggleTapeAudio() {
        tapeAudio = !tapeAudio;
        emulator.spectrum.tapeAudioEnabled = tapeAudio;
    }

    function tapePlay() {
        if (emulator.getTapeFlashLoad()) return;
        emulator.playTape();
    }

    function tapeStop() {
        emulator.stopTape();
    }

    function tapeRewind() {
        emulator.rewindTape();
    }

    // ---- Audio handlers ----

    async function toggleSoundEnabled() {
        soundEnabled = !soundEnabled;
        if (soundEnabled) {
            const audio = emulator.initAudio();
            await audio.start();
            audio.setMuted(false);
        } else {
            const audio = emulator.getAudio();
            if (audio) audio.setMuted(true);
        }
        localStorage.setItem('zx-sound-enabled', String(soundEnabled));
    }

    function toggleAY48k() {
        ay48k = !ay48k;
        emulator.spectrum.ay48kEnabled = ay48k;
        localStorage.setItem('zx-ay-48k', String(ay48k));
    }

    function changeVolume(e: Event) {
        volume = parseInt((e.target as HTMLInputElement).value);
        const audio = emulator.getAudio();
        if (audio) audio.setVolume(volume / 100);
        localStorage.setItem('zx-volume', String(volume));
    }

    function changeStereo(e: Event) {
        stereoMode = (e.target as HTMLSelectElement).value;
        const s = emulator.spectrum;
        s.ay.stereoMode = stereoMode;
        s.ay.updateStereoPanning();
        localStorage.setItem('zx-stereo-mode', stereoMode);
    }

    // ---- Machine visibility handlers ----

    function toggleMachineVisibility(id: string, checked: boolean) {
        const current = getVisibleMachines();
        if (checked) {
            if (!current.includes(id)) {
                const allIds = getMachineTypes();
                const idx = allIds.indexOf(id);
                let insertAt = current.length;
                for (let i = 0; i < current.length; i++) {
                    if (allIds.indexOf(current[i]) > idx) {
                        insertAt = i;
                        break;
                    }
                }
                current.splice(insertAt, 0, id);
            }
        } else {
            const idx = current.indexOf(id);
            if (idx > -1) current.splice(idx, 1);
        }
        setVisibleMachines(current);
    }

    function changePalette(e: Event) {
        const id = (e.target as HTMLSelectElement).value;
        PaletteManager.apply(id, emulator.spectrum.ula);
        PaletteManager.save(id);
        selectedPalette = id;
    }

    // ---- Fullscreen handler ----

    function changeFullscreenMode(e: Event) {
        const value = (e.target as HTMLSelectElement).value;
        localStorage.setItem('zx-fullscreen-mode', value);
    }

    // ---- ULA+ handlers ----

    function updateULAplusStatus() {
        const ula = emulator.spectrum.ula;
        if (!ula.ulaplus.enabled) {
            ulaPlusStatus = '';
            ulaPlusShowPreview = false;
        } else if (ula.ulaplus.paletteEnabled) {
            ulaPlusStatus = '(palette active)';
            ulaPlusShowPreview = true;
            updateULAplusPalettePreview();
        } else {
            ulaPlusStatus = '(hardware present)';
            ulaPlusShowPreview = false;
        }
    }

    function updateULAplusPalettePreview() {
        if (!ulaplusPaletteGrid) return;
        const palette = emulator.spectrum.ula.ulaplus.palette;
        const cells = ulaplusPaletteGrid.children;
        for (let i = 0; i < 64; i++) {
            const grb = palette[i];
            const g3 = (grb >> 5) & 0x07;
            const r3 = (grb >> 2) & 0x07;
            const b2 = grb & 0x03;
            const r = (r3 << 5) | (r3 << 2) | (r3 >> 1);
            const g = (g3 << 5) | (g3 << 2) | (g3 >> 1);
            const b = (b2 << 6) | (b2 << 4) | (b2 << 2) | b2;
            (cells[i] as HTMLElement).style.backgroundColor = `rgb(${r},${g},${b})`;
        }
    }

    function toggleULAplus() {
        ulaPlusEnabled = !ulaPlusEnabled;
        emulator.spectrum.ula.ulaplus.enabled = ulaPlusEnabled;
        localStorage.setItem('zxm8_ulaplus', String(ulaPlusEnabled));
        updateULAplusStatus();
        emulator.redraw();
        showMessage(ulaPlusEnabled ? 'ULA+ enabled' : 'ULA+ disabled');
    }

    function resetULAplus() {
        emulator.spectrum.ula.resetULAplus();
        updateULAplusStatus();
        emulator.redraw();
        showMessage('ULAplus palette reset');
    }

    onMount(() => {
        palettes = PaletteManager.getPalettes();
        selectedPalette = PaletteManager.getCurrent();

        // Initialize ULAplus palette grid (4 rows x 16 colors)
        if (ulaplusPaletteGrid) {
            for (let i = 0; i < 64; i++) {
                const cell = document.createElement('div');
                cell.className = 'ulaplus-palette-cell';
                cell.dataset.index = String(i);
                ulaplusPaletteGrid.appendChild(cell);
            }
        }

        // Apply saved ULA+ state
        emulator.spectrum.ula.ulaplus.enabled = ulaPlusEnabled;
        updateULAplusStatus();

        // Periodically update palette preview when active
        const interval = setInterval(() => {
            if (emulator.spectrum.ula.ulaplus.enabled && emulator.spectrum.ula.ulaplus.paletteEnabled) {
                updateULAplusStatus();
            }
        }, 500);

        return () => clearInterval(interval);
    });
</script>

<div class="tab-content" id="tab-settings">
    <div class="settings-subtab-bar">
        {#each subtabs as subtab}
            <button
                class="settings-subtab-btn"
                class:active={activeSubtab === subtab.id}
                onclick={() => activeSubtab = subtab.id}
            >
                {subtab.label}
            </button>
        {/each}
    </div>

    <!-- Display Sub-tab -->
    <div class="settings-subtab-content" class:active={activeSubtab === 'display'}>
    <div class="settings-tab-content">
        <div class="settings-section">
            <div class="settings-row">
                <select title="Border size preset" onchange={changeBorder}>
                    <option value="full" selected>Full border (352x312)</option>
                    <option value="normal">Normal (320x240)</option>
                    <option value="thick">Thick (352x288)</option>
                    <option value="medium">Medium (320x256)</option>
                    <option value="small">Small (288x224)</option>
                    <option value="none">None (256x192)</option>
                </select>
                <label class="checkbox-label" title="Invert screen colors" style="margin-left: 15px;">
                    <input type="checkbox" checked={invertDisplay} onchange={toggleInvert}> Invert
                </label>
                <select style="margin-left: 15px;" title="Overlay display mode" onchange={changeOverlay}>
                    <option value="normal" selected>Normal</option>
                    <option value="grid">Grid</option>
                    <option value="box">Box</option>
                    <option value="screen">Screen</option>
                    <option value="reveal">Reveal</option>
                    <option value="beam">Beam</option>
                    <option value="beamscreen">BeamScreen</option>
                    <option value="noattr">No Attr</option>
                    <option value="nobitmap">No Bitmap</option>
                </select>
                <span class="zoom-group" style="margin-left: 15px;">
                    Zoom:
                    <button class="zoom-btn" class:active={currentZoom === 1} title="Zoom 1x" onclick={() => setZoom(1)}>x1</button>
                    <button class="zoom-btn" class:active={currentZoom === 2} title="Zoom 2x" onclick={() => setZoom(2)}>x2</button>
                    <button class="zoom-btn" class:active={currentZoom === 3} title="Zoom 3x" onclick={() => setZoom(3)}>x3</button>
                </span>
                <label class="checkbox-label" title="Late ULA timing (warm ULA behavior, +1 T-state shift)" style="margin-left: 5px; white-space: nowrap;">
                    <input type="checkbox" checked={lateTimings} onchange={toggleLateTimings}> Late Timings
                </label>
            </div>
            <div class="settings-row">
                <label for="settings-fullscreen">Fullscreen:</label>
                <select id="settings-fullscreen" title="Fullscreen aspect ratio mode" onchange={changeFullscreenMode}>
                    <option value="crisp" selected>Crisp (integer scale)</option>
                    <option value="fit">Fit (keep aspect ratio)</option>
                    <option value="stretch">Stretch (fill screen)</option>
                </select>
            </div>
            <div class="settings-row">
                <label for="settings-palette">Color Palette:</label>
                <select id="settings-palette" value={selectedPalette} onchange={changePalette} title="Select color palette">
                    {#each palettes as palette (palette.id)}
                        <option value={palette.id}>{palette.name}</option>
                    {/each}
                </select>
            </div>
            {#if paletteColors.length >= 16}
            <div class="palette-preview" id="palettePreview">
                <div class="palette-row">
                    <span class="palette-row-label">Normal</span>
                    {#each [0,1,2,3,4,5,6,7] as i}
                        <span class="palette-color" data-index={i} title="{i}: {paletteColors[i]}" style="background-color: {paletteColors[i]};"></span>
                    {/each}
                </div>
                <div class="palette-row">
                    <span class="palette-row-label">Bright</span>
                    {#each [0,1,2,3,4,5,6,7] as i}
                        <span class="palette-color" data-index={i} data-bright="true" title="{i}: {paletteColors[i+8]}" style="background-color: {paletteColors[i+8]};"></span>
                    {/each}
                </div>
            </div>
            {/if}
            <div class="settings-row" style="margin-top: 10px;">
                <label class="checkbox-label" title="Enable ULAplus extended palette support (64 colors)">
                    <input type="checkbox" checked={ulaPlusEnabled} onchange={toggleULAplus}> ULA+
                </label>
                <button style="margin-left: 10px; padding: 2px 8px; font-size: 11px;" title="Reset ULAplus palette to defaults" onclick={resetULAplus}>Reset</button>
                <span style="margin-left: 10px; color: var(--text-dim); font-size: 11px;">{ulaPlusStatus}</span>
            </div>
            <div class="ulaplus-palette-preview" class:hidden={!ulaPlusShowPreview}>
                <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 4px;">ULA+ Palette (4 CLUTs × 16 colors)</div>
                <div class="ulaplus-palette-grid" bind:this={ulaplusPaletteGrid}></div>
            </div>
        </div>
    </div>
    </div>

    <!-- Input Sub-tab -->
    <div class="settings-subtab-content" class:active={activeSubtab === 'input'}>
    <div class="settings-tab-content">
        <div class="settings-section">
            <div class="settings-row">
                <label class="checkbox-label">
                    <input type="checkbox" checked={kempstonEnabled} onchange={toggleKempston}> Kempston Joystick (Numpad)
                </label>
                <label class="checkbox-label" title="Extended buttons: [ = C, ] = A, \ = Start" style="margin-left: 15px;">
                    <input type="checkbox" checked={kempstonExtended} onchange={toggleKempstonExtended}> Extended
                </label>
                <label class="checkbox-label" title="Use USB/Bluetooth gamepad for Kempston joystick" style="margin-left: 15px;">
                    <input type="checkbox" checked={gamepadEnabled} onchange={toggleGamepad}> Gamepad
                </label>
            </div>
            <div class="settings-row">
                <label class="checkbox-label" title="Click screen to capture mouse, Escape to release">
                    <input type="checkbox" checked={kempstonMouse} onchange={toggleKempstonMouse}> Kempston Mouse
                </label>
                <label class="checkbox-label" title="Mouse wheel on bits 7:4 of button port" style="margin-left: 15px;">
                    <input type="checkbox" checked={mouseWheel} onchange={toggleMouseWheel}> Wheel
                </label>
            </div>
            <div class="settings-row">
                <label class="checkbox-label" title="Enable Beta Disk interface for TR-DOS (requires trdos.rom)">
                    <input type="checkbox" checked={betaDisk} onchange={toggleBetaDisk}> Beta Disk (TR-DOS)
                </label>
            </div>
        </div>
    </div>
    </div>

    <!-- Media Sub-tab -->
    <div class="settings-subtab-content" class:active={activeSubtab === 'media'}>
    <div class="settings-tab-content">
        <div class="settings-section">
            <div class="settings-row">
                <label class="checkbox-label" title="Flash load = instant (trap), unchecked = real-time with border stripes">
                    <input type="checkbox" checked={flashLoad} onchange={toggleFlashLoad}> Flash Load
                </label>
                <span style="margin-left: 10px; color: var(--text-dim); font-size: 11px;">{flashLoad ? '(instant)' : '(real-time)'}</span>
                <label class="checkbox-label" title="Enable tape loading sounds (real-time mode)" style="margin-left: 15px;">
                    <input type="checkbox" checked={tapeAudio} onchange={toggleTapeAudio}> Tape Sound
                </label>
            </div>
            <div class="settings-row">
                <button class="control-btn" title="Play tape (real-time mode)" onclick={tapePlay}>&#9654; Play</button>
                <button class="control-btn" title="Stop tape playback" style="margin-left: 5px;" onclick={tapeStop}>&#9209; Stop</button>
                <button class="control-btn" title="Rewind tape to beginning" style="margin-left: 5px;" onclick={tapeRewind}>&#9194; Rewind</button>
            </div>
        </div>
    </div>
    </div>

    <!-- Audio Sub-tab -->
    <div class="settings-subtab-content" class:active={activeSubtab === 'audio'}>
    <div class="settings-tab-content">
        <div class="settings-section">
            <div class="settings-row">
                <label class="checkbox-label" title="Enable sound output">
                    <input type="checkbox" checked={soundEnabled} onchange={toggleSoundEnabled}> Sound
                </label>
                <label class="checkbox-label" title="Enable AY chip in 48K mode (like Melodik interface)" style="margin-left: 15px;">
                    <input type="checkbox" checked={ay48k} onchange={toggleAY48k}> AY in 48K
                </label>
            </div>
            <div class="settings-row">
                <label for="settings-volume" style="min-width: 60px;">Volume:</label>
                <input id="settings-volume" type="range" min="0" max="100" value={volume} oninput={changeVolume} style="width: 120px;">
                <span style="min-width: 35px; text-align: right;">{volume}%</span>
            </div>
            <div class="settings-row">
                <label for="settings-stereo">Stereo:</label>
                <select id="settings-stereo" title="Stereo panning mode" value={stereoMode} onchange={changeStereo}>
                    <option value="mono">Mono</option>
                    <option value="abc">ABC (A-left, B-center, C-right)</option>
                    <option value="acb">ACB (A-left, C-center, B-right)</option>
                </select>
            </div>
        </div>
    </div>
    </div>

    <!-- Machines Sub-tab -->
    <div class="settings-subtab-content" class:active={activeSubtab === 'machines'}>
    <div class="settings-tab-content">
        <div class="settings-section">
            <div style="margin-bottom: 8px; color: var(--text-secondary); font-size: 11px;">Choose which machines appear in the toolbar dropdown:</div>
            {#each Object.entries(machineGroups) as [group, machines]}
                <div style="margin-bottom: 8px;">
                    <div style="color: var(--text-secondary); font-size: 11px; margin-bottom: 4px; font-weight: bold;">{group}</div>
                    {#each machines as machine}
                        <label class="checkbox-label" style="display: block; margin-left: 8px; margin-bottom: 2px;">
                            <input
                                type="checkbox"
                                checked={visibleMachines.includes(machine.id)}
                                disabled={machine.id === '48k'}
                                onchange={(e: Event) => toggleMachineVisibility(machine.id, (e.target as HTMLInputElement).checked)}
                            > {machine.name}
                        </label>
                    {/each}
                </div>
            {/each}
        </div>
    </div>
    </div>

</div>

<style>
    #tab-settings {
        overflow-y: auto;
        max-height: calc(100vh - 120px);
        padding-top: 0;
    }
    .settings-subtab-bar {
        display: flex;
        gap: 2px;
        border-bottom: 1px solid var(--bg-button);
        margin-bottom: 10px;
        padding: 0 10px;
        position: sticky;
        top: 0;
        background: var(--bg-secondary);
        z-index: 10;
    }
    .settings-subtab-btn {
        padding: 6px 16px;
        background: var(--bg-tertiary);
        border: 1px solid var(--bg-button);
        border-bottom: none;
        border-radius: 4px 4px 0 0;
        color: var(--text-secondary);
        font-size: 12px;
        cursor: pointer;
        margin-bottom: -1px;
    }
    .settings-subtab-btn:hover {
        background: var(--bg-button);
        color: var(--text-primary);
    }
    .settings-subtab-btn.active {
        background: var(--bg-secondary);
        color: var(--cyan);
        border-bottom: 1px solid var(--bg-secondary);
    }
    .settings-subtab-content {
        display: none;
    }
    .settings-subtab-content.active {
        display: block;
    }
    .settings-tab-content {
        padding: 15px;
        max-width: 720px;
    }
    .settings-section {
        margin-bottom: 15px;
        padding: 12px;
        background: var(--bg-secondary);
        border: 1px solid var(--bg-button);
        border-radius: 4px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    }
    .settings-row {
        margin-bottom: 8px;
        display: flex;
        align-items: center;
        gap: 10px;
    }
    .settings-row label:not(.checkbox-label) {
        min-width: 100px;
        color: var(--text-secondary);
        font-size: 12px;
    }
    .settings-row select {
        flex: 1;
        max-width: 200px;
        padding: 5px 10px;
        font-size: 12px;
    }
    .settings-section select {
        padding: 5px 10px;
        font-size: 12px;
    }
    .zoom-btn {
        padding: 2px 8px;
        font-size: 11px;
        background: var(--bg-button);
        border: 1px solid var(--border);
        color: var(--text-secondary);
        cursor: pointer;
        border-radius: 3px;
    }
    .zoom-btn.active {
        background: var(--accent);
        color: var(--bg-primary);
    }
    .zoom-btn:hover {
        background: var(--bg-button-hover);
    }
    .control-btn {
        padding: 3px 10px;
        font-size: 11px;
        background: var(--bg-button);
        border: 1px solid var(--border);
        color: var(--text-primary);
        cursor: pointer;
        border-radius: 3px;
    }
    .control-btn:hover {
        background: var(--bg-button-hover);
    }
    .palette-preview {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin-top: 8px;
    }
    .palette-row {
        display: flex;
        gap: 4px;
        align-items: center;
    }
    .palette-row-label {
        font-size: 10px;
        color: var(--text-secondary);
        width: 42px;
        text-align: right;
        margin-right: 4px;
    }
    .palette-color {
        width: 28px;
        height: 28px;
        border: 1px solid var(--border-secondary);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 9px;
        font-weight: bold;
        color: #000;
        text-shadow: -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff;
    }
    .palette-color::after {
        content: attr(data-index);
        border-radius: 2px;
    }
    .ulaplus-palette-preview {
        margin-top: 8px;
    }
    .ulaplus-palette-preview.hidden {
        display: none;
    }
    .ulaplus-palette-grid {
        display: grid;
        grid-template-columns: repeat(16, 14px);
        grid-template-rows: repeat(4, 14px);
        gap: 1px;
    }
    :global(.ulaplus-palette-cell) {
        width: 14px;
        height: 14px;
        border: 1px solid var(--border-secondary);
    }
</style>

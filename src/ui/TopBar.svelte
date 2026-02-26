<script lang="ts">
    import type { EmulatorController } from '../core/emulator-controller';
    import { MACHINE_PROFILES, DEFAULT_VISIBLE_MACHINES } from '../machines/profiles';
    import { fetchRoms, applyRoms } from '../core/rom-loader';

    let { emulator, onHelpClick, onGameBrowserClick, onMemoryMapClick }: {
        emulator: EmulatorController;
        onHelpClick?: () => void;
        onGameBrowserClick?: () => void;
        onMemoryMapClick?: () => void;
    } = $props();

    // Machine selector state
    let visibleMachines = $state(getVisibleMachines());
    let currentMachine = $state(localStorage.getItem('zx-machine-type') || '48k');

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

    function getMachineName(id: string): string {
        return MACHINE_PROFILES[id]?.name || id;
    }

    async function changeMachine(e: Event) {
        const type = (e.target as HTMLSelectElement).value;
        const profile = MACHINE_PROFILES[type];

        if (!profile) return;

        const wasRunning = emulator.isRunning();
        if (wasRunning) emulator.stop();

        emulator.setMachineType(type);
        localStorage.setItem('zx-machine-type', type);

        // Re-apply ROMs for the new machine type
        const romData = await fetchRoms();
        if (!applyRoms(emulator.spectrum, romData)) {
            console.error(`ROM for ${type} not found`);
            // Fallback to 48k
            emulator.setMachineType('48k');
            applyRoms(emulator.spectrum, romData);
            currentMachine = '48k';
        }

        emulator.reset();
        currentMachine = emulator.getMachineType();

        if (wasRunning) {
            emulator.start();
        }
    }

    // File loading
    let fileInput: HTMLInputElement;

    function handleLoadAction(e: Event) {
        const select = e.target as HTMLSelectElement;
        const action = select.value;
        select.selectedIndex = 0; // reset to "Load" label

        if (action === 'file') {
            fileInput.click();
        } else if (action === 'browse') {
            onGameBrowserClick?.();
        }
        // TODO: 'project', 'quick' — future steps
    }

    async function handleFileSelected(e: Event) {
        const input = e.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file || !emulator.romLoaded) return;

        try {
            await emulator.loadFile(file);
        } catch (err: any) {
            console.error('Failed to load:', err.message);
        }
        input.value = ''; // reset so same file can be re-loaded
    }

    // Save
    function handleSaveAction(e: Event) {
        const select = e.target as HTMLSelectElement;
        const action = select.value;
        select.selectedIndex = 0; // reset to "Save" label
        if (!action) return;

        if (action === 'sna' || action === 'z80' || action === 'szx') {
            try {
                const data = emulator.saveSnapshot(action);
                const blob = new Blob([data], { type: 'application/octet-stream' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `snapshot_${emulator.getMachineType()}.${action}`;
                a.click();
                URL.revokeObjectURL(url);
            } catch (err: any) {
                console.error('Failed to save:', err.message);
            }
        }
        // TODO: 'project', 'quick' — future steps
    }

    function toggleTheme() {
        document.body.classList.toggle('light-theme');
    }
</script>

<div class="top-bar">
    <select class="toolbar-select" title="Select machine type" bind:value={currentMachine} onchange={changeMachine}>
        {#each visibleMachines.toSorted((a, b) => getMachineName(a).localeCompare(getMachineName(b))) as id}
            <option value={id}>{getMachineName(id)}</option>
        {/each}
    </select>
    <select class="toolbar-select load-select" title="Load file" onchange={handleLoadAction}>
        <option value="" disabled selected hidden>Load</option>
        <option value="file">File</option>
        <option value="browse">Web</option>
        <option value="project">Project</option>
        <option value="quick">Quick (F5)</option>
    </select>
    <select class="toolbar-select save-select" title="Save" onchange={handleSaveAction}>
        <option value="" disabled selected hidden>Save</option>
        <option value="sna">SNA</option>
        <option value="z80">Z80</option>
        <option value="szx">SZX</option>
        <option value="project">Project</option>
        <option value="quick">Quick (F2)</option>
    </select>
    <button class="test-link" title="ZX-M8XXX — Help" onclick={() => onHelpClick?.()}>Help</button>
    <button class="theme-btn" title="Toggle light/dark theme" onclick={toggleTheme}>☀️</button>
    <input type="file" class="file-input" accept=".sna,.tap,.tzx,.z80,.szx,.zip,.rzx,.trd,.scl,.dsk" bind:this={fileInput} onchange={handleFileSelected}>
</div>

<style>
    .top-bar {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 6px;
        flex-wrap: wrap;
    }
    .toolbar-select {
        padding: 6px 10px;
        font-size: 12px;
    }
    .load-select, .save-select {
        width: auto;
        padding: 4px 6px;
    }
    .test-link {
        color: var(--text-secondary);
        font-size: 12px;
        text-decoration: none;
        padding: 4px 8px;
        background: var(--bg-button);
        border-radius: 3px;
    }
    .test-link:hover {
        background: var(--bg-button-hover);
        color: var(--text-primary);
    }
    .theme-btn {
        background: var(--bg-secondary);
        border: none;
        font-size: 16px;
        cursor: pointer;
        padding: 5px 10px;
        border-radius: 4px;
        color: inherit;
        outline: none;
        box-shadow: none;
        transition: none;
    }
    .theme-btn:hover {
        background: var(--bg-button-hover);
    }
    .file-input {
        display: none;
    }
</style>

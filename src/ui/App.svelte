<script lang="ts">
    import { onMount } from 'svelte';
    import TopBar from './TopBar.svelte';
    import ScreenDisplay from './ScreenDisplay.svelte';
    import StatusBar from './StatusBar.svelte';
    import ControlPanel from './ControlPanel.svelte';
    import TabBar from './TabBar.svelte';
    import HelpDialog from './modals/HelpDialog.svelte';
    import RomSelectorModal from './modals/RomSelectorModal.svelte';
    import GameBrowserModal from './modals/GameBrowserModal.svelte';
    import ZipSelectorModal from './modals/ZipSelectorModal.svelte';
    import MemoryMapDialog from './modals/MemoryMapDialog.svelte';
    import { PaletteManager } from '../core/palette-manager';
    import './debugger-global.css';

    import type { EmulatorController } from '../core/emulator-controller';
    let { emulator }: { emulator: EmulatorController } = $props();

    // Modal refs
    let helpDialog: HelpDialog;
    let romSelectorModal: RomSelectorModal;
    let gameBrowserModal: GameBrowserModal;
    let zipSelectorModal: ZipSelectorModal;
    let memoryMapDialog: MemoryMapDialog;

    onMount(() => {
        // Load and apply saved palette on app startup
        PaletteManager.loadSaved(emulator.spectrum.ula);
        // ROM loading is handled by main.ts boot() — showRomSelector() called there if needed
    });

    // Export modal show functions for use by components
    export function showHelpDialog() {
        helpDialog?.show();
    }

    export function showGameBrowser() {
        gameBrowserModal?.show();
    }

    export function showMemoryMap() {
        memoryMapDialog?.show();
    }

    export function showZipSelector(files: string[]) {
        zipSelectorModal?.show(files);
    }

    export function showRomSelector() {
        romSelectorModal?.show();
    }
</script>

<div class="container">
    <TopBar {emulator} onHelpClick={() => helpDialog?.show()} onGameBrowserClick={() => gameBrowserModal?.show()} onMemoryMapClick={() => memoryMapDialog?.show()} />

    <div class="main-layout">
        <div class="emulator-section">
            <ScreenDisplay {emulator} />
            <StatusBar {emulator} />
            <ControlPanel {emulator} />
        </div>

        <TabBar {emulator} onMemoryMapClick={() => memoryMapDialog?.show()} />
    </div>
</div>

<!-- Modals -->
<HelpDialog bind:this={helpDialog} />
<RomSelectorModal bind:this={romSelectorModal} {emulator} />
<GameBrowserModal bind:this={gameBrowserModal} {emulator} />
<ZipSelectorModal bind:this={zipSelectorModal} {emulator} />
<MemoryMapDialog bind:this={memoryMapDialog} {emulator} />

<script lang="ts">
    import type { EmulatorController } from '../../core/emulator-controller';
    import { fetchRoms, applyRoms } from '../../core/rom-loader';

    let { emulator }: { emulator: EmulatorController } = $props();

    let visible = $state(false);
    let romStatus = $state<{ [key: string]: boolean }>({});
    let selectedRom = $state('');
    let loading = $state(false);

    const roms = ['48.rom', '128.rom', 'plus2.rom', 'plus2a.rom', 'plus3.rom', 'pentagon.rom'];

    export async function show() {
        visible = true;
        loading = true;
        try {
            const romData = await fetchRoms();
            const newRomStatus: { [key: string]: boolean } = {};
            for (const rom of roms) {
                newRomStatus[rom] = romData.has(rom);
            }
            romStatus = newRomStatus;

            // Auto-select first available ROM
            if (!selectedRom) {
                for (const rom of roms) {
                    if (newRomStatus[rom]) {
                        selectedRom = rom;
                        break;
                    }
                }
            }
        } catch (e) {
            console.error('Failed to check ROM status:', e);
        } finally {
            loading = false;
        }
    }

    function close() {
        visible = false;
    }

    function selectRom(rom: string) {
        selectedRom = rom;
    }

    async function loadRom() {
        if (!selectedRom) {
            console.warn('No ROM selected');
            return;
        }
        loading = true;
        try {
            const romData = await fetchRoms();
            const success = applyRoms(emulator.spectrum, romData);
            if (success) {
                emulator.reset();
                emulator.start();
                close();
            } else {
                console.error('Failed to apply ROMs to emulator');
                alert('Failed to apply ROMs. Please ensure ROM files are valid.');
            }
        } catch (e) {
            console.error('Failed to load ROM:', e);
            alert(`Error loading ROM: ${e instanceof Error ? e.message : 'Unknown error'}`);
        } finally {
            loading = false;
        }
    }
</script>

{#if visible}
    <div class="modal-overlay">
        <div class="modal">
            <h2>Select ROM</h2>
            <p>Choose a ROM file to load:</p>

            {#if loading}
                <p style="text-align: center; color: var(--text-secondary);">Loading ROM status...</p>
            {:else}
                <div class="rom-grid">
                    {#each roms as rom}
                        <button onclick={() => selectRom(rom)} class:selected={selectedRom === rom} disabled={!romStatus[rom]}>
                            {rom}
                        </button>
                        <span class="rom-status" class:loaded={romStatus[rom]}>
                            {romStatus[rom] ? '✓ Available' : '○ Not found'}
                        </span>
                    {/each}
                </div>

                <div class="modal-hint">
                    Select a ROM and click Load to begin emulation.
                </div>

                <div class="modal-actions">
                    <button onclick={loadRom} disabled={!selectedRom || loading}>Load</button>
                    <button onclick={close} disabled={loading}>Cancel</button>
                </div>
            {/if}
        </div>
    </div>
{/if}

<style>
    .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.85);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 200;
    }

    .modal {
        background: var(--bg-secondary);
        padding: 30px;
        border-radius: 12px;
        max-width: 500px;
        width: 90%;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
    }

    .modal h2 {
        margin-top: 0;
        color: var(--accent);
        text-align: center;
    }

    .modal p {
        color: var(--text-primary);
        line-height: 1.6;
    }

    .rom-grid {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 6px 12px;
        align-items: center;
        margin: 12px 0;
        padding: 12px;
        background: var(--bg-primary);
        border-radius: 8px;
    }

    .rom-grid button {
        width: 100%;
        white-space: nowrap;
        text-align: left;
    }

    .rom-grid button.selected {
        background: var(--accent);
        color: white;
    }

    .rom-status {
        font-size: 0.85em;
        color: var(--text-secondary);
    }

    .rom-status.loaded {
        color: #2ecc71;
    }

    .modal-actions {
        display: flex;
        gap: 10px;
        margin-top: 20px;
    }

    .modal-actions button {
        flex: 1;
        padding: 12px;
    }

    .modal-actions button:disabled {
        opacity: 0.5;
    }

    .modal-hint {
        font-size: 0.85em;
        color: var(--text-secondary);
        margin-top: 15px;
        text-align: center;
    }
</style>

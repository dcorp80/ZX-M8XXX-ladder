<script lang="ts">
    import type { EmulatorController } from '../../core/emulator-controller';

    let { emulator }: { emulator: EmulatorController } = $props();

    let visible = $state(false);
    let files = $state<string[]>([]);
    let selectedFile = $state('');
    let bootTodos = $state(false);
    let loading = $state(false);

    export function show(zipFiles: string[] = []) {
        files = zipFiles;
        selectedFile = files[0] || '';
        visible = true;
    }

    function close() {
        visible = false;
    }

    async function extract() {
        if (!selectedFile) return;
        loading = true;
        try {
            // TODO: Integrate with loaders.ts for ZIP extraction
            console.log('Extracting from ZIP:', selectedFile, { bootTodos });
            // const extracted = await extractZipFile(zipData, selectedFile);
            // await emulator.loadFile(extracted, { bootTodos });
            close();
        } catch (e) {
            console.error('Failed to extract:', e);
        } finally {
            loading = false;
        }
    }
</script>

{#if visible}
    <div class="modal-overlay">
        <div class="modal">
            <h2>Select File from ZIP</h2>
            <p>Choose which file to extract:</p>

            {#if loading}
                <p style="text-align: center; color: var(--text-secondary);">Extracting...</p>
            {:else}
                <div class="file-list">
                    {#each files as file}
                        <label class="file-option">
                            <input
                                type="radio"
                                name="zipfile"
                                value={file}
                                bind:group={selectedFile}
                            />
                            <span>{file}</span>
                        </label>
                    {/each}
                </div>

                <label class="checkbox-option">
                    <input type="checkbox" bind:checked={bootTodos} disabled={loading} />
                    Boot TR-DOS (if available)
                </label>

                <div class="modal-actions">
                    <button onclick={extract} disabled={!selectedFile || loading}>Extract</button>
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

    .file-list {
        background: var(--bg-primary);
        border: 1px solid var(--bg-button);
        border-radius: 4px;
        padding: 10px;
        margin: 12px 0;
        max-height: 200px;
        overflow-y: auto;
    }

    .file-option {
        display: flex;
        align-items: center;
        padding: 6px 8px;
        cursor: pointer;
        border-radius: 3px;
        margin-bottom: 4px;
        transition: background 0.2s;
    }

    .file-option:hover {
        background: var(--bg-button);
    }

    .file-option input[type='radio'] {
        margin-right: 8px;
        cursor: pointer;
    }

    .file-option span {
        color: var(--text-primary);
        font-family: monospace;
        font-size: 12px;
    }

    .checkbox-option {
        display: flex;
        align-items: center;
        padding: 8px;
        cursor: pointer;
        margin-bottom: 15px;
    }

    .checkbox-option input[type='checkbox'] {
        margin-right: 8px;
        cursor: pointer;
    }

    .checkbox-option {
        color: var(--text-primary);
    }

    .modal-actions {
        display: flex;
        gap: 10px;
    }

    .modal-actions button {
        flex: 1;
        padding: 12px;
    }

    .modal-actions button:disabled {
        opacity: 0.5;
    }
</style>

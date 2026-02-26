<script lang="ts">
    let visible = $state(false);

    export function show() {
        visible = true;
    }

    function close() {
        visible = false;
    }
</script>

{#if visible}
    <div class="help-modal">
        <div class="help-modal-content">
            <div class="help-modal-header">
                <h3>Keyboard Shortcuts</h3>
                <button class="help-modal-close" onclick={close}>×</button>
            </div>

            <table>
                <tbody>
                    <tr class="help-section-header">
                        <td colspan="2">Emulation Control</td>
                    </tr>
                    <tr>
                        <td>Space</td>
                        <td>Run / Pause emulation</td>
                    </tr>
                    <tr>
                        <td>Ctrl+R</td>
                        <td>Reset emulator</td>
                    </tr>
                    <tr>
                        <td>Ctrl+L</td>
                        <td>Load snapshot</td>
                    </tr>
                    <tr>
                        <td>Ctrl+S</td>
                        <td>Save snapshot</td>
                    </tr>

                    <tr class="help-section-header">
                        <td colspan="2">Debugger</td>
                    </tr>
                    <tr>
                        <td>F7</td>
                        <td>Step into</td>
                    </tr>
                    <tr>
                        <td>F8</td>
                        <td>Step over</td>
                    </tr>
                    <tr>
                        <td>F9</td>
                        <td>Continue to breakpoint</td>
                    </tr>
                    <tr>
                        <td>Ctrl+B</td>
                        <td>Toggle breakpoint</td>
                    </tr>

                    <tr class="help-section-header">
                        <td colspan="2">Display</td>
                    </tr>
                    <tr>
                        <td>F11</td>
                        <td>Fullscreen</td>
                    </tr>
                    <tr>
                        <td>Ctrl+Plus</td>
                        <td>Zoom in</td>
                    </tr>
                    <tr>
                        <td>Ctrl+Minus</td>
                        <td>Zoom out</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
{/if}

<style>
    .help-modal {
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

    .help-modal-content {
        background: var(--bg-secondary);
        padding: 20px 30px;
        border-radius: 8px;
        max-width: 450px;
        width: 90%;
        max-height: 70vh;
        overflow-y: auto;
    }

    .help-modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
    }

    .help-modal-header h3 {
        margin: 0;
        color: var(--cyan);
    }

    .help-modal-close {
        background: transparent;
        border: none;
        color: var(--text-secondary);
        font-size: 24px;
        cursor: pointer;
        padding: 0;
        line-height: 1;
    }

    .help-modal-close:hover {
        color: var(--text-primary);
    }

    table {
        width: 100%;
        border-collapse: collapse;
    }

    td {
        padding: 5px 10px;
        border-bottom: 1px solid var(--bg-button);
    }

    td:first-child {
        color: var(--accent);
        font-family: monospace;
        width: 120px;
    }

    :global(.help-section-header) {
        padding-top: 10px !important;
        color: var(--cyan) !important;
        font-weight: bold;
    }
</style>

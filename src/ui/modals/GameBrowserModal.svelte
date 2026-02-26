<script lang="ts">
    import type { EmulatorController } from '../../core/emulator-controller';

    let { emulator }: { emulator: EmulatorController } = $props();

    let visible = $state(false);
    let games = $state<any[]>([]);
    let loading = $state(false);
    let searchQuery = $state('');

    export function show() {
        visible = true;
        loadGames();
    }

    function close() {
        visible = false;
    }

    async function loadGames() {
        loading = true;
        try {
            // TODO: Implement web API integration (RetroBase, etc.)
            // For now, show placeholder
            games = [
                { name: 'Jet Set Willy', year: 1984 },
                { name: 'Manic Miner', year: 1983 },
                { name: 'Knight Lore', year: 1984 },
                { name: 'The Hobbit', year: 1982 }
            ];
        } catch (e) {
            console.error('Failed to load games:', e);
            games = [];
        } finally {
            loading = false;
        }
    }

    async function selectGame(game: any) {
        if (!emulator.romLoaded) {
            console.error('ROM not loaded');
            return;
        }
        // TODO: Download and load game via emulator.loadFile()
        console.log('Loading game:', game);
        close();
    }

    function filterGames() {
        return games.filter(g =>
            g.name.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }
</script>

{#if visible}
    <div class="modal-overlay">
        <div class="modal modal-large">
            <h2>Game Browser</h2>

            <input
                type="text"
                placeholder="Search games..."
                bind:value={searchQuery}
                class="search-input"
            />

            {#if loading}
                <p class="loading">Loading games...</p>
            {:else if filterGames().length === 0}
                <p class="no-results">No games found</p>
            {:else}
                <div class="game-list">
                    {#each filterGames() as game}
                        <button type="button" class="game-item" onclick={() => selectGame(game)}>
                            <div class="game-name">{game.name}</div>
                            <div class="game-info">{game.year || 'N/A'}</div>
                        </button>
                    {/each}
                </div>
            {/if}

            <div class="modal-actions">
                <button onclick={close}>Close</button>
            </div>
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
        max-height: 70vh;
        display: flex;
        flex-direction: column;
    }

    .modal-large {
        max-width: 700px;
    }

    .modal h2 {
        margin: 0 0 15px 0;
        color: var(--accent);
        text-align: center;
    }

    .search-input {
        width: 100%;
        padding: 8px 12px;
        background: var(--bg-primary);
        border: 1px solid var(--bg-button);
        border-radius: 4px;
        color: var(--text-primary);
        font-size: 14px;
        margin-bottom: 15px;
        box-sizing: border-box;
    }

    .search-input:focus {
        outline: none;
        border-color: var(--cyan);
    }

    .game-list {
        flex: 1;
        overflow-y: auto;
        border: 1px solid var(--bg-button);
        border-radius: 4px;
        margin-bottom: 15px;
    }

    .game-item {
        display: block;
        width: 100%;
        padding: 10px 12px;
        border: none;
        border-bottom: 1px solid var(--bg-button);
        background: transparent;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
        transition: background 0.2s;
    }

    .game-item:hover {
        background: var(--bg-button);
    }

    .game-name {
        color: var(--text-primary);
        font-weight: 500;
    }

    .game-info {
        color: var(--text-secondary);
        font-size: 12px;
        margin-top: 2px;
    }

    .loading,
    .no-results {
        color: var(--text-secondary);
        text-align: center;
        padding: 20px;
    }

    .modal-actions {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
    }

    .modal-actions button {
        padding: 10px 20px;
    }
</style>

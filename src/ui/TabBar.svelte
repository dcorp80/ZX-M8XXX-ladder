<script lang="ts">
    import DebuggerTab from './DebuggerTab.svelte';
    import AssemblerTab from './AssemblerTab.svelte';
    import GraphicsTab from './GraphicsTab.svelte';
    import InfoTab from './InfoTab.svelte';
    import SettingsTab from './SettingsTab.svelte';
    import ToolsTab from './ToolsTab.svelte';

    import type { EmulatorController } from '../core/emulator-controller';
    let { emulator }: { emulator: EmulatorController } = $props();

    let activeTab = $state('debugger');
    let collapsed = $state(false);

    const tabs = [
        { id: 'debugger', label: 'Debug' },
        { id: 'assembler', label: 'ASM' },
        { id: 'graphics', label: 'GFX' },
        { id: 'info', label: 'Info' },
        { id: 'settings', label: 'Settings' },
        { id: 'tools', label: 'Tools' },
    ];

    function selectTab(id: string) {
        if (activeTab === id) {
            collapsed = !collapsed;
        } else {
            activeTab = id;
            collapsed = false;
        }
    }
</script>

<div class="tab-container" class:collapsed id="tabContainer">
    <div class="tab-bar">
        {#each tabs as tab}
            <button
                class="tab-btn"
                class:active={activeTab === tab.id}
                onclick={() => selectTab(tab.id)}
            >
                <span class="arrow">▶</span>{tab.label}
            </button>
        {/each}
    </div>

    <div class="tab-content" class:active={activeTab === 'debugger' && !collapsed} id="tab-debugger">
        <DebuggerTab {emulator} />
    </div>
    <div class="tab-content" class:active={activeTab === 'assembler' && !collapsed} id="tab-assembler">
        <AssemblerTab {emulator} />
    </div>
    <div class="tab-content" class:active={activeTab === 'graphics' && !collapsed} id="tab-graphics">
        <GraphicsTab {emulator} />
    </div>
    <div class="tab-content" class:active={activeTab === 'info' && !collapsed} id="tab-info">
        <InfoTab />
    </div>
    <div class="tab-content" class:active={activeTab === 'settings' && !collapsed} id="tab-settings">
        <SettingsTab {emulator} />
    </div>
    <div class="tab-content" class:active={activeTab === 'tools' && !collapsed} id="tab-tools">
        <ToolsTab {emulator} />
    </div>
</div>

<style>
    .tab-container {
        margin-top: 0;
    }
    .tab-container.collapsed :global(.tab-content),
    .tab-container.collapsed :global(.tab-content.active) {
        display: none !important;
    }
    .tab-bar {
        display: flex;
        gap: 2px;
        background: var(--bg-primary);
        padding: 4px 4px 0 4px;
        border-radius: 6px 6px 0 0;
    }
    .tab-container.collapsed .tab-bar {
        border-radius: 6px;
        padding: 4px;
    }
    .tab-btn {
        padding: 8px 16px;
        background: var(--bg-button);
        border: none;
        border-radius: 6px 6px 0 0;
        color: var(--text-secondary);
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        transition: all 0.2s;
    }
    .tab-container.collapsed .tab-btn {
        border-radius: 4px;
    }
    .tab-btn .arrow {
        margin-right: 6px;
        font-size: 10px;
        display: inline-block;
        transition: transform 0.2s;
    }
    .tab-btn.active .arrow {
        transform: rotate(90deg);
    }
    .tab-container.collapsed .tab-btn .arrow {
        transform: rotate(0deg);
    }
    .tab-btn:hover {
        background: var(--bg-button-hover);
        color: var(--text-primary);
    }
    .tab-btn.active {
        background: var(--bg-secondary);
        color: var(--cyan);
    }
    .tab-container.collapsed .tab-btn.active {
        background: var(--bg-button);
        color: var(--text-secondary);
    }
    .tab-content {
        display: none;
        background: var(--bg-secondary);
        border-radius: 0 6px 6px 6px;
        padding: 10px;
    }
    .tab-content.active {
        display: block;
    }
</style>

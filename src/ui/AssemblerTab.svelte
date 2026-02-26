<script lang="ts">
    import type { EmulatorController } from '../core/emulator-controller';
    let { emulator }: { emulator: EmulatorController } = $props();
</script>

<div class="assembler-container">
    <div class="assembler-header">
        <div class="assembler-controls">
            <div class="asm-files-dropdown">
                <button id="btnAsmFiles" title="Browse project files" disabled>Files ▼</button>
                <div class="asm-files-list" id="asmFilesList"></div>
            </div>
            <button id="btnAsmAssemble" title="Assemble code (F9)" disabled>Assemble</button>
            <button id="btnAsmInject" title="Inject assembled code to memory" disabled>Inject</button>
            <button id="btnAsmDebug" title="Inject code and start debugging at entry point" disabled>Debug</button>
            <button id="btnAsmClear" title="Clear all">Clear</button>
            <button id="btnAsmNew" title="Create new file">New</button>
            <button id="btnAsmLoad" title="Load files (ASM, ZIP, binary)">Load</button>
            <button id="btnAsmExport" title="Export all source files as ZIP" style="display:none">Export</button>
            <button id="btnAsmDownload" title="Download generated files (.bin, .sna, .tap, .trd)" disabled>Download</button>
            <input type="file" id="asmFileInput" accept=".asm,.z80,.s,.a80,.inc,.bin,.scr,.tap,.zip" multiple style="display:none">
            <label class="asm-option"><input type="checkbox" id="chkAsmUnusedLabels"> Unused labels</label>
            <label class="asm-option"><input type="checkbox" id="chkAsmShowCompiled"> Show compiled</label>
            <label class="asm-option">Font:
                <select id="asmFontSize" title="Editor font size" style="width: 45px; padding: 2px;">
                    <option value="8">8</option>
                    <option value="9">9</option>
                    <option value="10">10</option>
                    <option value="11">11</option>
                    <option value="12" selected>12</option>
                    <option value="13">13</option>
                    <option value="14">14</option>
                    <option value="16">16</option>
                    <option value="18">18</option>
                    <option value="20">20</option>
                    <option value="22">22</option>
                    <option value="24">24</option>
                </select>
            </label>
            <label class="asm-option asm-defines-label" title="Command-line defines for IFDEF/IFNDEF (e.g., DEBUG,VERSION=5)">Defines: <input type="text" id="asmDefines" placeholder="NAME,NAME=value" spellcheck="false"></label>
            <select id="asmDetectedDefines" multiple size="1" title="Defines from @define markers in source (click to toggle)" style="display:none"></select>
            <span id="asmMainFileLabel" class="asm-main-label" style="display:none" title="Click to change main file"></span>
        </div>
    </div>
    <div class="assembler-body">
        <div class="asm-editor-container">
            <div class="asm-file-tabs" id="asmFileTabs"></div>
            <div class="asm-search-bar" id="asmSearchBar" style="display:none">
                <div class="asm-search-row">
                    <input type="text" id="asmSearchInput" placeholder="Find (Ctrl+F)" spellcheck="false">
                    <button id="btnAsmFindPrev" title="Find Previous (Shift+F3)">▲</button>
                    <button id="btnAsmFindNext" title="Find Next (F3)">▼</button>
                    <span id="asmSearchCount" class="asm-search-count"></span>
                    <label class="asm-search-option"><input type="checkbox" id="chkAsmSearchCase"> Case</label>
                    <button id="btnAsmSearchAll" title="Search in all project files">All Files</button>
                    <button id="btnAsmSearchClose" title="Close (Esc)">×</button>
                </div>
                <div class="asm-replace-row" id="asmReplaceRow" style="display:none">
                    <input type="text" id="asmReplaceInput" placeholder="Replace (Ctrl+R)" spellcheck="false">
                    <button id="btnAsmReplace" title="Replace">Replace</button>
                    <button id="btnAsmReplaceAll" title="Replace All">All</button>
                </div>
                <div class="asm-search-results" id="asmSearchResults" style="display:none"></div>
            </div>
            <div class="asm-editor-area">
                <div class="asm-line-numbers" id="asmLineNumbers"></div>
                <div class="asm-editor-wrap">
                    <pre class="asm-highlight" id="asmHighlight"></pre>
                    <textarea id="asmEditor" class="asm-textarea" spellcheck="false" placeholder={`; Enter Z80 assembly code here
; @entry start
; Example:
        ORG $8000
start:
        LD A, 2
        OUT (254), A
        JP start`}></textarea>
                </div>
            </div>
        </div>
        <div class="asm-output-container">
            <div class="asm-output-header">Output</div>
            <div class="asm-output" id="asmOutput"><span class="asm-hint">Press Assemble to compile</span></div>
        </div>
    </div>
</div>

<style>
    .assembler-container {
        display: flex;
        flex-direction: column;
        height: calc(100vh - 200px);
        min-height: 500px;
        max-height: 900px;
    }
    .assembler-header {
        display: flex;
        justify-content: flex-start;
        align-items: center;
        padding: 10px 15px;
        background: var(--bg-primary);
        border-radius: 4px;
        margin-bottom: 10px;
    }
    .assembler-controls {
        display: flex;
        gap: 8px;
        align-items: center;
    }
    .assembler-controls button {
        padding: 4px 10px;
        font-size: 11px;
    }
    .asm-option {
        font-size: 11px;
        color: var(--text-secondary);
        margin-left: 10px;
        cursor: pointer;
    }
    .asm-option input { margin-right: 4px; }
    .asm-option input[type="text"] {
        background: var(--bg-tertiary);
        color: var(--text-primary);
        border: 1px solid var(--bg-button);
        padding: 2px 6px;
        font-family: monospace;
        font-size: 11px;
        width: 140px;
        margin-left: 4px;
    }
    .assembler-body {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-height: 0;
    }
    .asm-editor-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        background: var(--bg-primary);
        border-radius: 4px;
        overflow: hidden;
        min-height: 0;
        transition: box-shadow 0.15s;
    }
    :global(.asm-editor-container.drag-over) {
        box-shadow: inset 0 0 0 3px var(--cyan);
    }
    .asm-file-tabs {
        display: flex;
        flex-wrap: nowrap;
        gap: 2px;
        padding: 4px 4px 0 4px;
        background: var(--bg-secondary);
        border-radius: 4px 4px 0 0;
        min-height: 28px;
        overflow-x: auto;
        overflow-y: hidden;
        scrollbar-width: thin;
    }
    .asm-file-tabs:empty { display: none; }
    .asm-editor-area {
        display: flex;
        flex: 1;
        min-height: 0;
    }
    .asm-line-numbers {
        padding: 10px 8px;
        background: var(--bg-button);
        color: var(--text-secondary);
        font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
        font-size: var(--asm-font-size, 12px);
        line-height: var(--asm-line-height, 17px);
        text-align: right;
        user-select: none;
        min-width: 35px;
        overflow-y: auto;
        overflow-x: hidden;
        white-space: pre;
        scrollbar-width: none;
    }
    .asm-line-numbers::-webkit-scrollbar { display: none; }
    .asm-editor-wrap {
        flex: 1;
        position: relative;
        overflow: hidden;
    }
    .asm-textarea {
        position: absolute;
        top: 0; left: 0; width: 100%; height: 100%;
        padding: 10px; margin: 0; border: none; outline: none; resize: none;
        background: transparent;
        color: var(--text-primary);
        caret-color: var(--text-primary);
        font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
        font-size: var(--asm-font-size, 12px);
        line-height: var(--asm-line-height, 17px);
        tab-size: 8; -moz-tab-size: 8;
        white-space: pre;
        overflow: auto;
        z-index: 2;
        box-sizing: border-box;
    }
    :global(.asm-textarea.highlighting) { color: transparent; }
    .asm-textarea::placeholder { color: var(--text-secondary); }
    .asm-highlight {
        position: absolute;
        top: 0; left: 0; width: 100%; height: 100%;
        padding: 10px; margin: 0; border: none;
        font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
        font-size: var(--asm-font-size, 12px);
        line-height: var(--asm-line-height, 17px);
        tab-size: 8; -moz-tab-size: 8;
        white-space: pre;
        overflow: auto;
        pointer-events: none;
        z-index: 1;
        color: var(--text-primary);
        box-sizing: border-box;
        background: transparent;
    }
    .asm-output-container {
        flex: 0 0 auto;
        display: flex;
        flex-direction: column;
        background: var(--bg-primary);
        border-radius: 4px;
        min-height: 90px;
        max-height: 200px;
    }
    .asm-output-header {
        padding: 4px 10px;
        background: var(--bg-button);
        color: var(--cyan);
        font-size: 11px;
        font-weight: bold;
        border-radius: 4px 4px 0 0;
    }
    .asm-output {
        flex: 1;
        padding: 6px 10px;
        font-family: monospace;
        font-size: 11px;
        line-height: 1.4;
        overflow: auto;
        color: var(--text-primary);
    }
    .asm-output :global(.asm-hint) {
        color: var(--text-secondary);
        font-style: italic;
    }
    /* Search bar */
    .asm-search-bar {
        background: var(--bg-secondary);
        padding: 6px 10px;
        border-bottom: 1px solid var(--bg-button);
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    .asm-search-row, .asm-replace-row {
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .asm-search-bar input[type="text"] {
        flex: 1;
        max-width: 250px;
        padding: 4px 8px;
        font-size: 12px;
        background: var(--bg-primary);
        border: 1px solid var(--bg-button);
        border-radius: 3px;
        color: var(--text-primary);
    }
    .asm-search-bar button {
        padding: 4px 8px;
        font-size: 11px;
    }
    .asm-search-count {
        font-size: 11px;
        color: var(--text-secondary);
        min-width: 60px;
    }
    .asm-search-option {
        font-size: 11px;
        color: var(--text-secondary);
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 3px;
    }
    /* Files dropdown */
    .asm-files-dropdown {
        position: relative;
        display: inline-block;
    }
    :global(.asm-files-list) {
        display: none;
        position: absolute;
        top: 100%;
        left: 0;
        background: var(--bg-secondary);
        border: 1px solid var(--bg-button);
        border-radius: 4px;
        min-width: 375px;
        max-width: 600px;
        max-height: 400px;
        overflow-y: auto;
        z-index: 1000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    :global(.asm-files-list.show) { display: block; }
    .asm-main-label {
        font-size: 10px;
        color: #ff6666;
        cursor: pointer;
        margin-left: 10px;
    }
    /* Syntax highlighting */
    :global(.asm-hl-instruction) { color: var(--accent); font-weight: bold; }
    :global(.asm-hl-directive) { color: #c080ff; }
    :global(.asm-hl-register) { color: #ffd080; }
    :global(.asm-hl-number) { color: #80ff80; }
    :global(.asm-hl-string) { color: #ff80c0; }
    :global(.asm-hl-label) { color: var(--cyan); }
    :global(.asm-hl-comment) { color: var(--text-secondary); font-style: italic; }
    :global(.asm-hl-operator) { color: var(--text-primary); }
    :global(.asm-hl-paren) { color: #c0c0c0; }
</style>

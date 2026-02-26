<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import type { EmulatorController } from '../core/emulator-controller';
    import { Disassembler } from '../core/cpu/disasm';

    let { emulator, onMemoryMapClick }: {
        emulator: EmulatorController;
        onMemoryMapClick?: () => void;
    } = $props();

    // ---- Helpers ----
    function hex8(v: number) { return v.toString(16).toUpperCase().padStart(2, '0'); }
    function hex16(v: number) { return v.toString(16).toUpperCase().padStart(4, '0'); }

    // ---- Constants ----
    const DISASM_LINES = 32;
    const DISASM_PC_POSITION = 8; // PC shown at line 8 from top
    const MEMORY_LINES = 16;
    const BYTES_PER_LINE = 16;

    // ---- State ----
    let disasm: Disassembler | null = $state(null);
    let disasmViewAddress: number | null = $state(null);
    let followPC = $state(true);
    let showTstates = $state(false);

    // Registers (updated by updateDebugger)
    let regAF = $state(0), regBC = $state(0), regDE = $state(0), regHL = $state(0);
    let regIX = $state(0), regIY = $state(0), regSP = $state(0), regPC = $state(0);
    let regAF_ = $state(0), regBC_ = $state(0), regDE_ = $state(0), regHL_ = $state(0);
    let regI = $state(0), regR = $state(0), regIM = $state(0);
    let regIFF1 = $state(false), regIFF2 = $state(false);
    let regTstates = $state(0);
    let flags = $state(0); // F register

    // Paging
    let is128k = $state(false);
    let pagingRamBank = $state(0), pagingRomBank = $state(0), pagingScreenBank = $state(5);

    // Disassembly lines
    type DisasmLine = { addr: number; bytes: number[]; mnemonic: string; length: number; timing?: string };
    let disasmLines: DisasmLine[] = $state([]);

    // Memory view
    let memoryViewAddress = $state(0);
    type MemLine = { addr: number; bytes: { addr: number; val: number }[]; ascii: string };
    let memLines: MemLine[] = $state([]);

    // Stack
    type StackEntry = { addr: number; value: number; current: boolean };
    let stackEntries: StackEntry[] = $state([]);

    // Panel types
    let leftPanelType = $state('disasm');
    let rightPanelType = $state('memdump');

    // Triggers
    let triggerList: any[] = $state([]);
    let triggerTypeInput = $state('exec');
    let triggerAddrInput = $state('');
    let triggerCondInput = $state('');

    // Bottom panel tabs
    let activeBottomTab = $state('breakpoints');

    // ---- Address input state ----
    let disasmAddrInput = $state('');
    let memAddrInput = $state('0000');
    let tstatesInput = $state('1000');

    // Left panel memory view (when leftPanelType === 'memdump')
    let leftMemAddrInput = $state('0000');
    let leftMemViewAddress = $state(0);
    let leftMemLines: MemLine[] = $state([]);

    // Right panel disasm (when rightPanelType === 'disasm')
    let rightDisasmAddrInput = $state('');
    let rightDisasmViewAddress = $state(0);
    let rightDisasmLines: DisasmLine[] = $state([]);

    // Memory search
    let memSearchInput = $state('');
    let memSearchType = $state('hex');
    let memSearchResults = $state('');
    let memSearchLastAddr = $state(-1);

    // ---- Labels state ----
    type LabelEntry = { address: number; name: string; comment?: string };
    let labels: LabelEntry[] = $state(loadLabels());
    let labelAddrInput = $state('');
    let labelNameInput = $state('');
    let labelFilterInput = $state('');

    function loadLabels(): LabelEntry[] {
        try { const s = localStorage.getItem('zx-labels'); return s ? JSON.parse(s) : []; } catch { return []; }
    }
    function saveLabels() { localStorage.setItem('zx-labels', JSON.stringify(labels)); }

    function addLabel() {
        const addr = parseInt(labelAddrInput, 16);
        if (isNaN(addr) || !labelNameInput.trim()) return;
        const existing = labels.findIndex(l => l.address === (addr & 0xffff));
        if (existing >= 0) {
            labels[existing] = { address: addr & 0xffff, name: labelNameInput.trim() };
        } else {
            labels = [...labels, { address: addr & 0xffff, name: labelNameInput.trim() }];
        }
        labels = labels.toSorted((a, b) => a.address - b.address);
        saveLabels();
        labelAddrInput = '';
        labelNameInput = '';
    }
    function removeLabel(addr: number) {
        labels = labels.filter(l => l.address !== addr);
        saveLabels();
    }
    function clearLabels() { labels = []; saveLabels(); }
    function exportLabels() {
        const blob = new Blob([JSON.stringify(labels, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'labels.json'; a.click();
        URL.revokeObjectURL(url);
    }
    let labelFileInput: HTMLInputElement;
    function importLabels() { labelFileInput?.click(); }
    function handleLabelFile(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const imported = JSON.parse(reader.result as string);
                if (Array.isArray(imported)) {
                    labels = [...labels, ...imported].toSorted((a, b) => a.address - b.address);
                    // Deduplicate by address
                    labels = labels.filter((l, i, arr) => i === 0 || l.address !== arr[i - 1].address);
                    saveLabels();
                }
            } catch { console.error('Invalid labels file'); }
        };
        reader.readAsText(file);
        (e.target as HTMLInputElement).value = '';
    }
    function filteredLabels(): LabelEntry[] {
        const f = labelFilterInput.toLowerCase();
        if (!f) return labels;
        return labels.filter(l => l.name.toLowerCase().includes(f) || hex16(l.address).toLowerCase().includes(f));
    }

    // ---- Watches state ----
    type WatchEntry = { address: number; name: string; bytes: number[] };
    let watches: WatchEntry[] = $state(loadWatches());
    let watchAddrInput = $state('');
    let watchNameInput = $state('');

    function loadWatches(): WatchEntry[] {
        try {
            const s = localStorage.getItem('zx-watches');
            return s ? JSON.parse(s).map((w: any) => ({ ...w, bytes: [] })) : [];
        } catch { return []; }
    }
    function saveWatches() {
        localStorage.setItem('zx-watches', JSON.stringify(watches.map(w => ({ address: w.address, name: w.name }))));
    }
    function addWatch() {
        const addr = parseInt(watchAddrInput, 16);
        if (isNaN(addr)) return;
        if (watches.length >= 10) return;
        watches = [...watches, { address: addr & 0xffff, name: watchNameInput.trim() || hex16(addr & 0xffff), bytes: [] }];
        saveWatches();
        watchAddrInput = '';
        watchNameInput = '';
    }
    function removeWatch(index: number) {
        watches = watches.filter((_, i) => i !== index);
        saveWatches();
    }
    function clearWatches() { watches = []; saveWatches(); }
    function updateWatchValues() {
        for (const w of watches) {
            w.bytes = [];
            for (let i = 0; i < 8; i++) {
                w.bytes.push(emulator.peek((w.address + i) & 0xffff));
            }
        }
        watches = [...watches]; // trigger reactivity
    }

    // ---- POKE search state ----
    let pokeSnapshot: Uint8Array | null = $state(null);
    let pokeCandidates: Set<number> | null = $state(null);
    let pokeSearchMode = $state('dec1');
    let pokeSearchValue = $state('');
    let pokeStatus = $state('');
    type PokeResult = { addr: number; oldVal: number; newVal: number };
    let pokeResults: PokeResult[] = $state([]);

    function pokeSnap() {
        pokeSnapshot = new Uint8Array(0x10000);
        for (let i = 0; i < 0x10000; i++) pokeSnapshot[i] = emulator.peek(i);
        pokeCandidates = null;
        pokeResults = [];
        pokeStatus = 'Snapshot taken';
    }
    function pokeSearch() {
        if (!pokeSnapshot) { pokeStatus = 'Take snapshot first'; return; }
        const candidates = pokeCandidates ?? new Set(Array.from({ length: 0x10000 - 0x4000 }, (_, i) => i + 0x4000));
        const next = new Set<number>();
        const searchVal = parseInt(pokeSearchValue) || 0;

        for (const addr of candidates) {
            const oldVal = pokeSnapshot[addr];
            const newVal = emulator.peek(addr);
            let match = false;
            switch (pokeSearchMode) {
                case 'dec1': match = newVal === ((oldVal - 1) & 0xff); break;
                case 'inc1': match = newVal === ((oldVal + 1) & 0xff); break;
                case 'decreased': match = newVal < oldVal; break;
                case 'increased': match = newVal > oldVal; break;
                case 'changed': match = newVal !== oldVal; break;
                case 'unchanged': match = newVal === oldVal; break;
                case 'equals': match = newVal === (searchVal & 0xff); break;
            }
            if (match) next.add(addr);
        }
        pokeCandidates = next;
        // Update snapshot
        for (let i = 0; i < 0x10000; i++) pokeSnapshot[i] = emulator.peek(i);

        // Build results (first 100)
        const results: PokeResult[] = [];
        for (const addr of next) {
            if (results.length >= 100) break;
            results.push({ addr, oldVal: pokeSnapshot[addr], newVal: emulator.peek(addr) });
        }
        pokeResults = results;
        pokeStatus = `${next.size} candidate${next.size !== 1 ? 's' : ''}`;
    }
    function pokeReset() {
        pokeSnapshot = null;
        pokeCandidates = null;
        pokeResults = [];
        pokeStatus = '';
    }

    // ---- Trace state ----
    type TraceEntry = { pc: number; bytes: number[]; mnemonic: string; af: number; bc: number; de: number; hl: number; sp: number };
    let traceEntries: TraceEntry[] = $state([]);
    let traceEnabled = $state(true);
    let traceMaxEntries = $state(10000);
    let traceSkipRom = $state(true);

    function recordTrace() {
        if (!traceEnabled || !disasm) return;
        const s = emulator.spectrum;
        if (!s.cpu) return;
        const pc = s.cpu.pc;
        if (traceSkipRom && pc < 0x4000) return;
        const line = disasm.disassemble(pc);
        traceEntries.push({
            pc, bytes: line.bytes, mnemonic: line.mnemonic,
            af: (s.cpu.a << 8) | s.cpu.f, bc: (s.cpu.b << 8) | s.cpu.c,
            de: (s.cpu.d << 8) | s.cpu.e, hl: (s.cpu.h << 8) | s.cpu.l,
            sp: s.cpu.sp
        });
        if (traceEntries.length > traceMaxEntries) traceEntries.splice(0, traceEntries.length - traceMaxEntries);
        traceEntries = traceEntries; // trigger reactivity
    }
    function clearTrace() { traceEntries = []; }
    function exportTrace() {
        const lines = ['PC\tBytes\tMnemonic\tAF\tBC\tDE\tHL\tSP'];
        for (const e of traceEntries) {
            lines.push(`${hex16(e.pc)}\t${e.bytes.map(b => hex8(b)).join(' ')}\t${e.mnemonic}\t${hex16(e.af)}\t${hex16(e.bc)}\t${hex16(e.de)}\t${hex16(e.hl)}\t${hex16(e.sp)}`);
        }
        const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'trace.tsv'; a.click();
        URL.revokeObjectURL(url);
    }

    // Bottom panel tab definitions
    const bottomTabs = [
        { id: 'breakpoints', label: 'Breakpoints', title: 'Breakpoints and watchpoints' },
        { id: 'labels', label: 'Labels', title: 'Address labels' },
        { id: 'watches', label: 'Watches', title: 'Memory watches' },
        { id: 'tools', label: 'Tools', title: 'POKE search, Auto-Map, XRefs, Text scan' },
        { id: 'trace', label: 'Trace', title: 'Execution trace history' },
    ];

    // ---- React to panel type changes ----
    $effect(() => {
        if (leftPanelType === 'memdump') {
            updateLeftMemoryView();
        }
    });
    $effect(() => {
        if (rightPanelType === 'disasm') {
            rightDisasmViewAddress = regPC;
            updateRightDisassemblyView();
        }
    });

    // ---- Core update function ----
    function updateDebugger() {
        const s = emulator.spectrum;
        if (!s.cpu) return;
        const cpu = s.cpu;

        // Create disassembler on first use
        if (!disasm) disasm = new Disassembler(s.memory);

        // Read registers
        regAF = (cpu.a << 8) | cpu.f; regBC = (cpu.b << 8) | cpu.c;
        regDE = (cpu.d << 8) | cpu.e; regHL = (cpu.h << 8) | cpu.l;
        regIX = cpu.ix; regIY = cpu.iy; regSP = cpu.sp; regPC = cpu.pc;
        regAF_ = (cpu.a_ << 8) | cpu.f_; regBC_ = (cpu.b_ << 8) | cpu.c_;
        regDE_ = (cpu.d_ << 8) | cpu.e_; regHL_ = (cpu.h_ << 8) | cpu.l_;
        regI = cpu.i; regR = cpu.rFull; regIM = cpu.im;
        regIFF1 = cpu.iff1; regIFF2 = cpu.iff2;
        regTstates = cpu.tStates;
        flags = cpu.f;

        // Paging
        is128k = s.memory.machineType !== '48k';
        if (is128k && s.memory.getPagingState) {
            const paging = s.memory.getPagingState();
            pagingRamBank = paging.ramBank;
            pagingRomBank = paging.romBank;
            pagingScreenBank = paging.screenBank;
        }

        // Left panel
        if (leftPanelType === 'disasm') {
            updateDisassemblyView();
        } else {
            updateLeftMemoryView();
        }

        // Right panel
        if (rightPanelType === 'memdump') {
            updateMemoryView();
        } else if (rightPanelType === 'disasm') {
            updateRightDisassemblyView();
        }

        // Stack
        updateStackView();

        // Triggers
        triggerList = emulator.getTriggers();

        // Watches
        if (activeBottomTab === 'watches') updateWatchValues();
    }

    function updateDisassemblyView() {
        if (!disasm) return;
        const pc = regPC;
        let viewAddr: number;

        if (followPC) {
            viewAddr = disasm.findStartForPosition(pc, DISASM_PC_POSITION, DISASM_LINES);
        } else if (disasmViewAddress !== null) {
            viewAddr = disasmViewAddress;
        } else {
            viewAddr = disasm.findStartForPosition(pc, DISASM_PC_POSITION, DISASM_LINES);
        }

        const lines = disasm.disassembleRange(viewAddr, DISASM_LINES);
        disasmLines = lines.map(line => ({
            ...line,
            timing: showTstates ? disasm!.getTiming(line.bytes) : undefined
        }));
    }

    function updateMemoryView() {
        const lines: MemLine[] = [];
        for (let row = 0; row < MEMORY_LINES; row++) {
            const lineAddr = (memoryViewAddress + row * BYTES_PER_LINE) & 0xffff;
            const bytes: { addr: number; val: number }[] = [];
            let ascii = '';
            for (let i = 0; i < BYTES_PER_LINE; i++) {
                const addr = (lineAddr + i) & 0xffff;
                const val = emulator.peek(addr);
                bytes.push({ addr, val });
                ascii += (val >= 32 && val < 127) ? String.fromCharCode(val) : '.';
            }
            lines.push({ addr: lineAddr, bytes, ascii });
        }
        memLines = lines;
    }

    function updateStackView() {
        const entries: StackEntry[] = [];
        const sp = regSP;
        for (let offset = -6; offset <= 6; offset += 2) {
            const addr = (sp + offset) & 0xffff;
            const lo = emulator.peek(addr);
            const hi = emulator.peek((addr + 1) & 0xffff);
            entries.push({ addr, value: lo | (hi << 8), current: offset === 0 });
        }
        stackEntries = entries;
    }

    // ---- Step controls ----
    function stepInto() {
        if (!emulator.romLoaded) return;
        if (emulator.isRunning()) emulator.stop();
        disasmViewAddress = null;
        recordTrace();
        emulator.stepInto();
        updateDebugger();
    }

    function stepOver() {
        if (!emulator.romLoaded) return;
        if (emulator.isRunning()) emulator.stop();
        disasmViewAddress = null;
        recordTrace();
        emulator.stepOver();
        updateDebugger();
    }

    function runToInt() {
        if (!emulator.romLoaded) return;
        if (emulator.isRunning()) emulator.stop();
        disasmViewAddress = null;
        emulator.runToInterrupt();
        updateDebugger();
    }

    function runToRet() {
        if (!emulator.romLoaded) return;
        if (emulator.isRunning()) emulator.stop();
        disasmViewAddress = null;
        emulator.runToRet();
        updateDebugger();
    }

    function runTstates() {
        if (!emulator.romLoaded) return;
        if (emulator.isRunning()) emulator.stop();
        const t = parseInt(tstatesInput) || 1000;
        emulator.runTstates(t);
        updateDebugger();
    }

    function runToCursor() {
        // Run to the selected disasm line address (first line as default)
        if (!emulator.romLoaded || disasmLines.length === 0) return;
        if (emulator.isRunning()) emulator.stop();
        // Use the first visible address after PC for now
        // TODO: proper cursor selection
    }

    // ---- Navigation ----
    function goToDisasmAddress() {
        const addr = parseInt(disasmAddrInput, 16);
        if (!isNaN(addr)) {
            disasmViewAddress = addr & 0xffff;
            followPC = false;
            updateDisassemblyView();
        }
    }

    function goToPC() {
        disasmViewAddress = null;
        followPC = true;
        updateDisassemblyView();
    }

    function goToMemAddress() {
        const addr = parseInt(memAddrInput, 16);
        if (!isNaN(addr)) {
            memoryViewAddress = addr & 0xffff;
            updateMemoryView();
        }
    }

    function memGoToPC() { memoryViewAddress = regPC; updateMemoryView(); memAddrInput = hex16(regPC); }
    function memGoToSP() { memoryViewAddress = regSP; updateMemoryView(); memAddrInput = hex16(regSP); }
    function memGoToHL() { memoryViewAddress = regHL; updateMemoryView(); memAddrInput = hex16(regHL); }
    function memPgUp() { memoryViewAddress = (memoryViewAddress - MEMORY_LINES * BYTES_PER_LINE) & 0xffff; updateMemoryView(); memAddrInput = hex16(memoryViewAddress); }
    function memPgDn() { memoryViewAddress = (memoryViewAddress + MEMORY_LINES * BYTES_PER_LINE) & 0xffff; updateMemoryView(); memAddrInput = hex16(memoryViewAddress); }

    // ---- Breakpoints ----
    function toggleBreakpointAtAddr(addr: number) {
        emulator.toggleBreakpoint(addr);
        triggerList = emulator.getTriggers();
        // Force disasm re-render
        disasmLines = [...disasmLines];
    }

    function addTrigger() {
        if (!triggerAddrInput.trim()) return;
        try {
            const spec = triggerAddrInput.trim();
            const trigger = emulator.parseTriggerSpec(spec, triggerTypeInput);
            if (triggerCondInput.trim()) trigger.condition = triggerCondInput.trim();
            emulator.addTrigger(trigger);
            triggerList = emulator.getTriggers();
            triggerAddrInput = '';
            triggerCondInput = '';
        } catch (e: any) {
            console.error('Invalid trigger:', e.message);
        }
    }

    function removeTrigger(index: number) {
        emulator.removeTrigger(index);
        triggerList = emulator.getTriggers();
    }

    function toggleTrigger(index: number) {
        emulator.toggleTrigger(index);
        triggerList = emulator.getTriggers();
    }

    function clearTriggers() {
        emulator.clearTriggers();
        triggerList = emulator.getTriggers();
    }

    // ---- Left panel memory view ----
    function updateLeftMemoryView() {
        const lines: MemLine[] = [];
        for (let row = 0; row < MEMORY_LINES; row++) {
            const lineAddr = (leftMemViewAddress + row * BYTES_PER_LINE) & 0xffff;
            const bytes: { addr: number; val: number }[] = [];
            let ascii = '';
            for (let i = 0; i < BYTES_PER_LINE; i++) {
                const addr = (lineAddr + i) & 0xffff;
                const val = emulator.peek(addr);
                bytes.push({ addr, val });
                ascii += (val >= 32 && val < 127) ? String.fromCharCode(val) : '.';
            }
            lines.push({ addr: lineAddr, bytes, ascii });
        }
        leftMemLines = lines;
    }

    function goToLeftMemAddress() {
        const addr = parseInt(leftMemAddrInput, 16);
        if (!isNaN(addr)) {
            leftMemViewAddress = addr & 0xffff;
            updateLeftMemoryView();
        }
    }

    // ---- Right panel disasm ----
    function updateRightDisassemblyView() {
        if (!disasm) return;
        const lines = disasm.disassembleRange(rightDisasmViewAddress, DISASM_LINES);
        rightDisasmLines = lines;
    }

    function goToRightDisasmAddress() {
        const addr = parseInt(rightDisasmAddrInput, 16);
        if (!isNaN(addr)) {
            rightDisasmViewAddress = addr & 0xffff;
            updateRightDisassemblyView();
        }
    }

    // ---- Memory search ----
    function doMemSearch() {
        const input = memSearchInput.trim();
        if (!input) return;
        const bytes = parseSearchBytes(input, memSearchType);
        if (!bytes || bytes.length === 0) { memSearchResults = 'Invalid'; return; }
        const addr = searchMemory(bytes, 0);
        if (addr >= 0) {
            memoryViewAddress = addr;
            memAddrInput = hex16(addr);
            memSearchLastAddr = addr;
            updateMemoryView();
            memSearchResults = `Found at ${hex16(addr)}`;
        } else {
            memSearchResults = 'Not found';
            memSearchLastAddr = -1;
        }
    }

    function doMemSearchNext() {
        const input = memSearchInput.trim();
        if (!input || memSearchLastAddr < 0) return;
        const bytes = parseSearchBytes(input, memSearchType);
        if (!bytes) return;
        const addr = searchMemory(bytes, (memSearchLastAddr + 1) & 0xffff);
        if (addr >= 0) {
            memoryViewAddress = addr;
            memAddrInput = hex16(addr);
            memSearchLastAddr = addr;
            updateMemoryView();
            memSearchResults = `Found at ${hex16(addr)}`;
        } else {
            memSearchResults = 'No more';
        }
    }

    function parseSearchBytes(input: string, type: string): number[] | null {
        if (type === 'hex') {
            const clean = input.replace(/\s/g, '');
            if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0) return null;
            const bytes: number[] = [];
            for (let i = 0; i < clean.length; i += 2) bytes.push(parseInt(clean.substr(i, 2), 16));
            return bytes;
        } else if (type === 'dec') {
            const val = parseInt(input);
            if (isNaN(val) || val < 0 || val > 255) return null;
            return [val];
        } else {
            return [...input].map(c => c.charCodeAt(0));
        }
    }

    function searchMemory(bytes: number[], startAddr: number): number {
        for (let i = 0; i < 65536; i++) {
            const addr = (startAddr + i) & 0xffff;
            let found = true;
            for (let j = 0; j < bytes.length; j++) {
                if (emulator.peek((addr + j) & 0xffff) !== bytes[j]) { found = false; break; }
            }
            if (found) return addr;
        }
        return -1;
    }

    // ---- Breakpoint check helper ----
    function hasBpAt(addr: number): boolean {
        return triggerList.some(t => (t.type === 'exec' || !t.type) && t.address === addr && !t.disabled);
    }

    // ---- Panel switching ----
    function setLeftPanel(e: Event) {
        leftPanelType = (e.target as HTMLSelectElement).value;
    }
    function setRightPanel(e: Event) {
        rightPanelType = (e.target as HTMLSelectElement).value;
    }

    // ---- Event wiring ----
    function onBreakpointHit(addr: number) {
        disasmViewAddress = null;
        updateDebugger();
    }

    function onTriggerHit(_info: any) {
        disasmViewAddress = null;
        updateDebugger();
    }

    let refreshInterval: ReturnType<typeof setInterval> | null = null;

    onMount(() => {
        emulator.on('breakpoint', onBreakpointHit);
        emulator.on('trigger', onTriggerHit);
        emulator.on('watchpoint', onTriggerHit);
        emulator.on('portBreakpoint', onTriggerHit);

        // Periodic refresh every 500ms (same as original)
        refreshInterval = setInterval(() => {
            if (emulator.romLoaded) updateDebugger();
        }, 500);
    });

    onDestroy(() => {
        emulator.off('breakpoint', onBreakpointHit);
        emulator.off('trigger', onTriggerHit);
        emulator.off('watchpoint', onTriggerHit);
        emulator.off('portBreakpoint', onTriggerHit);
        if (refreshInterval) clearInterval(refreshInterval);
    });

    // Flag definitions
    const FLAG_DEFS = [
        { name: 'S', bit: 0x80 }, { name: 'Z', bit: 0x40 },
        { name: 'y', bit: 0x20 }, { name: 'H', bit: 0x10 },
        { name: 'x', bit: 0x08 }, { name: 'P/V', bit: 0x04 },
        { name: 'N', bit: 0x02 }, { name: 'C', bit: 0x01 },
    ];

    // Key handler for address inputs
    function onEnter(e: KeyboardEvent, fn: () => void) {
        if (e.key === 'Enter') fn();
    }
</script>

<div class="debugger-container">
    <div class="debugger-panel open">
        <div class="main-debug-row">
            <!-- LEFT PANEL: Disassembly / Memory -->
            <div class="debugger-section disasm-panel">
                <div class="memory-header">
                    <select class="panel-type-select" title="Panel type" bind:value={leftPanelType}>
                        <option value="disasm">Disasm</option>
                        <option value="memdump">Memory</option>
                    </select>
                    {#if leftPanelType === 'disasm'}
                    <div class="memory-controls left-disasm-controls">
                        <input type="text" placeholder="0000" maxlength="4" bind:value={disasmAddrInput} onkeydown={(e) => onEnter(e, goToDisasmAddress)}>
                        <button onclick={goToDisasmAddress} title="Go to address">Go</button>
                        <button onclick={goToPC} title="Go to current PC">PC</button>
                        <button onclick={() => { if (disasmLines.length > 0) { disasmViewAddress = (disasmLines[0].addr - 32) & 0xffff; followPC = false; updateDisassemblyView(); } }} title="Navigate Back (Alt+Left)">&#9664;</button>
                        <button onclick={() => { if (disasmLines.length > 0) { disasmViewAddress = disasmLines[disasmLines.length - 1].addr; followPC = false; updateDisassemblyView(); } }} title="Navigate Forward (Alt+Right)">&#9654;</button>
                        <label class="disasm-option" title="Show T-states for each instruction"><input type="checkbox" bind:checked={showTstates} onchange={() => updateDisassemblyView()}>T-states</label>
                    </div>
                    {:else}
                    <div class="memory-controls left-memdump-controls">
                        <input type="text" placeholder="0000" maxlength="4" bind:value={leftMemAddrInput} onkeydown={(e) => onEnter(e, goToLeftMemAddress)}>
                        <button onclick={goToLeftMemAddress} title="Go to address">Go</button>
                        <button onclick={() => { leftMemViewAddress = regPC; updateLeftMemoryView(); leftMemAddrInput = hex16(regPC); }} title="Go to PC">PC</button>
                        <button onclick={() => { leftMemViewAddress = regSP; updateLeftMemoryView(); leftMemAddrInput = hex16(regSP); }} title="Go to SP">SP</button>
                        <button onclick={() => { leftMemViewAddress = regHL; updateLeftMemoryView(); leftMemAddrInput = hex16(regHL); }} title="Go to HL">HL</button>
                        <button onclick={() => { leftMemViewAddress = (leftMemViewAddress - MEMORY_LINES * BYTES_PER_LINE) & 0xffff; updateLeftMemoryView(); leftMemAddrInput = hex16(leftMemViewAddress); }} title="Page up">&#9650;</button>
                        <button onclick={() => { leftMemViewAddress = (leftMemViewAddress + MEMORY_LINES * BYTES_PER_LINE) & 0xffff; updateLeftMemoryView(); leftMemAddrInput = hex16(leftMemViewAddress); }} title="Page down">&#9660;</button>
                    </div>
                    {/if}
                </div>
                {#if leftPanelType === 'disasm'}
                <div class="disassembly-view">
                    {#each disasmLines as line}
                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <div class="disasm-line" class:current={line.addr === regPC} class:breakpoint={hasBpAt(line.addr)} onclick={() => toggleBreakpointAtAddr(line.addr)}>
                            <span class="disasm-bp" class:active={hasBpAt(line.addr)}></span>
                            <span class="disasm-addr">{hex16(line.addr)}</span>
                            <span class="disasm-bytes">{line.bytes.map(b => hex8(b)).join(' ')}</span>
                            <span class="disasm-mnemonic">{line.mnemonic}</span>
                            {#if line.timing}<span class="disasm-tstates">{line.timing}</span>{/if}
                        </div>
                    {/each}
                </div>
                {:else}
                <div class="memory-view">
                    {#each leftMemLines as line}
                        <div class="memory-line">
                            <span class="memory-addr">{hex16(line.addr)}</span>
                            <span class="memory-hex">{#each line.bytes as b}<span class="memory-byte">{hex8(b.val)}</span>{/each}</span>
                            <span class="memory-ascii">{line.ascii}</span>
                        </div>
                    {/each}
                </div>
                {/if}
                <div class="debugger-controls left-debugger-controls">
                    <button onclick={stepInto} title="Step Into (F7)">Step Into</button>
                    <button onclick={stepOver} title="Step Over (F8)">Step Over</button>
                    <button onclick={runToCursor} title="Run to Cursor (F4)">To Cursor</button>
                    <button onclick={runToInt} title="Run to INT">To INT</button>
                    <button onclick={runToRet} title="Run to RET">To RET</button>
                    <input type="text" class="tstates-input" placeholder="T" maxlength="8" bind:value={tstatesInput} onkeydown={(e) => onEnter(e, runTstates)} title="Number of T-states to run">
                    <button onclick={runTstates} title="Run specified T-states">Tstates</button>
                    <label style="margin-left: 8px; font-size: 11px;" title="Auto-scroll disassembly to follow PC"><input type="checkbox" bind:checked={followPC}> follow</label>
                </div>
            </div>
            <div class="right-column">
                <div class="registers-row">
                    <div class="reg-group">
                        <h4>Regs</h4>
                        <div class="registers-grid">
                            <span class="register-item"><span class="register-name">AF</span> <span class="register-value">{hex16(regAF)}</span></span>
                            <span class="register-item"><span class="register-name">BC</span> <span class="register-value">{hex16(regBC)}</span></span>
                            <span class="register-item"><span class="register-name">DE</span> <span class="register-value">{hex16(regDE)}</span></span>
                            <span class="register-item"><span class="register-name">HL</span> <span class="register-value">{hex16(regHL)}</span></span>
                        </div>
                        <div class="registers-grid">
                            <span class="register-item"><span class="register-name">AF'</span> <span class="register-value">{hex16(regAF_)}</span></span>
                            <span class="register-item"><span class="register-name">BC'</span> <span class="register-value">{hex16(regBC_)}</span></span>
                            <span class="register-item"><span class="register-name">DE'</span> <span class="register-value">{hex16(regDE_)}</span></span>
                            <span class="register-item"><span class="register-name">HL'</span> <span class="register-value">{hex16(regHL_)}</span></span>
                        </div>
                        <div class="registers-grid">
                            <span class="register-item"><span class="register-name">IX</span> <span class="register-value">{hex16(regIX)}</span></span>
                            <span class="register-item"><span class="register-name">IY</span> <span class="register-value">{hex16(regIY)}</span></span>
                        </div>
                    </div>
                    <div class="reg-group">
                        <h4>System</h4>
                        <div class="registers-grid">
                            <span class="register-item"><span class="register-name">SP</span> <span class="register-value">{hex16(regSP)}</span></span>
                            <span class="register-item"><span class="register-name">PC</span> <span class="register-value">{hex16(regPC)}</span></span>
                        </div>
                        <div class="registers-grid">
                            <span class="register-item"><span class="register-name">I</span> <span class="register-value">{hex8(regI)}</span></span>
                            <span class="register-item"><span class="register-name">R</span> <span class="register-value">{hex8(regR)}</span></span>
                            <span class="register-item"><span class="register-name">IM</span> <span class="register-value">{regIM}</span></span>
                            <span class="register-item"><span class="register-name">IFF</span> <span class="register-value">{regIFF1 ? '1' : '0'}/{regIFF2 ? '1' : '0'}</span></span>
                        </div>
                        <div class="registers-grid">
                            <span class="register-item"><span class="register-name">T</span> <span class="register-value">{regTstates}</span></span>
                        </div>
                        <div class="flags-label">Flags</div>
                        <div class="flags-display">
                            {#each FLAG_DEFS as f}
                                <span class="flag-item" class:set={!!(flags & f.bit)} title="{f.name}">{f.name}</span>
                            {/each}
                        </div>
                    </div>
                    <div class="stack-pages-row">
                        <div class="reg-group">
                            <h4>Stack</h4>
                            <div class="stack-view">
                                {#each stackEntries as entry}
                                    <div class="stack-entry" class:current={entry.current}>
                                        <span class="stack-addr">{hex16(entry.addr)}</span>
                                        <span class="stack-value">{hex16(entry.value)}</span>
                                    </div>
                                {/each}
                            </div>
                        </div>
                        {#if is128k}
                        <div class="reg-group">
                            <h4>Pages</h4>
                            <div class="registers-grid vertical">
                                <span class="register-item"><span class="register-name">RAM</span> <span class="register-value">{pagingRamBank}</span></span>
                                <span class="register-item"><span class="register-name">ROM</span> <span class="register-value">{pagingRomBank}</span></span>
                                <span class="register-item"><span class="register-name">SCR</span> <span class="register-value">{pagingScreenBank}</span></span>
                            </div>
                        </div>
                        {/if}
                    </div>
                </div>
                <div class="memory-section memory-panel">
                    <div class="memory-header">
                        <select class="panel-type-select" title="Panel type" bind:value={rightPanelType}>
                            <option value="memdump">Memory</option>
                            <option value="disasm">Disasm</option>
                        </select>
                        {#if rightPanelType === 'memdump'}
                        <div class="memory-controls right-memdump-controls">
                            <input type="text" placeholder="0000" maxlength="4" bind:value={memAddrInput} onkeydown={(e) => onEnter(e, goToMemAddress)}>
                            <button onclick={goToMemAddress} title="Go to address">Go</button>
                            <button onclick={memGoToPC} title="Go to PC">PC</button>
                            <button onclick={memGoToSP} title="Go to SP">SP</button>
                            <button onclick={memGoToHL} title="Go to HL">HL</button>
                            <button onclick={memPgUp} title="Page up">&#9650;</button>
                            <button onclick={memPgDn} title="Page down">&#9660;</button>
                        </div>
                        {:else}
                        <div class="memory-controls right-disasm-controls">
                            <input type="text" placeholder="0000" maxlength="4" bind:value={rightDisasmAddrInput} onkeydown={(e) => onEnter(e, goToRightDisasmAddress)}>
                            <button onclick={goToRightDisasmAddress} title="Go to address">Go</button>
                            <button onclick={() => { rightDisasmViewAddress = regPC; updateRightDisassemblyView(); }} title="Go to current PC">PC</button>
                        </div>
                        {/if}
                    </div>
                    {#if rightPanelType === 'memdump'}
                    <div class="memory-view">
                        {#each memLines as line}
                            <div class="memory-line">
                                <span class="memory-addr">{hex16(line.addr)}</span>
                                <span class="memory-hex">{#each line.bytes as b}<span class="memory-byte">{hex8(b.val)}</span>{/each}</span>
                                <span class="memory-ascii">{line.ascii}</span>
                            </div>
                        {/each}
                    </div>
                    {:else}
                    <div class="disassembly-view">
                        {#each rightDisasmLines as line}
                            <div class="disasm-line" class:current={line.addr === regPC}>
                                <span class="disasm-addr">{hex16(line.addr)}</span>
                                <span class="disasm-bytes">{line.bytes.map(b => hex8(b)).join(' ')}</span>
                                <span class="disasm-mnemonic">{line.mnemonic}</span>
                            </div>
                        {/each}
                    </div>
                    {/if}
                    <div class="memory-search inline right-memory-search">
                        <div class="search-row">
                            <span class="search-label">Search:</span>
                            <input type="text" bind:value={memSearchInput} onkeydown={(e) => onEnter(e, doMemSearch)}>
                            <select bind:value={memSearchType}>
                                <option value="hex">Hex</option>
                                <option value="dec">Dec</option>
                                <option value="text">Text</option>
                            </select>
                            <button onclick={doMemSearch} title="Find bytes in memory">Find</button>
                            <button onclick={doMemSearchNext} title="Find next occurrence">Next</button>
                        </div>
                        {#if memSearchResults}<div class="search-results">{memSearchResults}</div>{/if}
                    </div>
                </div>
            </div>
        </div>
        <div class="panel-tabs">
            <div class="panel-tab-bar">
                {#each bottomTabs as tab}
                    <button class="panel-tab-btn" class:active={activeBottomTab === tab.id} onclick={() => activeBottomTab = tab.id} title={tab.title}>{tab.label}</button>
                {/each}
            </div>
            <!-- Breakpoints Panel -->
            <div class="panel-tab-content" class:active={activeBottomTab === 'breakpoints'}>
                <div class="bp-add-form" style="margin-bottom: 5px;">
                    <select bind:value={triggerTypeInput} title="Trigger type">
                        <option value="exec">Exec</option>
                        <option value="read">Read</option>
                        <option value="write">Write</option>
                        <option value="rw">R/W</option>
                        <option value="port_in">Port IN</option>
                        <option value="port_out">Port OUT</option>
                        <option value="port_io">Port I/O</option>
                    </select>
                    <input type="text" bind:value={triggerAddrInput} placeholder="ADDR" maxlength="15" title="Examples: 4000, 4000-4FFF, 5:C000, FE&FF" onkeydown={(e) => onEnter(e, addTrigger)}>
                    <input type="text" bind:value={triggerCondInput} placeholder="if..." maxlength="30" title="Condition: A==0, val==FF, port&FE==FE">
                    <button onclick={addTrigger} title="Add breakpoint/watchpoint">+</button>
                    <button onclick={clearTriggers} title="Clear all triggers">Clear</button>
                </div>
                <div class="breakpoint-list trigger-list">
                    {#if triggerList.length === 0}
                        <div class="no-breakpoints">No breakpoints</div>
                    {:else}
                        {#each triggerList as trigger, i}
                            <div class="trigger-item" class:disabled={trigger.disabled}>
                                <span class="trigger-type">{trigger.type || 'exec'}</span>
                                <span class="trigger-addr">{trigger.addrStr || hex16(trigger.address ?? 0)}</span>
                                {#if trigger.condition}<span class="trigger-cond">if {trigger.condition}</span>{/if}
                                <button class="trigger-toggle" onclick={() => toggleTrigger(i)} title="Enable/disable">{trigger.disabled ? '○' : '●'}</button>
                                <button class="trigger-remove" onclick={() => removeTrigger(i)} title="Remove">&times;</button>
                            </div>
                        {/each}
                    {/if}
                </div>
            </div>
            <!-- Labels Panel -->
            <div class="panel-tab-content" class:active={activeBottomTab === 'labels'}>
                <div class="bp-add-form" style="margin-bottom: 5px;">
                    <input type="text" bind:value={labelAddrInput} placeholder="ADDR" maxlength="4" style="width:50px" onkeydown={(e) => onEnter(e, addLabel)}>
                    <input type="text" bind:value={labelNameInput} placeholder="Name" maxlength="20" style="width:100px" onkeydown={(e) => onEnter(e, addLabel)}>
                    <button onclick={addLabel} title="Add label">+</button>
                    <input type="text" bind:value={labelFilterInput} placeholder="Filter..." maxlength="20" style="width:80px">
                    <button onclick={exportLabels} title="Export labels">Export</button>
                    <button onclick={importLabels} title="Import labels">Import</button>
                    <button onclick={clearLabels} title="Clear all labels">Clear</button>
                    <input type="file" accept=".json" style="display:none" bind:this={labelFileInput} onchange={handleLabelFile}>
                </div>
                <div class="breakpoint-list labels-list">
                    {#if filteredLabels().length === 0}
                        <div class="no-breakpoints">No labels</div>
                    {:else}
                        {#each filteredLabels() as label}
                            <div class="trigger-item">
                                <span class="trigger-addr">{hex16(label.address)}</span>
                                <span class="trigger-type">{label.name}</span>
                                <button class="trigger-remove" onclick={() => removeLabel(label.address)} title="Remove">&times;</button>
                            </div>
                        {/each}
                    {/if}
                </div>
            </div>
            <!-- Watches Panel -->
            <div class="panel-tab-content" class:active={activeBottomTab === 'watches'}>
                <div class="bp-add-form" style="margin-bottom: 5px;">
                    <input type="text" bind:value={watchAddrInput} placeholder="ADDR" maxlength="4" style="width:50px" title="Address (hex)" onkeydown={(e) => onEnter(e, addWatch)}>
                    <input type="text" bind:value={watchNameInput} placeholder="Name" maxlength="16" style="width:80px" title="Watch name (optional)" onkeydown={(e) => onEnter(e, addWatch)}>
                    <button onclick={addWatch} title="Add memory watch (max 10)">+</button>
                    <button onclick={clearWatches} title="Clear all watches">Clear</button>
                    <button onclick={updateWatchValues} title="Refresh values">Refresh</button>
                </div>
                <div class="breakpoint-list">
                    {#if watches.length === 0}
                        <div class="no-breakpoints">No watches</div>
                    {:else}
                        {#each watches as watch, i}
                            <div class="trigger-item">
                                <span class="trigger-addr">{hex16(watch.address)}</span>
                                <span class="trigger-type">{watch.name}</span>
                                <span class="watch-bytes">{watch.bytes.map(b => hex8(b)).join(' ')}</span>
                                <button class="trigger-remove" onclick={() => removeWatch(i)} title="Remove">&times;</button>
                            </div>
                        {/each}
                    {/if}
                </div>
            </div>
            <!-- Tools Panel -->
            <div class="panel-tab-content" class:active={activeBottomTab === 'tools'}>
                <div class="bp-add-form" style="margin-bottom: 5px;">
                    <span class="search-label" style="color:var(--text-secondary);font-size:11px">POKE:</span>
                    <button onclick={pokeSnap} title="Take memory snapshot">Snap</button>
                    <select bind:value={pokeSearchMode} style="font-size:11px;padding:3px">
                        <option value="dec1">-1</option>
                        <option value="inc1">+1</option>
                        <option value="decreased">Decreased</option>
                        <option value="increased">Increased</option>
                        <option value="changed">Changed</option>
                        <option value="unchanged">Unchanged</option>
                        <option value="equals">Equals</option>
                    </select>
                    {#if pokeSearchMode === 'equals'}
                        <input type="text" bind:value={pokeSearchValue} placeholder="Val" maxlength="3" style="width:35px">
                    {/if}
                    <button onclick={pokeSearch} title="Search candidates">Search</button>
                    <button onclick={pokeReset} title="Reset search">Reset</button>
                    {#if pokeStatus}<span style="color:var(--text-secondary);font-size:11px;margin-left:4px">{pokeStatus}</span>{/if}
                </div>
                <div class="breakpoint-list">
                    {#if pokeResults.length === 0}
                        <div class="no-breakpoints">{pokeSnapshot ? 'No results' : 'Take a snapshot first'}</div>
                    {:else}
                        {#each pokeResults as r}
                            <div class="trigger-item">
                                <span class="trigger-addr">{hex16(r.addr)}</span>
                                <span class="watch-bytes">{hex8(r.newVal)}</span>
                            </div>
                        {/each}
                        {#if pokeCandidates && pokeCandidates.size > 100}
                            <div class="no-breakpoints">...and {pokeCandidates.size - 100} more</div>
                        {/if}
                    {/if}
                </div>
            </div>
            <!-- Trace Panel -->
            <div class="panel-tab-content" class:active={activeBottomTab === 'trace'}>
                <div class="bp-add-form" style="margin-bottom: 5px;">
                    <label style="font-size:11px;display:inline-flex;align-items:center;gap:3px"><input type="checkbox" bind:checked={traceEnabled}> Record</label>
                    <label style="font-size:11px;display:inline-flex;align-items:center;gap:3px"><input type="checkbox" bind:checked={traceSkipRom}> Skip ROM</label>
                    <button onclick={clearTrace} title="Clear trace">Clear</button>
                    <button onclick={exportTrace} title="Export trace to TSV">Export</button>
                    <span style="color:var(--text-secondary);font-size:11px;margin-left:4px">{traceEntries.length} entries</span>
                </div>
                <div class="breakpoint-list trace-list">
                    {#if traceEntries.length === 0}
                        <div class="no-breakpoints">No trace entries (use Step to record)</div>
                    {:else}
                        {#each traceEntries.slice(-50) as entry}
                            <div class="trigger-item trace-entry">
                                <span class="trigger-addr">{hex16(entry.pc)}</span>
                                <span class="trace-bytes">{entry.bytes.map(b => hex8(b)).join(' ')}</span>
                                <span class="trace-mnemonic">{entry.mnemonic}</span>
                                <span class="trace-regs">AF={hex16(entry.af)} BC={hex16(entry.bc)} DE={hex16(entry.de)} HL={hex16(entry.hl)}</span>
                            </div>
                        {/each}
                    {/if}
                </div>
            </div>
        </div>
    </div><!-- debugger-panel -->
</div><!-- debugger-container -->

<style>
    /* Debugger Panel */
    .debugger-container {
        margin-top: 0;
    }
    .debugger-panel {
        display: block;
        background: var(--bg-primary);
        border: 1px solid var(--bg-button);
        border-radius: 4px;
        padding: 10px;
        font-family: 'Consolas', 'Monaco', monospace;
        font-size: 11px;
    }
    .debugger-section {
        margin-bottom: 8px;
    }
    .registers-row {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 4px;
    }
    .stack-pages-row {
        display: flex;
        gap: 8px;
    }
    .registers-grid.vertical {
        flex-direction: column;
    }
    .reg-group {
        background: var(--bg-secondary);
        padding: 5px 8px;
        border-radius: 3px;
    }
    .reg-group h4 {
        color: var(--cyan);
        margin: 0 0 3px 0;
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: 1px;
    }
    .registers-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 3px;
    }
    .registers-grid + .registers-grid {
        margin-top: 6px;
    }
    .register-item {
        background: var(--bg-primary);
        padding: 1px 4px;
        border-radius: 2px;
        font-size: 11px;
        white-space: nowrap;
    }
    .register-name {
        color: var(--text-secondary);
    }
    .register-value {
        color: var(--accent);
        font-weight: bold;
        margin-left: 2px;
        display: inline-block;
    }
    .flags-label {
        font-size: 9px;
        color: var(--cyan);
        text-transform: uppercase;
        letter-spacing: 1px;
        margin-top: 6px;
        margin-bottom: 2px;
    }
    .flags-display {
        display: flex;
        gap: 2px;
        flex-wrap: wrap;
    }
    .flag-item {
        background: var(--bg-primary);
        padding: 1px 4px;
        border-radius: 2px;
        color: var(--text-secondary);
        font-size: 10px;
        cursor: pointer;
        user-select: none;
    }
    .flag-item:hover {
        background: var(--bg-tertiary);
        border: 1px solid var(--accent);
        padding: 0 3px;
    }
    .flag-item.set {
        background: #4a6a4a;
        color: #8f8;
    }
    .flag-item.set:hover {
        background: #5a7a5a;
    }
    .flag-item:not(.editable) {
        cursor: default;
        opacity: 0.7;
    }
    .flag-item:not(.editable):hover {
        border: none;
        padding: 1px 4px;
        background: inherit;
    }
    .stack-view {
        font-family: 'Consolas', 'Monaco', monospace;
        font-size: 11px;
        background: var(--bg-secondary);
        border-radius: 3px;
        padding: 3px;
    }
    .stack-entry {
        display: flex;
        padding: 1px 3px;
        border-radius: 2px;
        cursor: context-menu;
    }
    .stack-entry:hover {
        background: var(--bg-button);
    }
    .stack-entry.current {
        background: #3a4a3a;
        color: #8f8;
    }
    .stack-addr {
        color: var(--text-secondary);
        margin-right: 4px;
    }
    .stack-value {
        color: var(--text-primary);
    }
    .disassembly-view {
        background: var(--bg-primary);
        border: none;
        border-radius: 3px;
        padding: 5px;
        flex: 1;
        overflow: hidden;
        font-family: 'Consolas', 'Monaco', monospace;
        font-size: 11px;
    }
    .main-debug-row {
        display: flex;
        gap: 8px;
        margin-top: 0;
        align-items: stretch;
    }
    .right-column {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;
    }
    .disasm-panel {
        flex: 0 0 480px;
        width: 480px;
        height: 740px;
        background: var(--bg-secondary);
        border: 1px solid var(--bg-button);
        border-radius: 3px;
        padding: 10px;
        display: flex;
        flex-direction: column;
        margin-bottom: 0;
    }
    .memory-panel {
        width: 100%;
        min-width: 0;
        margin-top: 0;
        display: flex;
        flex-direction: column;
    }
    .disasm-line {
        display: flex;
        padding: 1px 3px;
        border-radius: 2px;
    }
    .disasm-line:hover {
        background: var(--bg-button);
    }
    .disasm-line.current {
        background: #4a3a2a;
        border-left: 3px solid var(--accent);
        margin-left: -3px;
    }
    .disasm-addr {
        color: var(--text-secondary);
        width: 100px;
        flex-shrink: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        cursor: pointer;
    }
    .disasm-addr:hover {
        color: var(--cyan);
        text-decoration: underline;
    }
    .disasm-mnemonic {
        color: var(--cyan);
        flex-grow: 1;
    }
    .disasm-tstates {
        color: var(--text-secondary);
        font-size: 10px;
        width: 40px;
        flex-shrink: 0;
        text-align: right;
        margin-right: 8px;
    }
    .debugger-controls {
        display: flex;
        gap: 5px;
        margin-top: 10px;
        margin-bottom: -3px;
    }
    .debugger-controls button {
        padding: 4px 8px;
        font-size: 11px;
    }
    .tstates-input {
        width: 55px;
        padding: 4px 6px;
        font-size: 11px;
        font-family: monospace;
        background: var(--bg-secondary);
        border: 1px solid var(--bg-button);
        border-radius: 3px;
        color: var(--text-primary);
    }
    .disasm-line.breakpoint {
        background: #4a2a2a;
    }
    .disasm-line.breakpoint.current {
        background: #5a3a2a;
    }
    .disasm-bp {
        width: 16px;
        flex-shrink: 0;
        text-align: center;
        cursor: pointer;
        user-select: none;
    }
    .disasm-bp::before {
        content: '\25CB';
        color: var(--text-secondary);
    }
    .disasm-bp:hover::before {
        color: var(--accent);
    }
    .disasm-bp.active::before {
        content: '\25CF';
        color: var(--accent);
    }

    /* Breakpoint/Trigger form */
    .bp-add-form {
        display: flex;
        gap: 3px;
    }
    .bp-add-form input {
        width: 55px;
        padding: 2px 5px;
        background: var(--bg-primary);
        border: 1px solid var(--bg-button);
        border-radius: 3px;
        color: var(--text-primary);
        font-family: monospace;
        font-size: 11px;
    }
    .bp-add-form select {
        padding: 2px 3px;
        font-size: 10px;
    }
    .bp-add-form button {
        padding: 2px 6px;
        font-size: 10px;
    }
    .breakpoint-list {
        max-height: 80px;
        overflow-y: auto;
    }
    /* Unified Trigger Styles */
    .trigger-item {
        display: flex;
        align-items: center;
        padding: 2px 5px;
        background: var(--bg-primary);
        border-radius: 2px;
        margin-bottom: 2px;
        font-size: 11px;
        gap: 4px;
    }
    .trigger-item:hover {
        background: var(--bg-button);
    }
    .trigger-item.disabled {
        opacity: 0.5;
    }
    .trigger-toggle {
        color: var(--text-secondary);
        cursor: pointer;
        padding: 0 3px;
        font-size: 10px;
    }
    .trigger-toggle:hover {
        color: var(--accent);
    }
    .trigger-remove {
        color: var(--text-secondary);
        cursor: pointer;
        padding: 0 3px;
        font-size: 12px;
    }
    .trigger-remove:hover {
        color: var(--accent);
    }
    .no-breakpoints {
        color: var(--text-secondary);
        font-size: 10px;
        text-align: center;
        padding: 5px;
    }
    .watch-bytes {
        color: var(--accent);
        font-family: 'Consolas', 'Monaco', monospace;
        font-size: 11px;
        margin-left: 4px;
    }
    .trace-list {
        max-height: 200px;
        overflow-y: auto;
    }
    .trace-entry {
        font-family: 'Consolas', 'Monaco', monospace;
        font-size: 10px;
        gap: 4px;
    }
    .trace-bytes {
        color: var(--text-secondary);
        width: 60px;
        flex-shrink: 0;
        opacity: 0.6;
    }
    .trace-mnemonic {
        color: var(--cyan);
        width: 120px;
        flex-shrink: 0;
    }
    .trace-regs {
        color: var(--text-secondary);
        font-size: 9px;
    }
    /* Memory Hex View */
    .memory-section {
        background: var(--bg-secondary);
        border: 1px solid var(--bg-button);
        border-radius: 3px;
        padding: 10px;
        flex: 1;
        display: flex;
        flex-direction: column;
        min-height: 0;
    }
    .memory-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
    }
    .panel-type-select {
        padding: 3px 6px;
        background: var(--bg-button);
        border: 1px solid var(--bg-button);
        border-radius: 3px;
        color: var(--cyan);
        font-size: 11px;
        font-weight: bold;
        cursor: pointer;
        margin-right: 8px;
        color-scheme: dark;
    }
    .panel-type-select option {
        background: var(--bg-secondary);
        color: var(--text-primary);
    }
    .panel-type-select:hover {
        background: var(--bg-hover);
    }
    .memory-controls {
        display: flex;
        gap: 2px;
        align-items: center;
    }
    .memory-controls input {
        width: 60px;
        padding: 4px 8px;
        background: var(--bg-primary);
        border: 1px solid var(--bg-button);
        border-radius: 3px;
        color: var(--text-primary);
        font-family: monospace;
        font-size: 12px;
    }
    .memory-controls button {
        padding: 4px 10px;
        font-size: 11px;
    }
    .disasm-option {
        margin-left: 0;
        font-size: 10px;
        color: var(--text-secondary);
        display: flex;
        align-items: center;
        gap: 0;
        white-space: nowrap;
    }
    .disasm-option input[type="checkbox"] {
        margin: 0 2px 0 0;
        padding: 0;
        width: 12px;
        height: 12px;
    }
    .memory-view {
        font-family: 'Consolas', 'Monaco', monospace;
        font-size: 11px;
        flex: 1;
        overflow: hidden;
        background: var(--bg-primary);
        border-radius: 2px;
        padding: 5px;
        min-height: 0;
    }
    :global(.memory-line) {
        display: flex;
        padding: 1px 0;
        white-space: nowrap;
        line-height: 18px;
    }
    :global(.memory-addr) {
        color: var(--text-secondary);
        width: 36px;
        flex-shrink: 0;
        cursor: pointer;
    }
    :global(.memory-addr:hover) {
        text-decoration: underline;
    }
    :global(.memory-hex) {
        display: flex;
        gap: 0;
        margin-right: 8px;
    }
    :global(#leftMemoryView .memory-hex) {
        margin-right: 14px;
    }
    :global(.memory-byte) {
        color: var(--text-primary);
        width: 18px;
        height: 16px;
        line-height: 16px;
        text-align: center;
        cursor: pointer;
        border-radius: 2px;
        display: inline-block;
    }
    :global(.memory-byte:hover) {
        background: var(--bg-button);
    }
    :global(.memory-byte.modified) {
        color: var(--accent);
    }
    :global(.memory-byte.changed) {
        background: #4a2a2a;
        color: #f88;
    }
    :global(.memory-byte.has-bp) {
        outline: 1px solid #f44;
    }
    :global(.memory-byte.has-wp) {
        outline: 1px solid #4af;
    }
    :global(.memory-byte.has-wp-r) {
        outline: 1px solid #4f4;
    }
    :global(.memory-byte.has-wp-w) {
        outline: 1px solid #fa4;
    }
    :global(.memory-byte.region-db) {
        color: #88f;
    }
    :global(.memory-byte.region-dw) {
        color: #8cf;
    }
    :global(.memory-byte.region-text) {
        color: #ff8;
    }
    :global(.memory-byte.region-graphics) {
        color: #f8f;
    }
    :global(.memory-byte.region-smc) {
        color: #f88;
    }
    :global(.memory-byte.selected) {
        background: #446;
        outline: 1px solid #88f;
    }
    :global(.memory-ascii .changed) {
        color: #f88;
    }
    :global(.memory-ascii) {
        color: var(--text-secondary);
        letter-spacing: 0;
    }
    :global(.memory-ascii .printable) {
        color: var(--cyan);
    }
    :global(.memory-ascii .region-text) {
        color: #ff8;
        font-weight: bold;
    }
    :global(.memory-edit-input) {
        width: 22px;
        height: 18px;
        padding: 0;
        margin: 0;
        text-align: center;
        font-family: inherit;
        font-size: inherit;
        background: var(--bg-secondary);
        border: 1px solid var(--cyan);
        border-radius: 2px;
        color: var(--text-primary);
        outline: none;
        box-sizing: border-box;
    }
    .memory-search {
        margin-top: 10px;
        padding-top: 10px;
        border-top: 1px solid var(--bg-button);
    }
    .memory-search.inline {
        margin-top: 4px;
        padding-top: 4px;
        margin-bottom: -10px;
        border-top: none;
    }
    .memory-search.inline input[type="text"] {
        flex: 0 1 auto;
        width: 140px;
    }
    .search-row {
        display: flex;
        gap: 5px;
        align-items: center;
    }
    .search-row input {
        flex: 1;
        padding: 4px 8px;
        background: var(--bg-primary);
        border: 1px solid var(--bg-button);
        border-radius: 3px;
        color: var(--text-primary);
        font-family: monospace;
        font-size: 12px;
    }
    .search-row select {
        padding: 4px;
        background: var(--bg-primary);
        border: 1px solid var(--bg-button);
        border-radius: 3px;
        color: var(--text-primary);
        font-size: 11px;
    }
    .search-row button {
        padding: 4px 10px;
        font-size: 11px;
    }
    .search-results {
        max-height: 80px;
        overflow-y: auto;
        margin-top: 5px;
        font-family: monospace;
        font-size: 11px;
    }
    :global(.search-result) {
        padding: 2px 5px;
        cursor: pointer;
        border-radius: 2px;
    }
    :global(.search-result:hover) {
        background: var(--bg-button);
    }
    :global(.search-result .addr) {
        color: var(--accent);
    }
    :global(.search-result .preview) {
        color: var(--text-secondary);
        margin-left: 10px;
    }
    :global(.search-info) {
        color: var(--text-secondary);
        font-style: italic;
    }

    /* Panel tabs (Breakpoints/Labels/Tools) */
    .panel-tabs {
        margin-top: 10px;
    }
    .panel-tab-bar {
        display: flex;
        gap: 2px;
        border-bottom: 1px solid var(--bg-button);
        margin-bottom: 0;
    }
    .panel-tab-btn {
        padding: 4px 12px;
        background: var(--bg-secondary);
        border: 1px solid var(--bg-button);
        border-bottom: none;
        border-radius: 3px 3px 0 0;
        color: var(--text-secondary);
        font-size: 11px;
        cursor: pointer;
        margin-bottom: -1px;
    }
    .panel-tab-btn:hover {
        background: var(--bg-button);
        color: var(--text-primary);
    }
    .panel-tab-btn.active {
        background: var(--bg-secondary);
        color: var(--cyan);
        border-bottom: 1px solid var(--bg-secondary);
    }
    .panel-tab-content {
        display: none;
        background: var(--bg-secondary);
        border: 1px solid var(--bg-button);
        border-top: none;
        border-radius: 0 0 3px 3px;
        padding: 8px;
    }
    .panel-tab-content.active {
        display: block;
    }
    :global(.panel-tab-content .panel-row) {
        display: flex;
        gap: 10px;
    }
    :global(.panel-tab-content .panel-column) {
        flex: 1;
    }
    :global(.poke-status) {
        color: var(--text-secondary);
        font-size: 11px;
        margin-left: 5px;
    }
    :global(.poke-result) {
        display: inline-block;
        padding: 2px 6px;
        margin: 1px;
        background: var(--bg-primary);
        border-radius: 2px;
        cursor: pointer;
    }
    :global(.poke-result:hover) {
        background: var(--bg-button);
    }
    :global(.poke-result .addr) {
        color: var(--accent);
    }
    :global(.poke-result .val) {
        color: var(--text-secondary);
        margin-left: 3px;
    }
    :global(.text-scan-result) {
        display: flex;
        padding: 2px 6px;
        margin: 1px 0;
        background: var(--bg-primary);
        border-radius: 2px;
        cursor: pointer;
        gap: 8px;
    }
    :global(.text-scan-result:hover) {
        background: var(--bg-button);
    }
    :global(.text-scan-result .addr) {
        color: var(--accent);
        min-width: 45px;
    }
    :global(.text-scan-result .len) {
        color: var(--text-secondary);
        min-width: 25px;
    }
    :global(.text-scan-result .text) {
        color: var(--cyan);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    :global(.text-scan-result .text .dict-match) {
        color: var(--green);
        font-weight: bold;
    }
    :global(.text-scan-result .bank) {
        color: var(--magenta);
        font-size: 9px;
        margin-left: 2px;
    }
    :global(.automap-stats.active) {
        color: var(--accent);
    }

    /* Trace List */
    :global(#panel-trace .trace-list) {
        display: block;
        max-height: calc(100% - 100px);
        min-height: 80px;
    }
    .trace-list {
        max-height: 120px;
        overflow-y: auto;
        margin-top: 5px;
        font-family: monospace;
        font-size: 11px;
        background: var(--bg-primary);
        border: 1px solid var(--border-primary);
        display: none;
    }
    :global(.trace-list.visible) {
        display: block;
    }
    :global(.trace-entry) {
        padding: 1px 4px;
        cursor: pointer;
        white-space: nowrap;
        border-bottom: 1px solid var(--border-primary);
    }
    :global(.trace-entry:hover) {
        background: var(--bg-button);
    }
    :global(.trace-entry.current) {
        background: var(--bg-selected);
    }
    :global(.trace-entry.viewing) {
        background: var(--accent);
        color: var(--bg-primary);
    }
    :global(.trace-entry .addr) {
        color: var(--accent);
    }
    :global(.trace-entry.viewing .addr) {
        color: var(--bg-primary);
    }
    :global(.trace-entry .instr) {
        color: var(--text-primary);
        margin-left: 8px;
    }
    :global(.trace-entry .regs) {
        color: var(--text-secondary);
        margin-left: 8px;
    }
    :global(.trace-entry .ports) {
        color: var(--cyan);
        margin-left: 8px;
        font-weight: bold;
    }
    :global(.trace-entry.viewing .ports) {
        color: var(--bg-secondary);
    }
    :global(.trace-entry .memops) {
        color: var(--warning);
        margin-left: 8px;
    }
    :global(.trace-entry.viewing .memops) {
        color: var(--bg-secondary);
    }
    :global(.trace-viewing-indicator) {
        background: var(--warning);
        color: #000;
        padding: 2px 6px;
        font-size: 11px;
        margin-left: 5px;
        border-radius: 3px;
    }

    :global(#watchAddrInput) {
        width: 60px;
    }
    :global(#watchNameInput) {
        width: 80px;
    }
    :global(.watch-entry) {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 2px 0;
        border-bottom: 1px solid var(--border-primary);
    }
    :global(.watch-entry:last-child) {
        border-bottom: none;
    }
    :global(.watch-addr) {
        color: var(--accent);
        min-width: 45px;
    }
    :global(.watch-name) {
        color: var(--text-secondary);
        min-width: 60px;
        max-width: 80px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    :global(.watch-name.label) {
        color: var(--cyan);
    }
    :global(.watch-bytes) {
        color: var(--text-primary);
    }
    :global(.watch-ascii) {
        color: var(--text-secondary);
    }
    :global(.watch-remove) {
        padding: 0 4px;
        font-size: 10px;
        background: var(--bg-button);
        border: 1px solid var(--border-primary);
        color: var(--text-secondary);
        cursor: pointer;
        border-radius: 2px;
    }
    :global(.watch-remove:hover) {
        background: var(--warning);
        color: #000;
    }
    :global(.watch-bytes .changed) {
        color: var(--warning);
        font-weight: bold;
    }

    :global(.bookmark-btn.set) {
        background: var(--bg-button);
        color: var(--text-primary);
    }
    :global(.bookmark-btn.type-mismatch) {
        color: var(--text-secondary);
        font-style: italic;
    }

    :global(.calc-log-entry) {
        padding: 4px 6px;
        margin: 2px 0;
        border-radius: 3px;
        background: var(--bg-secondary);
        cursor: pointer;
    }
    :global(.calc-log-entry:hover) {
        background: var(--bg-button);
    }
    :global(.calc-log-op) {
        color: var(--text-secondary);
    }
    :global(.calc-log-val) {
        color: var(--cyan);
        margin-left: 4px;
    }
    :global(.calc-log-result) {
        color: var(--green);
        font-weight: bold;
    }
    :global(.calc-btn-disabled),
    :global(.calc-btn-disabled:hover) {
        opacity: 0.35;
        cursor: not-allowed;
        background: var(--bg-tertiary) !important;
        color: var(--text-secondary);
    }
    :global(.calc-bits-label) {
        width: 18px;
        font-size: 8px;
        text-align: center;
        color: var(--text-secondary);
    }
    :global(.calc-bits-label-sep) {
        width: 3px;
    }
    :global(.calc-bit) {
        width: 18px;
        height: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 9px;
        background: var(--bg-secondary);
        border: 1px solid var(--bg-button);
        border-radius: 2px;
        cursor: pointer;
        color: var(--text-secondary);
    }
    :global(.calc-bit.set) {
        background: var(--cyan);
        color: var(--bg-primary);
    }
    :global(.calc-bit-separator) {
        width: 3px;
    }
    :global(.calc-bit-label) {
        font-size: 9px;
        color: var(--text-secondary);
        width: 100%;
        text-align: center;
        margin-top: 2px;
    }

</style>

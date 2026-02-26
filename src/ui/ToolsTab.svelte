<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import type { EmulatorController } from '../core/emulator-controller';

    let { emulator }: { emulator: EmulatorController } = $props();

    let activeSubtab: 'explorer' | 'compare' | 'tests' | 'export' = $state('explorer');

    function switchSubtab(subtab: typeof activeSubtab) {
        activeSubtab = subtab;
    }

    // ========== Helpers ==========
    function hex8(v: number): string { return (v & 0xff).toString(16).toUpperCase().padStart(2, '0'); }
    function hex16(v: number): string { return (v & 0xffff).toString(16).toUpperCase().padStart(4, '0'); }

    function downloadBlob(data: BlobPart, filename: string, mime = 'application/octet-stream') {
        const blob = new Blob([data], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    // ========== EXPLORER ==========
    let explorerFileInput: HTMLInputElement;
    let explorerData: Uint8Array | null = $state(null);
    let explorerFileName = $state('No file loaded');
    let explorerFileSizeText = $state('');
    let explorerFileType = $state('');
    let explorerParsed: any = $state(null);
    let explorerBlocks: any[] = $state([]);

    // Explorer sub-tabs
    let explorerSubtab: 'info' | 'basic' | 'disasm' | 'hexdump' = $state('info');

    // Info output (HTML)
    let explorerInfoHtml = $state('<span class="explorer-empty">Load a file to view its structure</span>');
    let explorerPreviewVisible = $state(false);
    let explorerPreviewLabel = $state('');
    let previewCanvas = $state<HTMLCanvasElement | null>(null);

    // BASIC
    let explorerBasicSources: { value: string; label: string }[] = $state([]);
    let explorerBasicSourceValue = $state('');
    let explorerBasicHtml = $state('<span class="explorer-empty">Select a BASIC program and click Decode</span>');

    // Disasm
    let explorerDisasmSources: { value: string; label: string }[] = $state([]);
    let explorerDisasmSourceValue = $state('');
    let explorerDisasmAddr = $state('0000');
    let explorerDisasmLen = $state(256);
    let explorerDisasmHtml = $state('<span class="explorer-empty">Select a source and click Disassemble</span>');

    // Hex
    let explorerHexSources: { value: string; label: string }[] = $state([]);
    let explorerHexSourceValue = $state('');
    let explorerHexAddr = $state('0000');
    let explorerHexLen = $state(256);
    let explorerHexHtml = $state('<span class="explorer-empty">Select a source and click View</span>');

    async function explorerLoadFile(e: Event) {
        const input = e.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;
        try {
            const data = await file.arrayBuffer();
            explorerData = new Uint8Array(data);
            explorerFileName = file.name;
            explorerFileSizeText = `(${explorerData.length.toLocaleString()} bytes)`;
            const ext = file.name.split('.').pop()!.toLowerCase();
            explorerFileType = ext;
            await explorerParseFile(file.name, ext);
            explorerBasicHtml = '<span class="explorer-empty">Select a BASIC program source</span>';
            explorerDisasmHtml = '<span class="explorer-empty">Select a source to disassemble</span>';
            explorerHexHtml = '';
            explorerRenderFileInfo();
            explorerSubtab = 'info';
        } catch (err: any) {
            explorerFileName = 'Error loading file';
            explorerFileSizeText = '';
            console.error('Explorer load error:', err);
        }
        input.value = '';
    }

    async function explorerParseFile(filename: string, ext: string) {
        explorerBlocks = [];
        explorerParsed = null;
        if (!explorerData) return;

        switch (ext) {
            case 'tap': explorerParsed = parseTAP(explorerData); break;
            case 'tzx': explorerParsed = parseTZX(explorerData); break;
            case 'sna': explorerParsed = parseSNA(explorerData); break;
            case 'z80': explorerParsed = parseZ80(explorerData); break;
            case 'trd': explorerParsed = parseTRD(explorerData); break;
            case 'scl': explorerParsed = parseSCL(explorerData); break;
            case 'scr': case 'bsc': case 'fnt': case 'chr':
                explorerParsed = parseRawGraphics(explorerData, ext); break;
            default:
                explorerParsed = parseRawGraphics(explorerData, ext);
        }
    }

    // ---- Format Parsers ----

    function parseTAP(data: Uint8Array) {
        const blocks: any[] = [];
        let offset = 0;
        while (offset < data.length - 1) {
            const blockLen = data[offset] | (data[offset + 1] << 8);
            if (blockLen === 0 || offset + 2 + blockLen > data.length) break;
            const blockData = data.slice(offset + 2, offset + 2 + blockLen);
            const flag = blockData[0];
            let blockInfo: any = { offset, length: blockLen, flag, data: blockData };
            if (flag === 0 && blockLen === 19) {
                const type = blockData[1];
                const name = String.fromCharCode(...blockData.slice(2, 12)).trim();
                const dataLen = blockData[12] | (blockData[13] << 8);
                const param1 = blockData[14] | (blockData[15] << 8);
                const param2 = blockData[16] | (blockData[17] << 8);
                const typeNames = ['Program', 'Number array', 'Character array', 'Bytes'];
                blockInfo.blockType = 'header';
                blockInfo.headerType = type;
                blockInfo.typeName = typeNames[type] || 'Unknown';
                blockInfo.name = name;
                blockInfo.dataLength = dataLen;
                blockInfo.param1 = param1;
                blockInfo.param2 = param2;
                if (type === 0) {
                    blockInfo.autostart = param1 < 32768 ? param1 : null;
                    blockInfo.varsOffset = param2;
                } else if (type === 3) {
                    blockInfo.startAddress = param1;
                }
            } else {
                blockInfo.blockType = 'data';
            }
            blocks.push(blockInfo);
            offset += 2 + blockLen;
        }
        explorerBlocks = blocks;
        return { type: 'tap', blocks, size: data.length };
    }

    function parseTZX(data: Uint8Array) {
        const header = String.fromCharCode(...data.slice(0, 7));
        if (header !== 'ZXTape!' || data[7] !== 0x1A) {
            return { type: 'unknown', size: data.length, error: 'Invalid TZX header' };
        }
        const versionMajor = data[8], versionMinor = data[9];
        const blocks: any[] = [];
        let offset = 10;
        const blockNames: Record<number, string> = {
            0x10: 'Standard Speed Data', 0x11: 'Turbo Speed Data', 0x12: 'Pure Tone',
            0x13: 'Pulse Sequence', 0x14: 'Pure Data', 0x15: 'Direct Recording',
            0x18: 'CSW Recording', 0x19: 'Generalized Data', 0x20: 'Pause/Stop',
            0x21: 'Group Start', 0x22: 'Group End', 0x23: 'Jump to Block',
            0x24: 'Loop Start', 0x25: 'Loop End', 0x30: 'Text Description',
            0x31: 'Message', 0x32: 'Archive Info', 0x33: 'Hardware Type',
            0x35: 'Custom Info', 0x5A: 'Glue Block'
        };
        while (offset < data.length) {
            const blockId = data[offset];
            const blockName = blockNames[blockId] || `Unknown (0x${blockId.toString(16).toUpperCase().padStart(2, '0')})`;
            let blockLen = 0;
            let blockInfo: any = { offset, id: blockId, name: blockName };
            offset++;
            switch (blockId) {
                case 0x10: {
                    const pause = data[offset] | (data[offset + 1] << 8);
                    const dataLen = data[offset + 2] | (data[offset + 3] << 8);
                    blockLen = 4 + dataLen;
                    blockInfo.pause = pause;
                    blockInfo.dataLength = dataLen;
                    const blockData = data.slice(offset + 4, offset + 4 + dataLen);
                    if (dataLen === 19 && blockData[0] === 0) {
                        const type = blockData[1];
                        const name = String.fromCharCode(...blockData.slice(2, 12)).replace(/\x00/g, ' ').trim();
                        const len = blockData[12] | (blockData[13] << 8);
                        const param1 = blockData[14] | (blockData[15] << 8);
                        const typeNames = ['Program', 'Number array', 'Character array', 'Bytes'];
                        blockInfo.headerType = typeNames[type] || 'Unknown';
                        blockInfo.fileName = name;
                        blockInfo.fileLength = len;
                        if (type === 0) blockInfo.autostart = param1 < 32768 ? param1 : null;
                        if (type === 3) blockInfo.startAddress = param1;
                    } else if (blockData[0] === 0xFF) {
                        blockInfo.dataBlock = true;
                    }
                    break;
                }
                case 0x11: blockLen = 18 + (data[offset + 15] | (data[offset + 16] << 8) | (data[offset + 17] << 16)); blockInfo.dataLength = blockLen - 18; break;
                case 0x12: blockLen = 4; break;
                case 0x13: blockLen = 1 + data[offset] * 2; break;
                case 0x14: blockLen = 10 + (data[offset + 7] | (data[offset + 8] << 8) | (data[offset + 9] << 16)); blockInfo.dataLength = blockLen - 10; break;
                case 0x15: blockLen = 8 + (data[offset + 5] | (data[offset + 6] << 8) | (data[offset + 7] << 16)); break;
                case 0x18: case 0x19: blockLen = 4 + (data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24)); break;
                case 0x20: blockLen = 2; blockInfo.pause = data[offset] | (data[offset + 1] << 8); if (blockInfo.pause === 0) blockInfo.stopTape = true; break;
                case 0x21: { const nl = data[offset]; blockLen = 1 + nl; blockInfo.groupName = String.fromCharCode(...data.slice(offset + 1, offset + 1 + nl)); break; }
                case 0x22: blockLen = 0; break;
                case 0x24: blockLen = 2; blockInfo.repetitions = data[offset] | (data[offset + 1] << 8); break;
                case 0x25: blockLen = 0; break;
                case 0x30: { const tl = data[offset]; blockLen = 1 + tl; blockInfo.text = String.fromCharCode(...data.slice(offset + 1, offset + 1 + tl)); break; }
                case 0x32: { const al = data[offset] | (data[offset + 1] << 8); blockLen = 2 + al;
                    const sc = data[offset + 2]; let io = offset + 3;
                    const infoTypes = ['Title', 'Publisher', 'Author', 'Year', 'Language', 'Type', 'Price', 'Loader', 'Origin', 'Comment'];
                    blockInfo.archiveInfo = [];
                    for (let i = 0; i < sc && io < offset + 2 + al; i++) {
                        const tid = data[io]; const sl = data[io + 1];
                        blockInfo.archiveInfo.push({ type: infoTypes[tid] || `Info ${tid}`, value: String.fromCharCode(...data.slice(io + 2, io + 2 + sl)) });
                        io += 2 + sl;
                    }
                    break;
                }
                case 0x33: blockLen = 1 + data[offset] * 3; break;
                case 0x35: blockLen = 20 + (data[offset + 16] | (data[offset + 17] << 8) | (data[offset + 18] << 16) | (data[offset + 19] << 24)); break;
                case 0x5A: blockLen = 9; break;
                default:
                    if (offset + 4 <= data.length) {
                        blockLen = data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24);
                        if (blockLen > data.length - offset) { offset = data.length; continue; }
                    } else { offset = data.length; continue; }
            }
            blockInfo.length = blockLen;
            blocks.push(blockInfo);
            offset += blockLen;
        }
        explorerBlocks = blocks;
        return { type: 'tzx', version: `${versionMajor}.${versionMinor}`, blocks, size: data.length };
    }

    function parseSNA(data: Uint8Array) {
        const is128 = data.length === 131103 || data.length === 147487;
        const regs: any = {
            I: data[0], HLa: data[1] | (data[2] << 8), DEa: data[3] | (data[4] << 8),
            BCa: data[5] | (data[6] << 8), AFa: data[7] | (data[8] << 8),
            HL: data[9] | (data[10] << 8), DE: data[11] | (data[12] << 8),
            BC: data[13] | (data[14] << 8), IY: data[15] | (data[16] << 8),
            IX: data[17] | (data[18] << 8), IFF2: (data[19] & 0x04) ? 1 : 0,
            R: data[20], AF: data[21] | (data[22] << 8), SP: data[23] | (data[24] << 8),
            IM: data[25], border: data[26]
        };
        if (!is128) {
            const spOffset = regs.SP - 0x4000 + 27;
            if (spOffset >= 0 && spOffset < data.length - 1) regs.PC = data[spOffset] | (data[spOffset + 1] << 8);
        } else {
            regs.PC = data[49179] | (data[49180] << 8);
            regs.port7FFD = data[49181];
        }
        return { type: 'sna', is128, registers: regs, memoryOffset: 27, size: data.length };
    }

    function parseZ80(data: Uint8Array) {
        const regs: any = {
            A: data[0], F: data[1], BC: data[2] | (data[3] << 8), HL: data[4] | (data[5] << 8),
            PC: data[6] | (data[7] << 8), SP: data[8] | (data[9] << 8),
            I: data[10], R: (data[11] & 0x7f) | ((data[12] & 0x01) << 7),
            border: (data[12] >> 1) & 0x07, DE: data[13] | (data[14] << 8),
            BCa: data[15] | (data[16] << 8), DEa: data[17] | (data[18] << 8),
            HLa: data[19] | (data[20] << 8), Aa: data[21], Fa: data[22],
            IY: data[23] | (data[24] << 8), IX: data[25] | (data[26] << 8),
            IFF1: data[27] ? 1 : 0, IFF2: data[28] ? 1 : 0, IM: data[29] & 0x03
        };
        let version = 1;
        let is128 = false;
        let compressed = (data[12] & 0x20) !== 0;
        let hwMode = 0;
        if (regs.PC === 0) {
            const extLen = data[30] | (data[31] << 8);
            version = extLen === 23 ? 2 : 3;
            regs.PC = data[32] | (data[33] << 8);
            hwMode = data[34];
            is128 = version === 2 ? (hwMode >= 3) : (hwMode >= 4);
        }
        regs.AF = (regs.A << 8) | regs.F;
        regs.AFa = (regs.Aa << 8) | regs.Fa;
        return { type: 'z80', version, is128, compressed, hwMode, registers: regs, memoryOffset: version === 1 ? 30 : (32 + (data[30] | (data[31] << 8))), size: data.length };
    }

    function parseTRD(data: Uint8Array) {
        const files: any[] = [];
        for (let i = 0; i < 128; i++) {
            const offset = i * 16;
            if (data[offset] === 0x00) break;
            if (data[offset] === 0x01) continue; // deleted
            const name = String.fromCharCode(...data.slice(offset, offset + 8)).trim();
            const ext = String.fromCharCode(data[offset + 8]);
            const startAddress = data[offset + 9] | (data[offset + 10] << 8);
            const length = data[offset + 11] | (data[offset + 12] << 8);
            const sectors = data[offset + 13];
            const firstSector = data[offset + 14];
            const firstTrack = data[offset + 15];
            const fileOffset = (firstTrack * 16 + firstSector) * 256;
            files.push({ name, ext, startAddress, length, sectors, offset: fileOffset });
        }
        const diskTitle = String.fromCharCode(...data.slice(0x8F5, 0x8F5 + 8)).trim();
        const freeSectors = data[0x8E5] | (data[0x8E6] << 8);
        return { type: 'trd', files, diskTitle, freeSectors, size: data.length };
    }

    function parseSCL(data: Uint8Array) {
        const sig = String.fromCharCode(...data.slice(0, 8));
        if (sig !== 'SINCLAIR') return { type: 'scl', error: 'Invalid SCL header', files: [], size: data.length };
        const fileCount = data[8];
        const files: any[] = [];
        let dataOffset = 9 + fileCount * 14;
        for (let i = 0; i < fileCount; i++) {
            const entryOffset = 9 + i * 14;
            const name = String.fromCharCode(...data.slice(entryOffset, entryOffset + 8)).trim();
            const ext = String.fromCharCode(data[entryOffset + 8]);
            const startAddress = data[entryOffset + 9] | (data[entryOffset + 10] << 8);
            const length = data[entryOffset + 11] | (data[entryOffset + 12] << 8);
            const sectors = data[entryOffset + 13];
            files.push({ name, ext, startAddress, length, sectors, offset: dataOffset });
            dataOffset += sectors * 256;
        }
        return { type: 'scl', files, size: data.length };
    }

    function parseRawGraphics(data: Uint8Array, ext: string) {
        const len = data.length;
        const sizeMap: [number, string, string][] = [
            [6912, 'scr', 'ZX Spectrum Screen (bitmap + attributes)'],
            [6144, 'bitmap', 'Monochrome Bitmap (full screen)'],
            [4096, 'bitmap_2_3', 'Monochrome Bitmap (2/3 screen)'],
            [2048, 'bitmap_1_3', 'Monochrome Bitmap (1/3 screen)'],
            [9216, 'ifl', 'IFL 8x2 Multicolor'],
            [11136, 'bsc', 'BSC Screen (6912 + 4224 border)'],
            [12288, 'mlt', 'MLT 8x1 Multicolor'],
            [18432, 'rgb3', 'RGB3 Tricolor']
        ];
        for (const [size, gType, desc] of sizeMap) {
            if (len === size) return { type: 'graphics', graphicsType: gType, description: desc, size: len, data };
        }
        if (len === 768) {
            return (ext === 'fnt' || ext === 'chr')
                ? { type: 'graphics', graphicsType: 'font', description: 'ZX Spectrum Font (96 characters)', size: len, data }
                : { type: 'graphics', graphicsType: 'attr', description: 'Attribute data (768 bytes)', size: len, data };
        }
        return { type: 'unknown', size: len };
    }

    // ---- Render File Info ----

    function explorerRenderFileInfo() {
        if (!explorerParsed) { explorerInfoHtml = '<span class="explorer-empty">No file loaded</span>'; return; }
        switch (explorerParsed.type) {
            case 'tap': explorerInfoHtml = renderTAPInfo(); break;
            case 'tzx': explorerInfoHtml = renderTZXInfo(); break;
            case 'sna': explorerInfoHtml = renderSNAInfo(); break;
            case 'z80': explorerInfoHtml = renderZ80Info(); break;
            case 'trd': explorerInfoHtml = renderTRDInfo(); break;
            case 'scl': explorerInfoHtml = renderSCLInfo(); break;
            case 'graphics': explorerInfoHtml = `<div class="explorer-info-section"><div class="explorer-info-header">${explorerParsed.description}</div><table class="explorer-info-table"><tr><th>Type</th><td>${explorerParsed.graphicsType.toUpperCase()}</td></tr><tr><th>Size</th><td>${explorerParsed.size.toLocaleString()} bytes</td></tr></table></div>`; break;
            default: explorerInfoHtml = `<div class="explorer-info-section"><div class="explorer-info-header">File Info</div><table class="explorer-info-table"><tr><th>Type</th><td>Unknown</td></tr><tr><th>Size</th><td>${explorerParsed.size.toLocaleString()} bytes</td></tr></table></div>`;
        }
        updateSourceSelectors();
        updatePreview();
    }

    function renderRegsTable(r: any) {
        const reg16 = (name: string, val: number) => `<tr><th>${name}</th><td>$${hex16(val)}</td></tr>`;
        const reg8 = (name: string, val: number) => `<tr><th>${name}</th><td>$${hex8(val)}</td></tr>`;
        let html = '<table class="explorer-info-table">';
        if (r.AF !== undefined) html += reg16('AF', r.AF);
        if (r.BC !== undefined) html += reg16('BC', r.BC);
        if (r.DE !== undefined) html += reg16('DE', r.DE);
        if (r.HL !== undefined) html += reg16('HL', r.HL);
        if (r.IX !== undefined) html += reg16('IX', r.IX);
        if (r.IY !== undefined) html += reg16('IY', r.IY);
        if (r.PC !== undefined) html += reg16('PC', r.PC);
        if (r.SP !== undefined) html += reg16('SP', r.SP);
        if (r.I !== undefined) html += reg8('I', r.I);
        if (r.R !== undefined) html += reg8('R', r.R);
        if (r.IM !== undefined) html += `<tr><th>IM</th><td>${r.IM}</td></tr>`;
        if (r.border !== undefined) html += `<tr><th>Border</th><td>${r.border}</td></tr>`;
        if (r.AFa !== undefined) html += reg16("AF'", r.AFa);
        if (r.BCa !== undefined) html += reg16("BC'", r.BCa);
        if (r.DEa !== undefined) html += reg16("DE'", r.DEa);
        if (r.HLa !== undefined) html += reg16("HL'", r.HLa);
        html += '</table>';
        return html;
    }

    function renderTAPInfo() {
        let html = `<div class="explorer-info-section"><div class="explorer-info-header">TAP File · ${explorerBlocks.length} blocks · ${explorerData!.length.toLocaleString()} bytes</div><div class="explorer-block-list">`;
        for (let i = 0; i < explorerBlocks.length; i++) {
            const block = explorerBlocks[i];
            const bd = block.data;
            let calc = 0; for (let j = 0; j < bd.length - 1; j++) calc ^= bd[j];
            const stored = bd[bd.length - 1];
            const ok = calc === stored;
            const csClass = ok ? 'checksum-ok' : 'checksum-bad';
            if (block.blockType === 'header') {
                let bc = 'explorer-block';
                if (block.headerType === 0) bc += ' basic-block';
                else if (block.headerType === 3) bc += ' code-block';
                else if (block.headerType === 1 || block.headerType === 2) bc += ' array-block';
                html += `<div class="${bc}"><div class="explorer-block-header">${i + 1}: ${block.typeName}</div>`;
                html += `<div class="explorer-block-meta">Offset: ${block.offset} | Flag: $${hex8(block.flag)} | ${block.length} bytes | Checksum: ${hex8(stored)} <span class="${csClass}">${ok ? '\u2713' : '\u2717'}</span></div>`;
                html += `<div class="explorer-block-details"><span class="label">Filename:</span> <span class="filename">"${block.name}"</span><br><span class="label">Data length:</span> ${block.dataLength} bytes`;
                if (block.headerType === 0) html += `<br><span class="label">Autostart:</span> ${block.autostart !== null ? block.autostart : 'None'}`;
                else if (block.headerType === 3) html += `<br><span class="label">Start address:</span> <span class="value">$${hex16(block.startAddress)}</span>`;
                html += '</div></div>';
            } else {
                html += `<div class="explorer-block data-block"><div class="explorer-block-header">${i + 1}: Data</div>`;
                html += `<div class="explorer-block-meta">Offset: ${block.offset} | Flag: $${hex8(block.flag)} | ${block.length} bytes | Checksum: ${hex8(stored)} <span class="${csClass}">${ok ? '\u2713' : '\u2717'}</span></div></div>`;
            }
        }
        html += '</div></div>';
        return html;
    }

    function renderTZXInfo() {
        const p = explorerParsed;
        let html = `<div class="explorer-info-section"><div class="explorer-info-header">TZX File v${p.version} · ${explorerBlocks.length} blocks · ${explorerData!.length.toLocaleString()} bytes</div><div class="explorer-block-list">`;
        for (let i = 0; i < explorerBlocks.length; i++) {
            const block = explorerBlocks[i];
            let bc = 'explorer-block';
            if (block.id === 0x10 || block.id === 0x11 || block.id === 0x14) bc += block.headerType ? ' code-block' : ' data-block';
            else if (block.id === 0x30 || block.id === 0x31 || block.id === 0x32) bc += ' basic-block';
            html += `<div class="${bc}"><div class="explorer-block-header">${i + 1}: ${block.name}</div>`;
            html += `<div class="explorer-block-meta">Offset: ${block.offset} | ID: $${hex8(block.id)} | ${block.length} bytes</div>`;
            let details = '';
            if (block.id === 0x10 && block.headerType) {
                details = `<span class="label">Type:</span> ${block.headerType}<br><span class="label">Filename:</span> <span class="filename">"${block.fileName}"</span><br><span class="label">Data length:</span> ${block.fileLength} bytes`;
                if (block.autostart !== undefined && block.autostart !== null) details += `<br><span class="label">Autostart:</span> ${block.autostart}`;
                if (block.startAddress !== undefined) details += `<br><span class="label">Start address:</span> <span class="value">$${hex16(block.startAddress)}</span>`;
            } else if (block.id === 0x10 && block.dataLength) {
                details = `<span class="label">Data length:</span> ${block.dataLength} bytes`;
            }
            if (block.id === 0x30 && block.text) details = `<span class="label">Text:</span> "${block.text}"`;
            if (block.id === 0x32 && block.archiveInfo) {
                for (const info of block.archiveInfo) details += `<span class="label">${info.type}:</span> "${info.value}"<br>`;
            }
            if (details) html += `<div class="explorer-block-details">${details}</div>`;
            html += '</div>';
        }
        html += '</div></div>';
        return html;
    }

    function renderSNAInfo() {
        const r = explorerParsed.registers;
        return `<div class="explorer-info-section"><div class="explorer-info-header">SNA Snapshot (${explorerParsed.is128 ? '128K' : '48K'})</div><table class="explorer-info-table"><tr><th>Size</th><td>${explorerData!.length.toLocaleString()} bytes</td></tr><tr><th>Machine</th><td>${explorerParsed.is128 ? '128K' : '48K'}</td></tr></table></div><div class="explorer-info-section"><div class="explorer-info-header">Registers</div>${renderRegsTable(r)}</div>`;
    }

    function renderZ80Info() {
        const r = explorerParsed.registers;
        return `<div class="explorer-info-section"><div class="explorer-info-header">Z80 Snapshot v${explorerParsed.version}</div><table class="explorer-info-table"><tr><th>Size</th><td>${explorerData!.length.toLocaleString()} bytes</td></tr><tr><th>Machine</th><td>${explorerParsed.is128 ? '128K' : '48K'}</td></tr><tr><th>Compressed</th><td>${explorerParsed.compressed ? 'Yes' : 'No'}</td></tr></table></div><div class="explorer-info-section"><div class="explorer-info-header">Registers</div>${renderRegsTable(r)}</div>`;
    }

    function renderTRDInfo() {
        let html = `<div class="explorer-info-section"><div class="explorer-info-header">TRD Disk Image</div><table class="explorer-info-table"><tr><th>Size</th><td>${explorerData!.length.toLocaleString()} bytes</td></tr><tr><th>Label</th><td>${explorerParsed.diskTitle || '(none)'}</td></tr><tr><th>Files</th><td>${explorerParsed.files.length}</td></tr><tr><th>Free</th><td>${explorerParsed.freeSectors} sectors</td></tr></table></div>`;
        html += '<div class="explorer-info-section"><div class="explorer-info-header">File List</div><div class="explorer-file-list">';
        for (let i = 0; i < explorerParsed.files.length; i++) {
            const f = explorerParsed.files[i];
            html += `<div class="explorer-file-entry"><span class="explorer-file-num">${i + 1}</span><span class="explorer-file-type">${f.ext}</span><span class="explorer-file-name">${f.name}</span><span class="explorer-file-size">${f.length}</span><span class="explorer-file-addr">$${hex16(f.startAddress)}</span></div>`;
        }
        html += '</div></div>';
        return html;
    }

    function renderSCLInfo() {
        if (explorerParsed.error) return `<div class="explorer-info-section"><div class="explorer-info-header">SCL File</div><div style="color:#e74c3c">${explorerParsed.error}</div></div>`;
        let html = `<div class="explorer-info-section"><div class="explorer-info-header">SCL Archive</div><table class="explorer-info-table"><tr><th>Size</th><td>${explorerData!.length.toLocaleString()} bytes</td></tr><tr><th>Files</th><td>${explorerParsed.files.length}</td></tr></table></div>`;
        html += '<div class="explorer-info-section"><div class="explorer-info-header">File List</div><div class="explorer-file-list">';
        for (let i = 0; i < explorerParsed.files.length; i++) {
            const f = explorerParsed.files[i];
            html += `<div class="explorer-file-entry"><span class="explorer-file-num">${i + 1}</span><span class="explorer-file-type">${f.ext}</span><span class="explorer-file-name">${f.name}</span><span class="explorer-file-size">${f.length}</span><span class="explorer-file-addr">$${hex16(f.startAddress)}</span></div>`;
        }
        html += '</div></div>';
        return html;
    }

    // ---- Source Selectors ----

    function updateSourceSelectors() {
        explorerBasicSources = [];
        explorerDisasmSources = [];
        explorerHexSources = [{ value: '', label: 'Whole file' }];

        if (!explorerParsed) return;

        if (explorerParsed.type === 'tap') {
            for (let i = 0; i < explorerBlocks.length; i++) {
                const b = explorerBlocks[i];
                if (b.blockType === 'header' && b.headerType === 0) explorerBasicSources.push({ value: `${i}`, label: `Block ${i + 1}: ${b.name}` });
                if (b.blockType === 'header' && b.headerType === 3) explorerDisasmSources.push({ value: `${i}`, label: `Block ${i + 1}: ${b.name} @ ${hex16(b.startAddress)}` });
                if (b.blockType === 'data') {
                    const prev = i > 0 ? explorerBlocks[i - 1] : null;
                    const name = prev?.blockType === 'header' ? prev.name : `Block ${i + 1}`;
                    if (!prev || prev.headerType !== 3) explorerDisasmSources.push({ value: `data:${i}`, label: `${name} data (${b.length} bytes)` });
                    explorerHexSources.push({ value: `${i}`, label: `${name} (${b.length} bytes)` });
                }
            }
        } else if (explorerParsed.type === 'trd' || explorerParsed.type === 'scl') {
            for (let i = 0; i < explorerParsed.files.length; i++) {
                const f = explorerParsed.files[i];
                if (f.ext === 'B') { explorerBasicSources.push({ value: `${i}`, label: `${f.name}.${f.ext}` }); explorerDisasmSources.push({ value: `basic:${i}`, label: `${f.name}.${f.ext} (BASIC @ 5CCB)` }); }
                else if (f.ext === 'C' || f.ext === 'D') explorerDisasmSources.push({ value: `${i}`, label: `${f.name}.${f.ext} @ ${hex16(f.startAddress)}` });
                explorerHexSources.push({ value: `${i}`, label: `${f.name}.${f.ext} (${f.length} bytes)` });
            }
        } else if (explorerParsed.type === 'sna' || explorerParsed.type === 'z80') {
            explorerDisasmSources.push({ value: 'memory', label: 'Full memory' });
            explorerHexSources.push({ value: 'memory', label: 'Full memory' });
        }

        // Auto-select
        if (explorerBasicSources.length === 1) {
            explorerBasicSourceValue = explorerBasicSources[0].value;
            explorerRenderBASIC();
            explorerSubtab = 'basic';
        }
        if (explorerDisasmSources.length > 0) {
            explorerDisasmSourceValue = explorerDisasmSources[0].value;
            onDisasmSourceChange();
        }
        if (explorerHexSources.length > 1) {
            explorerHexSourceValue = explorerHexSources[1].value;
        }
    }

    // ---- Preview ----

    const ZX_PALETTE = [
        [0,0,0],[0,0,192],[192,0,0],[192,0,192],[0,192,0],[0,192,192],[192,192,0],[192,192,192],
        [0,0,0],[0,0,255],[255,0,0],[255,0,255],[0,255,0],[0,255,255],[255,255,0],[255,255,255]
    ];

    function updatePreview() {
        if (!explorerData || !explorerParsed) { explorerPreviewVisible = false; return; }
        if (explorerParsed.type === 'graphics') {
            const d = explorerParsed.graphicsType === 'bsc' ? explorerData.slice(0, 6912) : explorerData;
            renderPreview(d);
            return;
        }
        // TAP: look for screen-sized data blocks
        if (explorerParsed.type === 'tap') {
            for (const block of explorerBlocks) {
                if (block.blockType === 'data') {
                    const contentLen = block.data.length - 2;
                    if (contentLen === 6912 || contentLen === 6144) { renderPreview(block.data.slice(1, block.data.length - 1)); return; }
                }
            }
        }
        // SNA: extract screen
        if (explorerParsed.type === 'sna' && explorerData.length >= 27 + 6912) {
            renderPreview(explorerData.slice(27, 27 + 6912)); return;
        }
        // Z80: extract screen
        if (explorerParsed.type === 'z80') {
            const screen = extractZ80Screen(explorerData, explorerParsed);
            if (screen) { renderPreview(screen); return; }
        }
        // TRD/SCL: look for screen files
        if ((explorerParsed.type === 'trd' || explorerParsed.type === 'scl') && explorerParsed.files) {
            const previewSizes = [6912, 6144];
            for (const f of explorerParsed.files) {
                if (previewSizes.includes(f.length)) { renderPreview(explorerData.slice(f.offset, f.offset + f.length)); return; }
            }
        }
        explorerPreviewVisible = false;
    }

    function extractZ80Screen(data: Uint8Array, parsed: any): Uint8Array | null {
        try {
            if (parsed.version === 1) {
                if (parsed.compressed) {
                    let endMarker = data.length;
                    for (let i = 30; i < data.length - 3; i++) {
                        if (data[i] === 0x00 && data[i + 1] === 0xED && data[i + 2] === 0xED && data[i + 3] === 0x00) { endMarker = i; break; }
                    }
                    const mem = decompressZ80(data, 30, endMarker);
                    if (mem.length >= 6912) return mem.slice(0, 6912);
                } else {
                    if (data.length >= 30 + 6912) return data.slice(30, 30 + 6912);
                }
            } else {
                const extLen = data[30] | (data[31] << 8);
                const headerEnd = 32 + extLen;
                let offset = headerEnd;
                while (offset < data.length - 3) {
                    const pageLen = data[offset] | (data[offset + 1] << 8);
                    const pageNum = data[offset + 2];
                    offset += 3;
                    if (pageNum === 8) {
                        const pageData = pageLen === 0xFFFF ? data.slice(offset, offset + 16384) : decompressZ80(data, offset, offset + pageLen);
                        if (pageData.length >= 6912) return pageData.slice(0, 6912);
                    }
                    offset += pageLen === 0xFFFF ? 16384 : pageLen;
                }
            }
        } catch {}
        return null;
    }

    function decompressZ80(data: Uint8Array, start: number, end: number): Uint8Array {
        const out: number[] = [];
        let i = start;
        while (i < end) {
            if (data[i] === 0xED && i + 1 < end && data[i + 1] === 0xED) {
                if (i + 3 < end) { const count = data[i + 2]; const val = data[i + 3]; for (let j = 0; j < count; j++) out.push(val); i += 4; } else break;
            } else { out.push(data[i]); i++; }
        }
        return new Uint8Array(out);
    }

    function renderPreview(data: Uint8Array) {
        if (!previewCanvas || data.length < 6144) { explorerPreviewVisible = false; return; }
        explorerPreviewVisible = true;
        const ctx = previewCanvas.getContext('2d')!;
        previewCanvas.width = 256;
        previewCanvas.height = 192;
        const imageData = ctx.createImageData(256, 192);
        const pixels = imageData.data;
        const hasAttrs = data.length >= 6912;
        const sections = [
            { bitmapAddr: 0, attrAddr: 6144, yOffset: 0 },
            { bitmapAddr: 2048, attrAddr: 6400, yOffset: 64 },
            { bitmapAddr: 4096, attrAddr: 6656, yOffset: 128 }
        ];
        for (const { bitmapAddr, attrAddr, yOffset } of sections) {
            for (let line = 0; line < 8; line++) {
                for (let row = 0; row < 8; row++) {
                    for (let col = 0; col < 32; col++) {
                        const bitmapOffset = bitmapAddr + col + row * 32 + line * 256;
                        const byte = data[bitmapOffset] || 0;
                        let ink: number[], paper: number[];
                        if (hasAttrs) {
                            const attr = data[attrAddr + col + row * 32];
                            const bright = (attr & 0x40) ? 8 : 0;
                            ink = ZX_PALETTE[(attr & 0x07) + bright];
                            paper = ZX_PALETTE[((attr >> 3) & 0x07) + bright];
                        } else {
                            ink = [255, 255, 255]; paper = [0, 0, 0];
                        }
                        const y = yOffset + line + row * 8;
                        for (let bit = 7; bit >= 0; bit--) {
                            const x = col * 8 + (7 - bit);
                            const color = (byte >> bit) & 1 ? ink : paper;
                            const idx = (y * 256 + x) * 4;
                            pixels[idx] = color[0]; pixels[idx + 1] = color[1]; pixels[idx + 2] = color[2]; pixels[idx + 3] = 255;
                        }
                    }
                }
            }
        }
        ctx.putImageData(imageData, 0, 0);
        explorerPreviewLabel = hasAttrs ? 'Screen (6912 bytes)' : 'Bitmap';
    }

    // ---- BASIC Decoder ----

    const BASIC_TOKENS: Record<number, string> = {
        0xA3:'SPECTRUM',0xA4:'PLAY',0xA5:'RND',0xA6:'INKEY$',0xA7:'PI',0xA8:'FN',
        0xA9:'POINT',0xAA:'SCREEN$',0xAB:'ATTR',0xAC:'AT',0xAD:'TAB',0xAE:'VAL$',
        0xAF:'CODE',0xB0:'VAL',0xB1:'LEN',0xB2:'SIN',0xB3:'COS',0xB4:'TAN',
        0xB5:'ASN',0xB6:'ACS',0xB7:'ATN',0xB8:'LN',0xB9:'EXP',0xBA:'INT',
        0xBB:'SQR',0xBC:'SGN',0xBD:'ABS',0xBE:'PEEK',0xBF:'IN',0xC0:'USR',
        0xC1:'STR$',0xC2:'CHR$',0xC3:'NOT',0xC4:'BIN',0xC5:'OR',0xC6:'AND',
        0xC7:'<=',0xC8:'>=',0xC9:'<>',0xCA:'LINE',0xCB:'THEN',0xCC:'TO',
        0xCD:'STEP',0xCE:'DEF FN',0xCF:'CAT',0xD0:'FORMAT',0xD1:'MOVE',
        0xD2:'ERASE',0xD3:'OPEN #',0xD4:'CLOSE #',0xD5:'MERGE',0xD6:'VERIFY',
        0xD7:'BEEP',0xD8:'CIRCLE',0xD9:'INK',0xDA:'PAPER',0xDB:'FLASH',
        0xDC:'BRIGHT',0xDD:'INVERSE',0xDE:'OVER',0xDF:'OUT',0xE0:'LPRINT',
        0xE1:'LLIST',0xE2:'STOP',0xE3:'READ',0xE4:'DATA',0xE5:'RESTORE',
        0xE6:'NEW',0xE7:'BORDER',0xE8:'CONTINUE',0xE9:'DIM',0xEA:'REM',
        0xEB:'FOR',0xEC:'GO TO',0xED:'GO SUB',0xEE:'INPUT',0xEF:'LOAD',
        0xF0:'LIST',0xF1:'LET',0xF2:'PAUSE',0xF3:'NEXT',0xF4:'POKE',
        0xF5:'PRINT',0xF6:'PLOT',0xF7:'RUN',0xF8:'SAVE',0xF9:'RANDOMIZE',
        0xFA:'IF',0xFB:'CLS',0xFC:'DRAW',0xFD:'CLEAR',0xFE:'RETURN',0xFF:'COPY'
    };

    function decodeBasic(data: Uint8Array): { number: number; text: string }[] {
        const lines: { number: number; text: string }[] = [];
        let offset = 0;
        while (offset + 4 <= data.length) {
            const lineNum = (data[offset] << 8) | data[offset + 1]; // big-endian
            const lineLen = data[offset + 2] | (data[offset + 3] << 8);
            if (lineNum > 9999 || lineLen === 0 || offset + 4 + lineLen > data.length) break;
            offset += 4;
            let text = '';
            let inRem = false;
            const end = offset + lineLen;
            while (offset < end) {
                const b = data[offset];
                if (b === 0x0D) { offset++; break; }
                if (b === 0x0E) { offset += 6; continue; } // skip embedded float
                if (b >= 0xA3 && BASIC_TOKENS[b]) {
                    const token = BASIC_TOKENS[b];
                    text += ' ' + token + ' ';
                    if (b === 0xEA) inRem = true;
                } else if (b >= 32 && b < 127) {
                    text += String.fromCharCode(b);
                } else if (b === 0x0D) {
                    break;
                } else if (b >= 0x10 && b <= 0x15) {
                    offset++; // skip control code parameter
                } else if (b === 0x16 || b === 0x17) {
                    offset += 2; // AT/TAB have 2 params
                }
                offset++;
            }
            lines.push({ number: lineNum, text: text.trim() });
        }
        return lines;
    }

    function explorerRenderBASIC() {
        const source = explorerBasicSourceValue;
        if (!source || !explorerData || !explorerParsed) { explorerBasicHtml = '<span class="explorer-empty">Select a BASIC program source</span>'; return; }
        let data: Uint8Array | null = null;
        if (explorerParsed.type === 'tap') {
            const idx = parseInt(source);
            const hdr = explorerBlocks[idx];
            if (hdr?.blockType === 'header' && hdr.headerType === 0 && idx + 1 < explorerBlocks.length) {
                data = explorerBlocks[idx + 1].data.slice(1, -1);
            }
        } else if (explorerParsed.type === 'trd' || explorerParsed.type === 'scl') {
            const idx = parseInt(source);
            const f = explorerParsed.files[idx];
            if (f) data = explorerData!.slice(f.offset, f.offset + f.length);
        }
        if (!data || data.length === 0) { explorerBasicHtml = '<span class="explorer-empty">No BASIC data found</span>'; return; }
        try {
            const lines = decodeBasic(data);
            if (lines.length === 0) { explorerBasicHtml = '<span class="explorer-empty">No BASIC lines found</span>'; return; }
            let html = '';
            for (const line of lines) {
                let escaped = line.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                // Highlight strings
                escaped = escaped.replace(/"([^"]*)"/g, '<span class="explorer-basic-string">"$1"</span>');
                // Highlight keywords
                for (const kw of Object.values(BASIC_TOKENS).toSorted((a, b) => b.length - a.length)) {
                    const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    escaped = escaped.replace(new RegExp('\\b(' + esc + ')\\b', 'g'), '<span class="explorer-basic-keyword">$1</span>');
                }
                // Highlight numbers
                escaped = escaped.replace(/\b(\d+(?:\.\d+)?)\b(?![^<]*>)/g, '<span class="explorer-basic-number">$1</span>');
                html += `<div class="explorer-basic-line"><span class="explorer-basic-linenum">${line.number}</span><span>${escaped}</span></div>`;
            }
            explorerBasicHtml = html;
        } catch (err: any) {
            explorerBasicHtml = `<span class="explorer-empty">Error: ${err.message}</span>`;
        }
    }

    // ---- Disassembler ----

    function onDisasmSourceChange() {
        const source = explorerDisasmSourceValue;
        if (!source || !explorerParsed) return;
        if (explorerParsed.type === 'tap') {
            if (source.startsWith('data:')) {
                const idx = parseInt(source.slice(5));
                const prev = idx > 0 ? explorerBlocks[idx - 1] : null;
                if (prev?.startAddress !== undefined) explorerDisasmAddr = hex16(prev.startAddress);
            } else {
                const hdr = explorerBlocks[parseInt(source)];
                if (hdr?.startAddress !== undefined) explorerDisasmAddr = hex16(hdr.startAddress);
            }
        } else if (explorerParsed.type === 'trd' || explorerParsed.type === 'scl') {
            if (source.startsWith('basic:')) explorerDisasmAddr = '5CCB';
            else {
                const f = explorerParsed.files[parseInt(source)];
                if (f?.startAddress !== undefined) explorerDisasmAddr = hex16(f.startAddress);
            }
        } else if (source === 'memory') explorerDisasmAddr = '4000';
        explorerRenderDisasm();
    }

    function explorerRenderDisasm() {
        const addr = parseInt(explorerDisasmAddr, 16) || 0;
        const len = explorerDisasmLen || 256;
        const source = explorerDisasmSourceValue;
        if (!explorerData || !explorerParsed) { explorerDisasmHtml = '<span class="explorer-empty">No data</span>'; return; }

        let data: Uint8Array | null = null;
        let baseAddr = addr;

        if (source === 'memory' && (explorerParsed.type === 'sna' || explorerParsed.type === 'z80')) {
            data = explorerData.slice(explorerParsed.memoryOffset || 27);
            baseAddr = 0x4000;
        } else if (source && explorerParsed.type === 'tap') {
            if (source.startsWith('data:')) {
                const idx = parseInt(source.slice(5));
                const db = explorerBlocks[idx];
                if (db?.blockType === 'data') {
                    data = db.data.slice(1, -1);
                    const prev = idx > 0 ? explorerBlocks[idx - 1] : null;
                    baseAddr = prev?.startAddress ?? 0;
                }
            } else {
                const idx = parseInt(source);
                const hdr = explorerBlocks[idx];
                if (hdr?.blockType === 'header' && idx + 1 < explorerBlocks.length) {
                    data = explorerBlocks[idx + 1].data.slice(1, -1);
                    baseAddr = hdr.startAddress || 0;
                }
            }
        } else if (source && (explorerParsed.type === 'trd' || explorerParsed.type === 'scl')) {
            if (source.startsWith('basic:')) {
                const f = explorerParsed.files[parseInt(source.slice(6))];
                if (f) { data = explorerData.slice(f.offset, f.offset + f.sectors * 256); baseAddr = 0x5D3B; }
            } else {
                const f = explorerParsed.files[parseInt(source)];
                if (f) { data = explorerData.slice(f.offset, f.offset + f.sectors * 256); baseAddr = f.startAddress; }
            }
        } else if (!source && explorerData) { data = explorerData; }

        if (!data || data.length === 0) { explorerDisasmHtml = '<span class="explorer-empty">No data to disassemble</span>'; return; }

        // Use Disassembler from Spectrum if available, else simple decode
        const s = emulator.spectrum;
        let disasm: any = null;
        try {
            if (s && s.disasm) disasm = s.disasm;
            else if ((window as any).Disassembler) {
                const fakeMemory = { read: (a: number) => { const off = a - baseAddr; return off >= 0 && off < data!.length ? data![off] : 0; } };
                disasm = new (window as any).Disassembler(fakeMemory);
            }
        } catch {}

        if (disasm) {
            // Temporarily override memory read if using spectrum disasm
            const origRead = disasm.memory?.read;
            if (disasm.memory) disasm.memory.read = (a: number) => { const off = a - baseAddr; return off >= 0 && off < data!.length ? data![off] : 0; };

            let html = '';
            let offset = addr - baseAddr;
            const endOffset = Math.min(offset + len, data.length);
            while (offset < endOffset && offset >= 0) {
                const currentAddr = baseAddr + offset;
                try {
                    const result = disasm.disassemble(currentAddr);
                    const instrLen = result.length || 1;
                    const bytesHex = result.bytes.map((b: number) => hex8(b)).join(' ');
                    let mnemonic = result.mnemonic || '???';
                    html += `<span class="da">${hex16(currentAddr)}</span>  <span class="dm">${mnemonic.padEnd(20)}</span> <span class="db">; ${bytesHex}</span>\n`;
                    offset += instrLen;
                } catch { offset++; }
            }
            if (disasm.memory && origRead) disasm.memory.read = origRead;
            explorerDisasmHtml = html || '<span class="explorer-empty">No instructions</span>';
        } else {
            // Fallback: simple hex bytes
            let html = '';
            let offset = Math.max(0, addr - baseAddr);
            const endOffset = Math.min(offset + len, data.length);
            for (let i = offset; i < endOffset; i++) {
                if ((i - offset) % 16 === 0) html += `<span class="da">${hex16(baseAddr + i)}</span>  `;
                html += `<span class="hb">${hex8(data[i])}</span> `;
                if ((i - offset) % 16 === 15) html += '\n';
            }
            explorerDisasmHtml = html || '<span class="explorer-empty">No data</span>';
        }
    }

    // ---- Hex Dump ----

    function explorerRenderHexDump() {
        const addr = parseInt(explorerHexAddr, 16) || 0;
        const len = explorerHexLen || 256;
        const source = explorerHexSourceValue;
        if (!explorerData || !explorerParsed) { explorerHexHtml = '<span class="explorer-empty">No data</span>'; return; }

        let data: Uint8Array | null = null;
        let baseAddr = addr;

        if (source === 'memory' && (explorerParsed.type === 'sna' || explorerParsed.type === 'z80')) {
            data = explorerData.slice(explorerParsed.memoryOffset || 27); baseAddr = 0x4000;
        } else if (source && explorerParsed.type === 'tap') {
            const idx = parseInt(source); const b = explorerBlocks[idx];
            if (b?.blockType === 'data') { data = b.data; baseAddr = 0; }
        } else if (source && (explorerParsed.type === 'trd' || explorerParsed.type === 'scl')) {
            const f = explorerParsed.files[parseInt(source)]; if (f) { data = explorerData.slice(f.offset, f.offset + f.length); baseAddr = 0; }
        } else if (explorerData) { data = explorerData; }

        if (!data || data.length === 0) { explorerHexHtml = '<span class="explorer-empty">No data</span>'; return; }

        let html = '';
        const startOffset = Math.max(0, addr - baseAddr);
        const endOffset = Math.min(startOffset + len, data.length);
        for (let offset = startOffset; offset < endOffset; offset += 16) {
            const lineAddr = baseAddr + offset;
            let bytesHex = '', ascii = '';
            for (let i = 0; i < 16; i++) {
                if (offset + i < data.length) {
                    const b = data[offset + i];
                    bytesHex += hex8(b) + ' ';
                    ascii += (b >= 32 && b < 127) ? String.fromCharCode(b) : '.';
                } else { bytesHex += '   '; ascii += ' '; }
                if (i === 7) bytesHex += ' ';
            }
            html += `<span class="ha">${hex16(lineAddr)}</span>  <span class="hb">${bytesHex}</span>  <span class="hc">${ascii}</span>\n`;
        }
        explorerHexHtml = html || '<span class="explorer-empty">No data</span>';
    }

    // ========== COMPARE ==========
    let compareMode = $state('sna-sna');
    let compareFileA: HTMLInputElement;
    let compareFileB = $state<HTMLInputElement | null>(null);
    let compareShowEqual = $state(false);
    let compareHexDump = $state(true);
    let compareExcludeScreen = $state(true);
    let compareHeaderHtml = $state('');
    let compareDataHtml = $state('');
    let compareStatus = $state('');
    let compareShowNoResults = $state(false);

    async function runCompare() {
        compareHeaderHtml = '';
        compareDataHtml = '';
        compareStatus = '';
        compareShowNoResults = false;

        if (compareMode === 'sna-emu') {
            // Compare file A against current emulator state
            if (!compareFileA?.files?.[0]) { compareStatus = 'Select File A'; return; }
            const dataA = new Uint8Array(await compareFileA.files[0].arrayBuffer());
            compareSnapshotVsEmulator(dataA);
            return;
        }

        if (compareMode === 'bin-bin') {
            if (!compareFileA?.files?.[0] || !compareFileB?.files?.[0]) { compareStatus = 'Select both files'; return; }
            const dataA = new Uint8Array(await compareFileA.files[0].arrayBuffer());
            const dataB = new Uint8Array(await compareFileB.files[0].arrayBuffer());
            const result = compareBinaryData(dataA, dataB, 0, 0, null, compareShowEqual, compareHexDump);
            if (result.count === 0) { compareShowNoResults = true; }
            else {
                compareStatus = `${result.count} bytes differ`;
                compareDataHtml = result.html;
            }
            return;
        }

        // sna-sna: compare two snapshot files
        if (!compareFileA?.files?.[0] || !compareFileB?.files?.[0]) { compareStatus = 'Select both files'; return; }
        const rawA = new Uint8Array(await compareFileA.files[0].arrayBuffer());
        const rawB = new Uint8Array(await compareFileB.files[0].arrayBuffer());
        // Parse both as SNA/Z80
        const snapA = parseSnapshotForCompare(rawA);
        const snapB = parseSnapshotForCompare(rawB);
        if (!snapA || !snapB) { compareStatus = 'Unsupported file format'; return; }

        // Compare registers
        let regHtml = '<div style="font-family:monospace;font-size:12px">';
        const regNames = ['AF', 'BC', 'DE', 'HL', 'IX', 'IY', 'PC', 'SP'];
        for (const name of regNames) {
            const a = snapA.registers[name], b = snapB.registers[name];
            if (a === undefined || b === undefined) continue;
            const diff = a !== b;
            if (diff || compareShowEqual) {
                const color = diff ? 'color:#ff6b6b;font-weight:bold' : '';
                regHtml += `<div style="${color}">${name.padEnd(4)} $${hex16(a)} vs $${hex16(b)}${diff ? ' <' : ''}</div>`;
            }
        }
        regHtml += '</div>';
        compareHeaderHtml = regHtml;

        // Compare memory
        if (snapA.memory && snapB.memory) {
            const result = compareBinaryData(snapA.memory, snapB.memory, 0, 0, null, compareShowEqual, compareHexDump);
            if (result.count === 0 && !compareHeaderHtml) compareShowNoResults = true;
            else {
                compareStatus = `${result.count} bytes differ`;
                compareDataHtml = result.html;
            }
        }
    }

    function parseSnapshotForCompare(data: Uint8Array): any {
        if (data.length === 49179 || data.length === 131103 || data.length === 147487) {
            const p = parseSNA(data);
            return { registers: p.registers, memory: data.slice(27), is128K: p.is128 };
        }
        if (data.length > 30 && data[0] !== 0 && data[6] === 0 && data[7] === 0) {
            // Likely Z80
            const p = parseZ80(data);
            return { registers: p.registers, memory: data.slice(p.memoryOffset), is128K: p.is128 };
        }
        return null;
    }

    function compareSnapshotVsEmulator(data: Uint8Array) {
        const snap = parseSnapshotForCompare(data);
        if (!snap) { compareStatus = 'Not a valid snapshot file'; return; }
        const state = emulator.getState();
        if (!state) { compareStatus = 'Emulator not ready'; return; }
        let regHtml = '<div style="font-family:monospace;font-size:12px">';
        const emuRegs: any = { AF: state.af, BC: state.bc, DE: state.de, HL: state.hl, IX: state.ix, IY: state.iy, PC: state.pc, SP: state.sp };
        for (const name of ['AF', 'BC', 'DE', 'HL', 'IX', 'IY', 'PC', 'SP']) {
            const a = snap.registers[name], b = emuRegs[name];
            if (a === undefined || b === undefined) continue;
            const diff = a !== b;
            if (diff || compareShowEqual) {
                const color = diff ? 'color:#ff6b6b;font-weight:bold' : '';
                regHtml += `<div style="${color}">${name.padEnd(4)} $${hex16(a)} (file) vs $${hex16(b)} (emu)${diff ? ' <' : ''}</div>`;
            }
        }
        regHtml += '</div>';
        compareHeaderHtml = regHtml;
    }

    function compareBinaryData(dataA: Uint8Array, dataB: Uint8Array, offsetA: number, offsetB: number, length: number | null, showEqual: boolean, showHexDump: boolean) {
        const len = length || Math.max(dataA.length - offsetA, dataB.length - offsetB);
        const diffs: any[] = [];
        for (let i = 0; i < len; i++) {
            const aA = offsetA + i, aB = offsetB + i;
            const a = aA < dataA.length ? dataA[aA] : null;
            const b = aB < dataB.length ? dataB[aB] : null;
            const isDiff = a !== b;
            if (isDiff || showEqual) diffs.push({ offset: i, a, b, isDiff });
        }
        if (diffs.length === 0) return { count: 0, html: '' };
        const diffCount = diffs.filter(d => d.isDiff).length;
        if (!showHexDump) {
            const lines = diffs.slice(0, 500).map(d => {
                const color = d.isDiff ? 'color:#ff6b6b' : '';
                return `<div style="${color}">${hex16(d.offset)}: ${d.a !== null ? hex8(d.a) : '--'} vs ${d.b !== null ? hex8(d.b) : '--'}${d.isDiff ? ' <' : ''}</div>`;
            });
            return { count: diffCount, html: lines.join('') };
        }
        // Hex dump grouped by 16
        let html = '';
        let i = 0;
        while (i < diffs.length && i < 1000) {
            const startOff = diffs[i].offset & ~0xF;
            let endI = i;
            while (endI < diffs.length && diffs[endI].offset < startOff + 32) endI++;
            for (let lineStart = startOff; lineStart < startOff + 32 && i < endI; lineStart += 16) {
                let hexA = '', hexB = '';
                for (let j = 0; j < 16; j++) {
                    const off = lineStart + j;
                    const diff = diffs.find((d: any) => d.offset === off);
                    const a = offsetA + off < dataA.length ? dataA[offsetA + off] : null;
                    const b = offsetB + off < dataB.length ? dataB[offsetB + off] : null;
                    const isDiff = diff?.isDiff;
                    const s = isDiff ? 'color:#ff6b6b;font-weight:bold' : '';
                    hexA += `<span style="${s}">${a !== null ? hex8(a) : '--'}</span> `;
                    hexB += `<span style="${s}">${b !== null ? hex8(b) : '--'}</span> `;
                }
                html += `<div style="white-space:nowrap">${hex16(lineStart)}: ${hexA}</div>`;
                html += `<div style="white-space:nowrap;color:var(--cyan)">${hex16(lineStart)}: ${hexB}</div>`;
            }
            html += '<hr style="border-color:var(--border);margin:5px 0">';
            i = endI;
        }
        return { count: diffCount, html };
    }

    // ========== EXPORT ==========
    let exportFormat = $state('png');
    let exportSize = $state('screen');
    let exportMaxFrames = $state(0);
    let exportSpriteX = $state(0);
    let exportSpriteY = $state(0);
    let exportSpriteW = $state(16);
    let exportSpriteH = $state(16);
    let frameGrabActive = $state(false);
    let frameGrabStatus = $state('');
    let frameGrabFrames: any[] = [];
    let frameGrabWasRunning = false;

    let showSpriteRegion = $derived(exportSize.startsWith('sprite-'));
    let showScaOptions = $derived(exportFormat === 'sca');

    // PSG
    let psgRecording = $state(false);
    let psgStatus = $state('');
    let psgChangedOnly = $state(true);
    let psgUpdateInterval: ReturnType<typeof setInterval> | null = null;

    // RZX recording
    let rzxRecording = $state(false);
    let rzxRecStatus = $state('');

    // Dedup loops
    let exportDedupLoops = $state(true);

    function exportScreenshot() {
        if (!emulator.romLoaded) return;
        const imageData = emulator.renderAndCaptureScreen();
        const canvas = document.createElement('canvas');
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        const ctx = canvas.getContext('2d')!;
        ctx.putImageData(imageData, 0, 0);

        if (exportFormat === 'png') {
            canvas.toBlob(blob => {
                if (blob) downloadBlob(blob, `screenshot_${emulator.getMachineType()}.png`, 'image/png');
            });
            frameGrabStatus = 'Exported PNG';
        } else if (exportFormat === 'scr') {
            // Get raw screen memory
            const s = emulator.spectrum;
            const screenData = new Uint8Array(6912);
            for (let i = 0; i < 6912; i++) screenData[i] = emulator.peek(0x4000 + i);
            downloadBlob(screenData, `screenshot_${emulator.getMachineType()}.scr`);
            frameGrabStatus = 'Exported SCR';
        } else {
            // For other formats, just export as PNG for now
            canvas.toBlob(blob => {
                if (blob) downloadBlob(blob, `screenshot_${emulator.getMachineType()}.png`, 'image/png');
            });
            frameGrabStatus = 'Exported PNG';
        }
    }

    function startFrameGrab() {
        frameGrabWasRunning = emulator.isRunning();
        frameGrabActive = true;
        frameGrabFrames = [];
        frameGrabStatus = 'Recording: 0 frames';

        emulator.on('frame', captureFrame);
        if (!frameGrabWasRunning) emulator.start();
    }

    function captureFrame() {
        if (!frameGrabActive) return;
        const imageData = emulator.renderAndCaptureScreen();
        const canvas = document.createElement('canvas');
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        canvas.getContext('2d')!.putImageData(imageData, 0, 0);

        const attrs = new Uint8Array(768);
        const bitmap = new Uint8Array(6144);
        for (let i = 0; i < 6144; i++) bitmap[i] = emulator.peek(0x4000 + i);
        for (let i = 0; i < 768; i++) attrs[i] = emulator.peek(0x5800 + i);

        frameGrabFrames.push({ dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height, attrs, bitmap });
        frameGrabStatus = `Recording: ${frameGrabFrames.length} frames (${(frameGrabFrames.length / 50).toFixed(2)}s)`;

        if (exportMaxFrames > 0 && frameGrabFrames.length >= exportMaxFrames) stopFrameGrab(false);
    }

    function stopFrameGrab(cancel: boolean) {
        frameGrabActive = false;
        emulator.off('frame', captureFrame);
        if (!frameGrabWasRunning) emulator.stop();
        if (cancel) { frameGrabFrames = []; frameGrabStatus = 'Cancelled'; return; }
        if (frameGrabFrames.length === 0) { frameGrabStatus = 'No frames captured'; return; }

        // Export as PNG(s)
        if (frameGrabFrames.length === 1) {
            const base64 = frameGrabFrames[0].dataUrl.split(',')[1];
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
            downloadBlob(bytes, 'frame_0000.png', 'image/png');
            frameGrabStatus = 'Exported 1 frame as PNG';
        } else {
            // Multiple frames: download first frame (full ZIP requires pako)
            const base64 = frameGrabFrames[0].dataUrl.split(',')[1];
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
            downloadBlob(bytes, 'frame_0000.png', 'image/png');
            frameGrabStatus = `Captured ${frameGrabFrames.length} frames (first exported as PNG)`;
        }
        frameGrabFrames = [];
    }

    // PSG recording
    function startPsgRecording() {
        const s = emulator.spectrum;
        if (!s?.ay) return;
        s.ay.startLogging();
        psgRecording = true;
        psgStatus = 'Recording: 0 frames';
        psgUpdateInterval = setInterval(() => {
            if (psgRecording && s.ay.loggingEnabled) {
                const frames = s.ay.logFrameNumber;
                const writes = s.ay.registerLog?.length || 0;
                psgStatus = `Recording: ${frames} frames, ${writes} writes (${(frames / 50).toFixed(1)}s)`;
            }
        }, 200);
    }

    function stopPsgRecording(cancel: boolean) {
        const s = emulator.spectrum;
        if (!s?.ay) return;
        s.ay.stopLogging();
        psgRecording = false;
        if (psgUpdateInterval) { clearInterval(psgUpdateInterval); psgUpdateInterval = null; }
        if (cancel) { s.ay.clearLog(); psgStatus = 'Cancelled'; return; }
        const psgData = s.ay.exportPSG(psgChangedOnly);
        if (!psgData || psgData.length <= 16) { psgStatus = 'No AY data recorded'; s.ay.clearLog(); return; }
        downloadBlob(psgData, `music_${s.ay.logFrameNumber}f.psg`);
        psgStatus = `Exported: ${psgData.length} bytes`;
        s.ay.clearLog();
    }

    // RZX recording
    function startRzxRecording() {
        if (emulator.rzxStartRecording()) {
            rzxRecording = true;
            rzxRecStatus = 'Recording...';
        }
    }

    function stopRzxRecording() {
        const result = emulator.rzxStopRecording();
        rzxRecording = false;
        if (result && (result as any).frames > 0) {
            const data = emulator.rzxSaveRecording();
            if (data) downloadBlob(data, 'recording.rzx');
            rzxRecStatus = `Exported: ${(result as any).frames} frames`;
        } else {
            rzxRecStatus = 'No frames recorded';
        }
    }

    function cancelRzxRecording() {
        emulator.rzxCancelRecording();
        rzxRecording = false;
        rzxRecStatus = 'Cancelled';
    }

    // ========== TESTS ==========
    let testsStatus = $state('Tests run in separate browser pages');

    // ========== Lifecycle ==========
    let rzxStatusInterval: ReturnType<typeof setInterval> | null = null;

    onMount(() => {
        rzxStatusInterval = setInterval(() => {
            if (emulator.isRZXRecording()) {
                const frames = emulator.getRZXRecordedFrameCount();
                rzxRecStatus = emulator.isRunning() ? `Recording... ${frames} frames` : `Recording (paused) ${frames} frames`;
            }
        }, 500);
    });

    onDestroy(() => {
        if (psgUpdateInterval) clearInterval(psgUpdateInterval);
        if (rzxStatusInterval) clearInterval(rzxStatusInterval);
        if (frameGrabActive) { emulator.off('frame', captureFrame); }
    });
</script>

<div class="tab-content" id="tab-tools">
    <div class="tools-subtab-bar">
        <button class="tools-subtab-btn" class:active={activeSubtab === 'explorer'} onclick={() => switchSubtab('explorer')}>Explorer</button>
        <button class="tools-subtab-btn" class:active={activeSubtab === 'compare'} onclick={() => switchSubtab('compare')}>Compare</button>
        <button class="tools-subtab-btn" class:active={activeSubtab === 'tests'} onclick={() => switchSubtab('tests')}>Tests</button>
        <button class="tools-subtab-btn" class:active={activeSubtab === 'export'} onclick={() => switchSubtab('export')}>Export</button>
    </div>

    <!-- Explorer Sub-tab -->
    <div class="tools-subtab-content" class:active={activeSubtab === 'explorer'}>
    <div class="explorer-container">
        <div class="explorer-controls">
            <input type="file" accept=".tap,.tzx,.sna,.z80,.szx,.rzx,.trd,.scl,.dsk,.zip,.scr,.bsc,.fnt,.chr" style="display:none" bind:this={explorerFileInput} onchange={explorerLoadFile}>
            <button class="explorer-btn primary" onclick={() => explorerFileInput.click()}>Load File</button>
            <span class="explorer-file-info">{explorerFileName}</span>
            <span class="explorer-file-size">{explorerFileSizeText}</span>
        </div>

        <div class="explorer-subtabs">
            <button class="explorer-subtab" class:active={explorerSubtab === 'info'} onclick={() => explorerSubtab = 'info'}>File Info</button>
            <button class="explorer-subtab" class:active={explorerSubtab === 'basic'} onclick={() => explorerSubtab = 'basic'}>BASIC</button>
            <button class="explorer-subtab" class:active={explorerSubtab === 'disasm'} onclick={() => explorerSubtab = 'disasm'}>Disasm</button>
            <button class="explorer-subtab" class:active={explorerSubtab === 'hexdump'} onclick={() => explorerSubtab = 'hexdump'}>Hex Dump</button>
        </div>

        <div class="explorer-content">
            {#if explorerSubtab === 'info'}
                <div class="explorer-subtab-content active">
                    <div class="explorer-info-row">
                        <div class="explorer-output" style="white-space:normal;width:50%;min-width:300px">{@html explorerInfoHtml}</div>
                        {#if explorerPreviewVisible}
                            <div class="explorer-preview">
                                <canvas bind:this={previewCanvas} width="256" height="192"></canvas>
                                <div class="explorer-preview-label">{explorerPreviewLabel}</div>
                            </div>
                        {/if}
                    </div>
                </div>
            {:else if explorerSubtab === 'basic'}
                <div class="explorer-subtab-content active">
                    <div class="explorer-controls" style="margin-bottom:10px">
                        <span class="explorer-label">Source:</span>
                        <select class="explorer-select" bind:value={explorerBasicSourceValue}>
                            <option value="">Select source...</option>
                            {#each explorerBasicSources as src}
                                <option value={src.value}>{src.label}</option>
                            {/each}
                        </select>
                        <button class="explorer-btn" onclick={explorerRenderBASIC}>Decode</button>
                    </div>
                    <div class="explorer-output">{@html explorerBasicHtml}</div>
                </div>
            {:else if explorerSubtab === 'disasm'}
                <div class="explorer-subtab-content active">
                    <div class="explorer-controls" style="margin-bottom:10px">
                        <span class="explorer-label">Source:</span>
                        <select class="explorer-select" bind:value={explorerDisasmSourceValue} onchange={onDisasmSourceChange}>
                            <option value="">Select source...</option>
                            {#each explorerDisasmSources as src}
                                <option value={src.value}>{src.label}</option>
                            {/each}
                        </select>
                        <span class="explorer-label">Address:</span>
                        <input type="text" class="explorer-input addr" bind:value={explorerDisasmAddr} maxlength="4">
                        <span class="explorer-label">Length:</span>
                        <input type="number" class="explorer-input len" bind:value={explorerDisasmLen} min="1" max="65536">
                        <button class="explorer-btn" onclick={explorerRenderDisasm}>Disassemble</button>
                    </div>
                    <div class="explorer-output" style="white-space:pre">{@html explorerDisasmHtml}</div>
                </div>
            {:else if explorerSubtab === 'hexdump'}
                <div class="explorer-subtab-content active">
                    <div class="explorer-controls" style="margin-bottom:10px">
                        <span class="explorer-label">Source:</span>
                        <select class="explorer-select" bind:value={explorerHexSourceValue}>
                            <option value="">Whole file</option>
                            {#each explorerHexSources as src}
                                <option value={src.value}>{src.label}</option>
                            {/each}
                        </select>
                        <span class="explorer-label">Address:</span>
                        <input type="text" class="explorer-input addr" bind:value={explorerHexAddr} maxlength="4">
                        <span class="explorer-label">Length:</span>
                        <input type="number" class="explorer-input len" bind:value={explorerHexLen} min="16" max="65536">
                        <button class="explorer-btn" onclick={explorerRenderHexDump}>View</button>
                    </div>
                    <div class="explorer-output" style="white-space:pre">{@html explorerHexHtml}</div>
                </div>
            {/if}
        </div>
    </div>
    </div>

    <!-- Compare Sub-tab -->
    <div class="tools-subtab-content" class:active={activeSubtab === 'compare'}>
    <div class="compare-container" style="padding:10px;display:flex;flex-direction:column;gap:15px;max-width:1200px">
        <div class="compare-mode" style="display:flex;gap:15px;flex-wrap:wrap">
            <label style="display:flex;align-items:center;gap:5px;cursor:pointer">
                <input type="radio" bind:group={compareMode} value="sna-sna"> Snapshots
            </label>
            <label style="display:flex;align-items:center;gap:5px;cursor:pointer">
                <input type="radio" bind:group={compareMode} value="bin-bin"> Binaries
            </label>
            <label style="display:flex;align-items:center;gap:5px;cursor:pointer">
                <input type="radio" bind:group={compareMode} value="sna-emu"> Snapshot vs Emulator
            </label>
        </div>

        <div class="compare-inputs" style="display:flex;gap:15px;flex-wrap:wrap">
            <div style="flex:1;min-width:200px">
                <label for="compare-file-a" style="display:block;margin-bottom:5px;color:var(--text-secondary);font-size:11px">File A:</label>
                <input id="compare-file-a" type="file" bind:this={compareFileA} accept=".sna,.z80,.szx,.rzx,.bin,.rom,.dat,*" style="width:100%">
            </div>
            {#if compareMode !== 'sna-emu'}
                <div style="flex:1;min-width:200px">
                    <label for="compare-file-b" style="display:block;margin-bottom:5px;color:var(--text-secondary);font-size:11px">File B:</label>
                    <input id="compare-file-b" type="file" bind:this={compareFileB} accept=".sna,.z80,.szx,.rzx,.bin,.rom,.dat,*" style="width:100%">
                </div>
            {/if}
        </div>

        <div style="display:flex;gap:15px;flex-wrap:wrap;align-items:center">
            <button style="padding:8px 20px;background:var(--accent);color:var(--bg-primary);border:none;border-radius:4px;cursor:pointer;font-size:12px" onclick={runCompare}>Compare</button>
            <label style="display:flex;align-items:center;gap:5px;font-size:12px">
                <input type="checkbox" bind:checked={compareShowEqual}> Show equal values
            </label>
            <label style="display:flex;align-items:center;gap:5px;font-size:12px">
                <input type="checkbox" bind:checked={compareHexDump}> Hex dump
            </label>
            <label style="display:flex;align-items:center;gap:5px;font-size:12px" title="Exclude screen area">
                <input type="checkbox" bind:checked={compareExcludeScreen}> Exclude screen
            </label>
        </div>

        <div class="compare-results" style="flex:1;overflow:auto">
            {#if compareStatus}
                <div style="margin-bottom:8px;color:var(--yellow);font-size:12px">{compareStatus}</div>
            {/if}
            {#if compareHeaderHtml}
                <div style="margin-bottom:15px;background:var(--bg-secondary);padding:10px;border-radius:4px">{@html compareHeaderHtml}</div>
            {/if}
            {#if compareDataHtml}
                <div style="font-family:monospace;font-size:12px;background:var(--bg-secondary);padding:10px;border-radius:4px;max-height:400px;overflow:auto">{@html compareDataHtml}</div>
            {/if}
            {#if compareShowNoResults}
                <div style="text-align:center;padding:40px;color:var(--green)">
                    <span style="font-size:24px">&#10003;</span><br>Files are identical
                </div>
            {/if}
        </div>
    </div>
    </div>

    <!-- Tests Sub-tab -->
    <div class="tools-subtab-content" class:active={activeSubtab === 'tests'}>
    <div class="tests-container">
        <div class="tests-controls">
            <a href="system-test.html" class="test-link" title="Run system tests">System Tests</a>
            <a href="fuse-test.html" class="test-link" title="Run FUSE Z80 CPU tests">FUSE Tests</a>
            <a href="asm-test.html" class="test-link" title="Run assembler tests">Assembler Tests</a>
            <a href="ula-diag.html" class="test-link" title="ULA timing diagnostics">ULA Diag</a>
            <span class="tests-status">{testsStatus}</span>
        </div>
        <div class="tests-note">Tests run in separate browser pages. Click the links above to open them.</div>
    </div>
    </div>

    <!-- Export Sub-tab -->
    <div class="tools-subtab-content" class:active={activeSubtab === 'export'}>
    <div class="settings-tab-content">
        <div class="settings-section full-width">
            <div class="settings-row">
                <button onclick={exportScreenshot} disabled={frameGrabActive}>Export</button>
            </div>
            <div class="settings-row">
                <label for="export-format">Format:</label>
                <select id="export-format" bind:value={exportFormat}>
                    <option value="png">PNG</option>
                    <option value="scr">SCR (screen only)</option>
                    <option value="bsc">BSC (with border)</option>
                    <option value="zip">ZIP (PNG sequence)</option>
                    <option value="gif">Animated GIF</option>
                    <option value="sca">SCA (animation)</option>
                </select>
                <label for="export-max-frames" style="min-width:auto;margin-left:10px;margin-right:-6px">Max:</label>
                <input id="export-max-frames" type="number" bind:value={exportMaxFrames} min="0" style="width:50px">
                <span style="color:var(--text-secondary);font-size:11px">(0=inf)</span>
            </div>
            <div class="settings-row">
                <label for="export-size">Size:</label>
                <select id="export-size" bind:value={exportSize}>
                    <option value="screen">Screen only (256x192)</option>
                    <option value="normal">Normal border</option>
                    <option value="full">Full border</option>
                    <option value="sprite-pixels">Sprite (pixels)</option>
                    <option value="sprite-cells">Sprite (cells 8x8)</option>
                </select>
            </div>
            {#if showSpriteRegion}
                <div class="settings-row sprite-region-row">
                    <span class="sprite-input-group"><label for="export-sprite-x">X:</label><input id="export-sprite-x" type="number" bind:value={exportSpriteX} min="0" max="255"></span>
                    <span class="sprite-input-group"><label for="export-sprite-y">Y:</label><input id="export-sprite-y" type="number" bind:value={exportSpriteY} min="0" max="191"></span>
                    <span class="sprite-input-group"><label for="export-sprite-w">W:</label><input id="export-sprite-w" type="number" bind:value={exportSpriteW} min="1" max="256"></span>
                    <span class="sprite-input-group"><label for="export-sprite-h">H:</label><input id="export-sprite-h" type="number" bind:value={exportSpriteH} min="1" max="192"></span>
                </div>
            {/if}
            <div class="settings-row frame-export-controls">
                <button class="frame-grab-btn" onclick={startFrameGrab} disabled={frameGrabActive}>Start</button>
                <button class="frame-grab-btn" onclick={() => stopFrameGrab(false)} disabled={!frameGrabActive}>Stop</button>
                <button class="frame-grab-btn" onclick={() => stopFrameGrab(true)} disabled={!frameGrabActive}>Cancel</button>
            </div>
            <div class="frame-grab-status">{frameGrabStatus}</div>

            <div style="border-top:1px solid var(--text-secondary);margin:12px 0 8px 0;opacity:0.3"></div>
            <div class="settings-row" style="margin-bottom:4px">
                <span style="font-weight:bold;font-size:11px;color:var(--text-secondary)">AY Capture (PSG)</span>
            </div>
            <div class="settings-row">
                <label class="checkbox-label" title="Only record registers that changed">
                    <input type="checkbox" bind:checked={psgChangedOnly}> Changed only
                </label>
            </div>
            <div class="settings-row frame-export-controls">
                <button class="frame-grab-btn" onclick={startPsgRecording} disabled={psgRecording}>Record</button>
                <button class="frame-grab-btn" onclick={() => stopPsgRecording(false)} disabled={!psgRecording}>Export</button>
                <button class="frame-grab-btn" onclick={() => stopPsgRecording(true)} disabled={!psgRecording}>Cancel</button>
            </div>
            <div class="frame-grab-status">{psgStatus}</div>

            <div style="border-top:1px solid var(--text-secondary);margin:12px 0 8px 0;opacity:0.3"></div>
            <div class="settings-row" style="margin-bottom:4px">
                <span style="font-weight:bold;font-size:11px;color:var(--text-secondary)">RZX Recording</span>
            </div>
            <div class="settings-row frame-export-controls">
                <button class="frame-grab-btn" onclick={startRzxRecording} disabled={rzxRecording}>Record</button>
                <button class="frame-grab-btn" onclick={stopRzxRecording} disabled={!rzxRecording}>Export</button>
                <button class="frame-grab-btn" onclick={cancelRzxRecording} disabled={!rzxRecording}>Cancel</button>
            </div>
            <div class="frame-grab-status">{rzxRecStatus}</div>

            <div style="border-top:1px solid var(--text-secondary);margin:12px 0 8px 0;opacity:0.3"></div>
            <div class="settings-row">
                <label class="checkbox-label" title="Detect unrolled loops in ASM export">
                    <input type="checkbox" bind:checked={exportDedupLoops}> Dedup ASM loops
                </label>
            </div>
        </div>
    </div>
    </div>

</div>

<style>
    /* Tools Tab */
    #tab-tools {
        padding-top: 0;
    }
    .tools-subtab-bar {
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
    .tools-subtab-btn {
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
    .tools-subtab-btn:hover {
        background: var(--bg-button);
        color: var(--text-primary);
    }
    .tools-subtab-btn.active {
        background: var(--bg-secondary);
        color: var(--cyan);
        border-bottom: 1px solid var(--bg-secondary);
    }
    .tools-subtab-content {
        display: none;
    }
    .tools-subtab-content.active {
        display: block;
    }

    /* Tests */
    .tests-container {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 10px;
    }
    .tests-controls {
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
    }
    .tests-note {
        font-size: 11px;
        color: var(--text-secondary);
        font-style: italic;
        margin: 4px 0;
    }
    .tests-status {
        color: var(--text-secondary);
        font-size: 11px;
        margin-left: auto;
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

    /* Explorer */
    .explorer-container {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 10px;
        height: calc(100vh - 200px);
        min-height: 500px;
        max-height: 875px;
        overflow: hidden;
    }
    @media (min-width: 1400px) {
        .explorer-container { max-height: 770px; }
    }
    .explorer-controls {
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
    }
    .explorer-subtab:focus,
    .explorer-btn:focus,
    .explorer-select:focus,
    .explorer-input:focus { outline: none; }
    .explorer-btn {
        padding: 6px 12px;
        border: none;
        border-radius: 4px;
        background: var(--bg-button);
        color: var(--text-primary);
        cursor: pointer;
        font-size: 12px;
    }
    .explorer-btn:hover:not(:disabled) { background: var(--bg-tertiary); }
    .explorer-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .explorer-btn.primary { background: var(--cyan); color: var(--bg-primary); }
    .explorer-btn.primary:hover:not(:disabled) { background: #5dade2; }
    :global(.explorer-file-info) { color: var(--cyan); font-size: 12px; }
    :global(.explorer-file-size) { color: var(--text-secondary); font-size: 11px; }
    .explorer-subtabs {
        display: flex;
        gap: 0;
        border-bottom: 1px solid var(--border);
    }
    .explorer-subtab {
        padding: 8px 16px;
        background: transparent;
        border: none;
        border-bottom: 2px solid transparent;
        color: var(--text-secondary);
        cursor: pointer;
        font-size: 12px;
    }
    .explorer-subtab:hover { color: var(--text-primary); background: var(--bg-tertiary); }
    .explorer-subtab.active { color: var(--cyan); border-bottom-color: var(--cyan); }
    .explorer-content {
        flex: 1;
        overflow: auto;
        display: flex;
        flex-direction: column;
    }
    .explorer-subtab-content {
        flex: 1;
        overflow: auto;
    }
    .explorer-subtab-content.active {
        display: flex;
        flex-direction: column;
    }
    .explorer-output {
        font-family: 'Consolas', 'Monaco', monospace;
        font-size: 12px;
        white-space: pre-wrap;
        color: var(--text-primary);
        flex: 1;
        overflow: auto;
        background: var(--bg-primary);
        border: 1px solid var(--bg-button);
        border-radius: 4px;
        padding: 6px 10px;
        max-height: 750px;
        user-select: text;
        cursor: text;
    }
    @media (min-width: 1400px) {
        .explorer-output { max-height: 650px; }
    }
    :global(.explorer-empty) {
        color: var(--text-secondary);
        font-style: italic;
        padding: 20px;
        text-align: center;
    }
    .explorer-label {
        font-size: 11px;
        color: var(--text-secondary);
        background: transparent;
        border: none;
        outline: none;
    }
    .explorer-select {
        font-size: 11px;
        padding: 4px 8px;
        min-width: 150px;
        background: var(--bg-secondary);
        border: 1px solid var(--bg-button);
        border-radius: 4px;
        color: var(--text-primary);
    }
    .explorer-input {
        font-size: 11px;
        padding: 4px 8px;
        background: var(--bg-secondary);
        border: 1px solid var(--bg-button);
        border-radius: 4px;
        color: var(--text-primary);
        font-family: 'Consolas', 'Monaco', monospace;
    }
    .explorer-input.addr { width: 50px; text-transform: uppercase; }
    .explorer-input.len { width: 70px; }
    .explorer-info-row {
        display: flex;
        gap: 15px;
        flex: 1;
        overflow: hidden;
    }
    .explorer-preview {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 10px;
        background: var(--bg-primary);
        border: 1px solid var(--bg-button);
        border-radius: 4px;
    }
    .explorer-preview canvas { image-rendering: pixelated; image-rendering: crisp-edges; }
    .explorer-preview-label {
        margin-top: 6px;
        font-size: 10px;
        color: var(--text-secondary);
        text-transform: uppercase;
    }

    /* Explorer file info styles */
    :global(.explorer-info-section) { margin-bottom: 10px; }
    :global(.explorer-info-header) { color: var(--cyan); font-size: 11px; text-transform: uppercase; margin-bottom: 2px; letter-spacing: 0.5px; }
    :global(.explorer-info-table) { width: auto; max-width: 400px; border-collapse: collapse; font-size: 11px; font-family: 'Consolas', 'Monaco', monospace; }
    :global(.explorer-info-table th), :global(.explorer-info-table td) { padding: 3px 8px; text-align: left; border-bottom: 1px solid var(--bg-button); }
    :global(.explorer-info-table th) { color: var(--text-secondary); font-weight: normal; width: 120px; }
    :global(.explorer-info-table td) { color: var(--text-primary); }
    :global(.explorer-block-list) { display: flex; flex-direction: column; gap: 6px; }
    :global(.explorer-block) { border-left: 3px solid var(--cyan); padding: 6px 10px; background: var(--bg-secondary); font-size: 11px; font-family: 'Consolas', 'Monaco', monospace; }
    :global(.explorer-block.basic-block) { border-left-color: #2ecc71; }
    :global(.explorer-block.code-block) { border-left-color: var(--cyan); }
    :global(.explorer-block.array-block) { border-left-color: #9b59b6; }
    :global(.explorer-block.data-block) { border-left-color: #7f8c8d; background: var(--bg-tertiary); }
    :global(.explorer-block-header) { color: var(--yellow); font-weight: bold; }
    :global(.explorer-block-meta) { color: var(--text-secondary); }
    :global(.explorer-block-meta .checksum-ok) { color: #2ecc71; }
    :global(.explorer-block-meta .checksum-bad) { color: #e74c3c; }
    :global(.explorer-block-details) { color: var(--text-primary); line-height: 1.4; }
    :global(.explorer-block-details .label) { color: var(--text-secondary); }
    :global(.explorer-block-details .value) { color: var(--cyan); }
    :global(.explorer-block-details .filename) { color: #2ecc71; }
    :global(.explorer-file-list) { display: table; font-family: 'Consolas', 'Monaco', monospace; font-size: 12px; width: 100%; max-width: 500px; }
    :global(.explorer-file-entry) { display: table-row; }
    :global(.explorer-file-entry:hover) { background: var(--bg-tertiary); }
    :global(.explorer-file-entry > span) { display: table-cell; padding: 3px 8px; border-bottom: 1px solid var(--bg-tertiary); }
    :global(.explorer-file-num) { color: var(--text-secondary); text-align: right; width: 30px; }
    :global(.explorer-file-type) { color: var(--yellow); width: 20px; }
    :global(.explorer-file-name) { color: #2ecc71; }
    :global(.explorer-file-addr) { color: var(--cyan); text-align: right; }
    :global(.explorer-basic-line) { font-family: 'Consolas', 'Monaco', monospace; font-size: 12px; user-select: text; cursor: text; }
    :global(.explorer-basic-linenum) { color: var(--yellow); display: inline-block; width: 50px; }
    :global(.explorer-basic-keyword) { color: var(--cyan); }
    :global(.explorer-basic-string) { color: #2ecc71; }
    :global(.explorer-basic-number) { color: #e67e22; }

    /* Disasm/Hex syntax highlighting */
    :global(.da) { color: var(--yellow); }
    :global(.db) { color: var(--text-secondary); }
    :global(.dm) { color: var(--cyan); }
    :global(.dl) { color: #2ecc71; }
    :global(.ha) { color: var(--yellow); }
    :global(.hb) { color: var(--text-primary); }
    :global(.hc) { color: var(--cyan); }
</style>

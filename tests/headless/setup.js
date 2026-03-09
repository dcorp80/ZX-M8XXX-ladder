/**
 * Headless test helpers — create spectrum instances, load files, run frames,
 * compare screenshots. All synchronous (no DOM, no yields).
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { Spectrum } from '../../js/core/spectrum.js';
import { getMachineProfile, is128kCompat } from '../../js/core/machines.js';
import { TapeTrapHandler, ZipLoader } from '../../js/core/loaders.js';

// Project root (where tests.json, roms/, tests/ live)
const ROOT = resolve(import.meta.dirname, '../..');

// ROM cache — loaded once per process
const romCache = {};

function loadRomFile(filename) {
    if (romCache[filename]) return romCache[filename];
    const romPath = resolve(ROOT, 'roms', filename);
    if (!existsSync(romPath)) return null;
    const buf = readFileSync(romPath);
    romCache[filename] = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    return romCache[filename];
}

/**
 * Load ROMs into a spectrum instance for the given machine type.
 * Mirrors rom-manager.js:loadRomsForMachineType but reads from filesystem.
 */
export function loadRomsForMachineType(spectrum, machineType) {
    const profile = getMachineProfile(machineType);
    const rom = loadRomFile(profile.romFile);
    if (!rom) throw new Error(`ROM not found: roms/${profile.romFile}`);

    for (let bank = 0; bank < profile.romBanks; bank++) {
        spectrum.memory.loadRom(rom.slice(bank * 16384, (bank + 1) * 16384), bank);
    }

    // Load TR-DOS ROM if needed
    if (!profile.trdosInRom && (profile.betaDiskDefault || spectrum.betaDiskEnabled)) {
        const trdos = loadRomFile('trdos.rom');
        if (trdos) {
            spectrum.memory.loadTrdosRom(trdos);
        }
    }
    if (spectrum.trdosTrap) spectrum.trdosTrap.updateTrdosRomFlag();
    spectrum.updateBetaDiskPagingFlag();
    spectrum.romLoaded = true;
}

// Map test machine type names to internal spectrum machine types
const MACHINE_MAP = {
    '48k': '48k',
    '128k': '128k',
    '+2': '+2', 'plus2': '+2',
    '+2a': '+2a', 'plus2a': '+2a',
    '+3': '+3', 'plus3': '+3',
    'pentagon': 'pentagon', 'p128': 'pentagon',
    'pentagon1024': 'pentagon1024',
    'scorpion': 'scorpion'
};

export function mapMachineType(type) {
    return MACHINE_MAP[type?.toLowerCase()] || '48k';
}

/**
 * Create a fully initialized Spectrum instance with ROMs loaded.
 */
export function createSpectrum(machineType = '48k') {
    const mapped = mapMachineType(machineType);
    const spectrum = new Spectrum({ machineType: mapped });
    loadRomsForMachineType(spectrum, mapped);
    spectrum.reset();
    return spectrum;
}

/**
 * Run N frames in a tight loop. Optional per-frame callback.
 * @returns {number} Total T-states executed
 */
export function runFrames(spectrum, count, perFrameCallback) {
    let totalTstates = 0;
    for (let i = 0; i < count; i++) {
        if (perFrameCallback) perFrameCallback();
        totalTstates += spectrum.runFrame();
    }
    return totalTstates;
}

/**
 * Pixel-by-pixel RGBA comparison.
 * Mirrors test-runner.js:compareScreens.
 */
export function compareScreens(actual, expected, tolerance = 0) {
    const width = Math.min(actual.width, expected.width);
    const height = Math.min(actual.height, expected.height);
    let diffCount = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const aIdx = (y * actual.width + x) * 4;
            const eIdx = (y * expected.width + x) * 4;

            const dr = Math.abs(actual.data[aIdx] - expected.data[eIdx]);
            const dg = Math.abs(actual.data[aIdx + 1] - expected.data[eIdx + 1]);
            const db = Math.abs(actual.data[aIdx + 2] - expected.data[eIdx + 2]);

            if (dr > tolerance || dg > tolerance || db > tolerance) {
                diffCount++;
            }
        }
    }

    const totalPixels = width * height;
    return {
        matches: diffCount === 0,
        diffCount,
        diffPercent: (diffCount / totalPixels * 100).toFixed(2),
        width,
        height
    };
}

// ---- Key simulation helpers ----

const KEY_MAP = {
    'ENTER': 'Enter', 'SPACE': ' ', 'SHIFT': 'Shift', 'CTRL': 'Control',
    'UP': 'ArrowUp', 'DOWN': 'ArrowDown', 'LEFT': 'ArrowLeft', 'RIGHT': 'ArrowRight',
    'BREAK': 'Escape', 'CAPS': 'CapsLock'
};

function mapKey(key) {
    const upper = key.toUpperCase();
    if (KEY_MAP[upper]) return KEY_MAP[upper];
    return key.toLowerCase();
}

/**
 * Press keys as specified by step.keys string.
 * Mirrors test-runner.js:pressKeys.
 */
export function pressKeys(spectrum, keyString) {
    const parts = keyString.split(',');
    for (const part of parts) {
        const trimmed = part.trim();

        // Delay: "500ms"
        const delayMatch = trimmed.match(/^(\d+)ms$/);
        if (delayMatch) {
            const ms = parseInt(delayMatch[1]);
            const frames = Math.ceil(ms / 20);
            runFrames(spectrum, frames);
            continue;
        }

        // Simultaneous keys: "a+b"
        const keys = trimmed.split('+').map(k => mapKey(k.trim()));

        for (const key of keys) spectrum.ula.keyDown(key);
        runFrames(spectrum, 5);
        for (const key of keys) spectrum.ula.keyUp(key);
        runFrames(spectrum, 1);
    }
}

// ---- File loading helpers ----

function readTestFile(filePath) {
    const fullPath = resolve(ROOT, filePath);
    return new Uint8Array(readFileSync(fullPath));
}

function pressKey(spectrum, key, holdFrames = 25, releaseFrames = 15) {
    spectrum.ula.keyDown(key);
    runFrames(spectrum, holdFrames);
    spectrum.ula.keyUp(key);
    runFrames(spectrum, releaseFrames);
}

function pressWithSymbol(spectrum, key, holdFrames = 25, releaseFrames = 15) {
    spectrum.ula.keyDown('Alt');
    spectrum.ula.keyDown(key);
    runFrames(spectrum, holdFrames);
    spectrum.ula.keyUp(key);
    spectrum.ula.keyUp('Alt');
    runFrames(spectrum, releaseFrames);
}

function pressWithCaps(spectrum, key, holdFrames = 15, releaseFrames = 10) {
    spectrum.ula.keyDown('Control');
    spectrum.ula.keyDown(key);
    runFrames(spectrum, holdFrames);
    spectrum.ula.keyUp(key);
    spectrum.ula.keyUp('Control');
    runFrames(spectrum, releaseFrames);
    spectrum.ula.keyboardState.fill(0xFF);
}

/**
 * Simulate LOAD "" command for 48K mode.
 */
function simulateLoadCommand48k(spectrum) {
    const ula = spectrum.ula;
    const mem = spectrum.memory;

    // Wait for ROM init
    ula.keyboardState.fill(0xFF);
    runFrames(spectrum, 200, () => ula.keyboardState.fill(0xFF));

    // Check ROM initialization
    const elineAddr = mem.read(0x5C59) | (mem.read(0x5C5A) << 8);
    if (elineAddr < 0x5B00 || elineAddr >= 0x6000) {
        // Run more frames
        runFrames(spectrum, 100, () => ula.keyboardState.fill(0xFF));
    }

    runFrames(spectrum, 50);
    ula.keyboardState.fill(0xFF);

    // J = LOAD
    pressKey(spectrum, 'j');
    // Symbol + P = " (twice)
    pressWithSymbol(spectrum, 'p');
    pressWithSymbol(spectrum, 'p');
    // Enter
    ula.keyDown('Enter');
    runFrames(spectrum, 5);
    ula.keyUp('Enter');
    ula.keyboardState.fill(0xFF);

    // Clear ROM keyboard variables
    for (let i = 0x5C00; i <= 0x5C08; i++) mem.write(i, 0xFF);

    // Run frames with keyboard cleared for loading
    runFrames(spectrum, 200, () => ula.keyboardState.fill(0xFF));
}

/**
 * Simulate LOAD "" command for 128K mode.
 */
function simulateLoadCommand128k(spectrum) {
    const ula = spectrum.ula;
    const mem = spectrum.memory;

    ula.keyboardState.fill(0xFF);
    runFrames(spectrum, 200, () => ula.keyboardState.fill(0xFF));

    // Press "1" for 128 BASIC
    ula.keyDown('1');
    runFrames(spectrum, 15);
    ula.keyUp('1');
    ula.keyboardState.fill(0xFF);
    runFrames(spectrum, 100, () => ula.keyboardState.fill(0xFF));

    // J = LOAD
    ula.keyDown('j');
    runFrames(spectrum, 15);
    ula.keyUp('j');
    ula.keyboardState.fill(0xFF);
    runFrames(spectrum, 10);

    // Symbol + P = " (twice)
    ula.keyDown('Alt');
    ula.keyDown('p');
    runFrames(spectrum, 15);
    ula.keyUp('p');
    ula.keyUp('Alt');
    ula.keyboardState.fill(0xFF);
    runFrames(spectrum, 10);

    ula.keyDown('Alt');
    ula.keyDown('p');
    runFrames(spectrum, 15);
    ula.keyUp('p');
    ula.keyUp('Alt');
    ula.keyboardState.fill(0xFF);
    runFrames(spectrum, 10);

    // Enter
    ula.keyDown('Enter');
    runFrames(spectrum, 5);
    ula.keyUp('Enter');
    ula.keyboardState.fill(0xFF);

    for (let i = 0x5C00; i <= 0x5C08; i++) mem.write(i, 0xFF);

    runFrames(spectrum, 300, () => {
        ula.keyboardState.fill(0xFF);
        for (let j = 0x5C00; j <= 0x5C08; j++) mem.write(j, 0xFF);
    });
}

/**
 * Simulate Amstrad menu selection for +2/+2A/+3.
 */
function simulateLoadCommandAms(spectrum) {
    const ula = spectrum.ula;
    ula.keyboardState.fill(0xFF);
    runFrames(spectrum, 150, () => ula.keyboardState.fill(0xFF));

    // Press Enter for Tape Loader
    ula.keyDown('Enter');
    runFrames(spectrum, 15);
    ula.keyUp('Enter');
    ula.keyboardState.fill(0xFF);

    runFrames(spectrum, 300, () => ula.keyboardState.fill(0xFF));
}

/**
 * Inject LOAD "" command — dispatches by machine type.
 */
function injectLoadCommand(spectrum) {
    const machType = spectrum.machineType;
    const isAmsMenu = machType === '+2' || machType === '+2a' || machType === '+3';
    const is128K = is128kCompat(machType);

    if (isAmsMenu) {
        simulateLoadCommandAms(spectrum);
    } else if (is128K) {
        simulateLoadCommand128k(spectrum);
    } else {
        simulateLoadCommand48k(spectrum);
    }
}

/**
 * Boot TR-DOS and run a disk file.
 */
function injectDiskRunCommand(spectrum, diskRun) {
    const ula = spectrum.ula;

    if (!spectrum.bootTrdos()) {
        throw new Error('Cannot boot TR-DOS');
    }

    runFrames(spectrum, 200, () => ula.keyboardState.fill(0xFF));

    // R = RUN keyword in TR-DOS
    pressKey(spectrum, 'r', 15, 10);
    ula.keyboardState.fill(0xFF);

    if (diskRun && diskRun.toLowerCase() !== 'boot') {
        // Space
        pressKey(spectrum, ' ', 15, 10);
        ula.keyboardState.fill(0xFF);

        // Opening quote
        pressWithSymbol(spectrum, 'p', 15, 10);
        ula.keyboardState.fill(0xFF);

        // Type filename
        for (const ch of diskRun) {
            const lower = ch.toLowerCase();
            if (lower >= 'a' && lower <= 'z') {
                if (ch >= 'A' && ch <= 'Z') {
                    pressWithCaps(spectrum, lower, 15, 10);
                } else {
                    pressKey(spectrum, lower, 15, 10);
                    ula.keyboardState.fill(0xFF);
                }
            } else if (lower >= '0' && lower <= '9') {
                pressKey(spectrum, lower, 15, 10);
                ula.keyboardState.fill(0xFF);
            } else if (ch === '.') {
                pressWithSymbol(spectrum, 'm', 15, 10);
                ula.keyboardState.fill(0xFF);
            } else if (ch === ' ') {
                pressKey(spectrum, ' ', 15, 10);
                ula.keyboardState.fill(0xFF);
            } else if (ch === '=') {
                pressWithSymbol(spectrum, 'l', 15, 10);
                ula.keyboardState.fill(0xFF);
            }
        }

        // Closing quote
        pressWithSymbol(spectrum, 'p', 15, 10);
        ula.keyboardState.fill(0xFF);
    }

    // Enter
    pressKey(spectrum, 'Enter', 15, 10);
    ula.keyboardState.fill(0xFF);

    runFrames(spectrum, 300, () => ula.keyboardState.fill(0xFF));
}

/**
 * Boot +3 from DSK disk image.
 */
function bootPlus3Disk(spectrum) {
    const ula = spectrum.ula;

    if (!spectrum.fdc) {
        throw new Error('Cannot boot +3 disk: no FDC');
    }

    const disk = spectrum.fdc.drives[0].disk;
    spectrum.reset();
    if (disk) spectrum.fdc.drives[0].disk = disk;

    ula.keyboardState.fill(0xFF);
    runFrames(spectrum, 150, () => ula.keyboardState.fill(0xFF));

    // Press Enter for Loader
    ula.keyDown('Enter');
    runFrames(spectrum, 15);
    ula.keyUp('Enter');
    ula.keyboardState.fill(0xFF);

    runFrames(spectrum, 500, () => ula.keyboardState.fill(0xFF));
}

/**
 * Load extracted file from ZIP (recursive dispatch by extension).
 */
async function loadExtractedFile(spectrum, data, fileName, ext, test) {
    if (ext === 'tap') {
        spectrum.tapeLoader.load(new Uint8Array(data));
        spectrum.tapeTrap.setTape(spectrum.tapeLoader);
        injectLoadCommand(spectrum);
    } else if (ext === 'sna') {
        spectrum.loadSnapshot(new Uint8Array(data));
        reloadRomIfNeeded(spectrum);
    } else if (ext === 'z80') {
        spectrum.loadZ80Snapshot(new Uint8Array(data));
        reloadRomIfNeeded(spectrum);
    } else if (ext === 'szx') {
        spectrum.loadSZXSnapshot(new Uint8Array(data));
        reloadRomIfNeeded(spectrum);
    } else if (ext === 'trd' || ext === 'scl') {
        spectrum.loadDiskImage(data, ext, fileName);
        const diskRun = test ? (test.diskRun || 'boot') : 'boot';
        injectDiskRunCommand(spectrum, diskRun);
    } else if (ext === 'dsk') {
        spectrum.loadDSKImage(new Uint8Array(data), fileName);
        bootPlus3Disk(spectrum);
    } else {
        throw new Error(`Unsupported file format: ${ext}`);
    }
}

function reloadRomIfNeeded(spectrum) {
    if (spectrum.romLoaded) return;
    loadRomsForMachineType(spectrum, spectrum.machineType);
}

/**
 * Load a test file into the spectrum instance.
 * Handles TAP, SNA, Z80, SZX, RZX, ZIP, TRD, SCL, DSK.
 * Note: async due to ZipLoader.findAllSpectrum being async.
 */
export async function loadTestFile(spectrum, filePath, zipEntry, test) {
    const data = readTestFile(filePath);
    const ext = filePath.split('.').pop().toLowerCase();

    if (ext === 'tap') {
        spectrum.tapeLoader.load(data);
        spectrum.tapeTrap.setTape(spectrum.tapeLoader);
        injectLoadCommand(spectrum);
    } else if (ext === 'sna') {
        spectrum.loadSnapshot(data);
        reloadRomIfNeeded(spectrum);
    } else if (ext === 'z80') {
        spectrum.loadZ80Snapshot(data);
        reloadRomIfNeeded(spectrum);
    } else if (ext === 'szx') {
        spectrum.loadSZXSnapshot(data);
        reloadRomIfNeeded(spectrum);
    } else if (ext === 'rzx') {
        await spectrum.loadRZX(data);
        reloadRomIfNeeded(spectrum);
    } else if (ext === 'zip') {
        const spectrumFiles = await ZipLoader.findAllSpectrum(data.buffer);
        if (spectrumFiles.length === 0) throw new Error('No compatible files found in ZIP');

        let fileToLoad;
        if (zipEntry) {
            fileToLoad = spectrumFiles.find(f =>
                f.name === zipEntry ||
                f.name.toLowerCase() === zipEntry.toLowerCase() ||
                f.name.endsWith('/' + zipEntry) ||
                f.name.toLowerCase().endsWith('/' + zipEntry.toLowerCase())
            );
            if (!fileToLoad) throw new Error(`ZIP entry not found: ${zipEntry}`);
        } else {
            fileToLoad = spectrumFiles[0];
        }

        const innerExt = fileToLoad.name.split('.').pop().toLowerCase();
        await loadExtractedFile(spectrum, fileToLoad.data, fileToLoad.name, innerExt, test);
    } else if (ext === 'trd' || ext === 'scl') {
        spectrum.loadDiskImage(data.buffer, ext, filePath);
        const diskRun = test ? (test.diskRun || 'boot') : 'boot';
        injectDiskRunCommand(spectrum, diskRun);
    } else if (ext === 'dsk') {
        spectrum.loadDSKImage(data, filePath);
        bootPlus3Disk(spectrum);
    } else {
        throw new Error(`Unsupported file format: ${ext}`);
    }
}

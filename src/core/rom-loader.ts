/**
 * ROM loader — pure async functions for fetching and applying ROM data.
 * No DOM dependencies, no Spectrum import.
 */

import { MACHINE_PROFILES } from '../machines/profiles';

/** Fetch all known ROM files from basePath. Returns Map<filename, ArrayBuffer>. Missing ROMs are silently skipped. */
export async function fetchRoms(basePath = 'roms/'): Promise<Map<string, ArrayBuffer>> {
    const romData = new Map<string, ArrayBuffer>();

    // Collect unique ROM filenames from all profiles + trdos
    const files = new Set<string>();
    for (const p of Object.values(MACHINE_PROFILES)) {
        files.add(p.romFile);
    }
    files.add('trdos.rom');

    // Fetch all in parallel, silently skip missing
    await Promise.all([...files].map(async (file) => {
        try {
            const resp = await fetch(basePath + file);
            if (resp.ok) {
                romData.set(file, await resp.arrayBuffer());
                console.log(`Loaded ${basePath}${file}`);
            }
        } catch {}
    }));

    return romData;
}

/** Load ROM data into a Spectrum instance's memory. Returns false if the required ROM is missing. */
export function applyRoms(spectrum: any, romData: Map<string, ArrayBuffer>): boolean {
    const profile = spectrum.profile;
    const rom = romData.get(profile.romFile);
    if (!rom) return false;

    for (let bank = 0; bank < profile.romBanks; bank++) {
        spectrum.memory.loadRom(rom.slice(bank * 16384, (bank + 1) * 16384), bank);
    }

    const trdos = romData.get('trdos.rom');
    if (trdos && !profile.trdosInRom && (profile.betaDiskDefault || spectrum.betaDiskEnabled)) {
        spectrum.memory.loadTrdosRom(trdos);
    }

    spectrum.romLoaded = true;
    return true;
}

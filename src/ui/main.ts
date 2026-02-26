import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { Spectrum } from '../core/spectrum'
import { EmulatorControllerImpl } from '../core/emulator-controller'
import { fetchRoms } from '../core/rom-loader'

declare const APP_VERSION: string;
console.log('ZX-M8XXX v' + APP_VERSION);

const canvas = document.getElementById('screen') as HTMLCanvasElement
const overlayCanvas = document.getElementById('overlayCanvas') as HTMLCanvasElement

const spectrum = new Spectrum(canvas, {
  machineType: localStorage.getItem('zx-machine-type') || '48k',
  tapeTrapsEnabled: true,
  overlayCanvas,
  createCanvas: () => document.createElement('canvas'),
})

const controller = new EmulatorControllerImpl(spectrum)

// Keyboard: UI registers globally, forwards to controller
// (Focus-guard logic lives here instead of inside Spectrum)
function shouldIgnoreKey(e: KeyboardEvent): boolean {
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if ((e.target as HTMLElement).isContentEditable) return true;
  const active = document.activeElement;
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) return true;
  if (active && (active as HTMLElement).isContentEditable) return true;
  return false;
}

document.addEventListener('keydown', (e) => {
  if (shouldIgnoreKey(e)) return;
  controller.handleKeyDown(e);
});

document.addEventListener('keyup', (e) => {
  if (shouldIgnoreKey(e)) return;
  controller.handleKeyUp(e);
});

// Mount Svelte app immediately (UI shell renders while ROMs load)
const app = mount(App, {
  target: document.getElementById('ui')!,
  props: { emulator: controller },
})

// ---- Boot sequence ----

async function tryLoadRomLabels() {
  const lm = (controller.spectrum as any).labelManager;
  if (!lm) return;

  const labelPaths = ['labels/48k.json', 'labels/rom48.json', 'labels/spectrum48.json'];
  for (const path of labelPaths) {
    try {
      const resp = await fetch(path);
      if (resp.ok) {
        const jsonStr = await resp.text();
        const count = lm.loadRomLabels(jsonStr);
        if (count > 0) {
          console.log(`Loaded ${count} ROM labels from ${path}`);
          return;
        }
      }
    } catch {}
  }
}

async function boot() {
  restoreSettings();
  setupDeferredAudio();

  const romData = await fetchRoms();
  await tryLoadRomLabels();

  if (controller.applyRoms(romData)) {
    controller.reset();
    controller.start();
  } else {
    // 48.rom not found — let user provide ROMs manually
    app.showRomSelector();
  }

  console.log('');
  console.log('Usage:');
  console.log('1. Place ROMs in roms/ directory (48.rom, 128.rom, plus2.rom, plus2a.rom, pentagon.rom, scorpion.rom, trdos.rom)');
  console.log('2. Or select ROM files in dialog if not found');
  console.log('3. Load SNA/Z80/SZX snapshots, TAP/TZX tapes, or TRD/SCL disk images');
}

function restoreSettings() {
  const s = controller.spectrum; // escape hatch for properties not yet on interface
  const get = (k: string) => localStorage.getItem(k);

  if (get('zx-beta-disk') !== null) s.betaDiskEnabled = get('zx-beta-disk') === 'true';
  if (get('zxm8_lateTiming') === 'true') controller.setLateTimings(true);
  if (get('zx-ay-48k') === 'true') s.ay48kEnabled = true;

  const gp = get('gamepadMapping');
  if (gp) try { s.gamepadMapping = JSON.parse(gp); } catch {}
}

function setupDeferredAudio() {
  const savedEnabled = localStorage.getItem('zx-sound-enabled') !== 'false';
  if (!savedEnabled) return; // user had sound off — don't init audio at all

  const initOnce = async () => {
    document.removeEventListener('click', initOnce);
    document.removeEventListener('keydown', initOnce);

    const audio = controller.initAudio();
    await audio.start();

    const vol = localStorage.getItem('zx-volume');
    if (vol !== null) audio.setVolume(parseInt(vol) / 100);

    const stereo = localStorage.getItem('zx-stereo-mode');
    if (stereo) {
      controller.spectrum.ay.stereoMode = stereo;
      controller.spectrum.ay.updateStereoPanning();
    }
  };

  document.addEventListener('click', initOnce);
  document.addEventListener('keydown', initOnce);
}

boot();

export default app

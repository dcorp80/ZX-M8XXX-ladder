/**
 * Chaining DSL for emulator test scenarios.
 *
 * Usage:
 *   scenario('elite-title', 'pentagon')
 *     .loadTrdos('tests/elite.trd', 'ELITE')
 *     .press('Enter')
 *     .frames(600)
 *     .expectScreen('tests/elite-title.png', 'a1b2c3d4...')
 *     .run(testContext);
 */

import {
    createSpectrum, loadTestFile, runFrames, pressKeys,
    compareScreens, loadRomsForMachineType
} from './setup.js';
import { hashBuffer, loadPNG, savePNG, createDiffPNG } from './png-utils.js';
import { resolve, join } from 'path';

const artifactsPath = join(__REPORT_DIR__, 'artifacts');

export function scenario(name, machineType = '48k') {
    return new Scenario(name, machineType);
}

class Scenario {
    constructor(name, machineType) {
        this.name = name;
        this._machineType = machineType;
        this._steps = [];
        this._earlyTimings = false;
        this._fullBorder = true;
        this._ulaplus = false;
    }

    machine(type) { this._machineType = type; return this; }
    earlyTimings(v = true) { this._earlyTimings = v; return this; }
    fullBorder(v = true) { this._fullBorder = v; return this; }
    ulaplus(v = true) { this._ulaplus = v; return this; }

    loadTap(file, zipEntry) {
        this._steps.push({ type: 'load', file, zipEntry });
        return this;
    }

    loadSnapshot(file, zipEntry) {
        this._steps.push({ type: 'load', file, zipEntry });
        return this;
    }

    loadTrdos(file, diskRun) {
        this._steps.push({ type: 'load', file, diskRun });
        return this;
    }

    load(file, opts = {}) {
        this._steps.push({ type: 'load', file, zipEntry: opts.zipEntry, diskRun: opts.diskRun });
        return this;
    }

    press(keys) {
        this._steps.push({ type: 'keys', keys });
        return this;
    }

    frames(n) {
        this._steps.push({ type: 'frames', count: n });
        return this;
    }

    expectScreen(pngPath, hash, tolerance = 0) {
        this._steps.push({ type: 'expect', screen: pngPath, hash, tolerance });
        return this;
    }

    async run({expect, annotate}) {
        const spectrum = createSpectrum(this._machineType);

        if (this._earlyTimings) spectrum.setEarlyTimings(true);
        if (spectrum.ula.setFullBorder(this._fullBorder)) {
            spectrum.updateDisplayDimensions();
        }
        spectrum.reset();

        spectrum.ula.resetULAplus();
        if (this._ulaplus) {
            spectrum.ula.ulaplus.enabled = true;
            spectrum.ula.ulaplus.paletteEnabled = true;
        }

        spectrum.ula.keyboardState.fill(0xFF);

        let totalFrames = 0;

        const handleCompareScreens = (step, actual, fb, dims, safeName) => {
            const expected = loadPNG(resolve(step.screen));
            const diff = compareScreens(actual, expected, step.tolerance);
            if (!diff.matches) {
                const actualPath = join(artifactsPath, `${safeName}-actual.png`);
                const resolvedActual = resolve(actualPath);
                savePNG(resolvedActual, fb, dims.width, dims.height);
                const diffPng = createDiffPNG(actual, expected, step.tolerance);

                annotate(`FAIL: ${this.name} @ frame ${totalFrames}`);
                annotate(`Actual: ${actualPath}`, { path: resolvedActual });
                annotate(`Pixels differ: ${diff.diffCount} (${diff.diffPercent}%)`, { contentType: 'image/png', body: diffPng });

                expect.fail(
                    `Screen mismatch at frame ${totalFrames}: ` +
                    `${diff.diffCount} pixels differ (${diff.diffPercent}%)`
                );
            }
        }

        for (const step of this._steps) {
            switch (step.type) {
                case 'load': {
                    const test = step.diskRun ? { diskRun: step.diskRun } : undefined;
                    await loadTestFile(spectrum, step.file, step.zipEntry, test);
                    break;
                }
                case 'keys':
                    pressKeys(spectrum, step.keys);
                    break;
                case 'frames':
                    runFrames(spectrum, step.count);
                    totalFrames += step.count;
                    break;
                case 'expect': {
                    const fb = spectrum.getFrameBuffer();
                    const dims = spectrum.getScreenDimensions();
                    const actual = { data: new Uint8ClampedArray(fb), width: dims.width, height: dims.height };
                    const safeName = this.name.replace(/[^a-zA-Z0-9_-]/g, '_');

                    if (step.hash) {
                        const actualHash = hashBuffer(fb);
                        if (actualHash !== step.hash) {
                            annotate(`FAIL: ${this.name} @ frame ${totalFrames}`);
                            annotate(`Expected hash: ${step.hash.slice(0, 16)}...`);
                            annotate(`Actual hash:   ${actualHash.slice(0, 16)}...`);

                            if (step.screen) {
                                handleCompareScreens(step, actual, fb, dims, safeName)
                                annotate(`Pixels match reference PNG — hash in tests.json is stale`);
                                annotate(`Run: npm run test:update-hashes`);
                            }
                            expect.fail(
                                `Hash mismatch: expected ${step.hash.slice(0, 16)}..., got ${actualHash.slice(0, 16)}...`
                            );
                        }
                    } else if (step.screen) {
                        handleCompareScreens(step, actual, fb, dims, safeName)
                    }
                    break;
                }
            }
        }

        return spectrum;
    }
}

/**
 * Build and run a test scenario from a tests.json entry.
 * Accepts vitest test context for attaching failure artifacts.
 */
export async function runTestScenario(test, ctx) {
    const s = scenario(test.name, test.machine || '48k');

    if (test.earlyTimings) s.earlyTimings(true);
    if (test.fullBorder === false) s.fullBorder(false);
    if (test.ulaplus) s.ulaplus(true);

    s.load(test.file, { zipEntry: test.zipEntry, diskRun: test.diskRun });

    let prevFrames = 0;
    for (const step of test.steps) {
        if (step.keys) s.press(step.keys);

        const framesToRun = step.frames - prevFrames;
        if (framesToRun > 0) s.frames(framesToRun);
        prevFrames = step.frames;

        if (step.screen || step.screenHash) {
            s.expectScreen(step.screen, step.screenHash, step.tolerance || 0);
        }
    }
    await s.run(ctx);
}

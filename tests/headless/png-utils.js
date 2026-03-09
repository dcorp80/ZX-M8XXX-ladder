import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { createHash } from 'crypto';
import { PNG } from 'pngjs';

/**
 * SHA-256 hash of a buffer (frame buffer, RGBA data, etc.)
 * @param {Uint8ClampedArray|Buffer} data
 * @returns {string} hex digest
 */
export function hashBuffer(data) {
    return createHash('sha256').update(data).digest('hex');
}

/**
 * Load a PNG file and return raw RGBA pixel data.
 * Only used on test failure for visual diff generation.
 * @param {string} filePath
 * @returns {{data: Uint8ClampedArray, width: number, height: number}}
 */
export function loadPNG(filePath) {
    const buffer = readFileSync(filePath);
    const png = PNG.sync.read(buffer);
    return {
        data: new Uint8ClampedArray(png.data),
        width: png.width,
        height: png.height
    };
}

/**
 * Save RGBA buffer as a PNG file (failure artifact).
 * @param {string} filePath
 * @param {Uint8ClampedArray|Buffer} data RGBA pixels
 * @param {number} width
 * @param {number} height
 */
export function savePNG(filePath, data, width, height) {
    const png = new PNG({ width, height });
    png.data = Buffer.from(data);
    const buffer = PNG.sync.write(png);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, buffer);
    return buffer;
}

/**
 * Create a visual diff PNG highlighting pixel differences in red.
 * @param {{data: Uint8ClampedArray, width: number, height: number}} actual
 * @param {{data: Uint8ClampedArray, width: number, height: number}} expected
 * @param {number} tolerance
 * @returns {Buffer} containing diff PNG
 */
export function createDiffPNG(actual, expected, tolerance = 0) {
    const width = Math.min(actual.width, expected.width);
    const height = Math.min(actual.height, expected.height);
    const png = new PNG({ width, height });

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const aIdx = (y * actual.width + x) * 4;
            const eIdx = (y * expected.width + x) * 4;
            const oIdx = (y * width + x) * 4;

            const dr = Math.abs(actual.data[aIdx] - expected.data[eIdx]);
            const dg = Math.abs(actual.data[aIdx + 1] - expected.data[eIdx + 1]);
            const db = Math.abs(actual.data[aIdx + 2] - expected.data[eIdx + 2]);

            if (dr > tolerance || dg > tolerance || db > tolerance) {
                // Red highlight for differing pixels
                png.data[oIdx] = 255;
                png.data[oIdx + 1] = 0;
                png.data[oIdx + 2] = 0;
                png.data[oIdx + 3] = 255;
            } else {
                // Dimmed version of actual for context
                png.data[oIdx] = actual.data[aIdx] >> 1;
                png.data[oIdx + 1] = actual.data[aIdx + 1] >> 1;
                png.data[oIdx + 2] = actual.data[aIdx + 2] >> 1;
                png.data[oIdx + 3] = 255;
            }
        }
    }

    return PNG.sync.write(png);
}

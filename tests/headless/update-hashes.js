#!/usr/bin/env node

/**
 * Generate SHA-256 hashes for test reference screenshots.
 * Reads each reference PNG, hashes its RGBA buffer, writes screenHash back to tests.json.
 *
 * Usage:
 *   node tests/headless/update-hashes.js           # hash all steps with screen field
 *   node tests/headless/update-hashes.js --verify   # verify existing hashes match
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { hashBuffer, loadPNG } from './png-utils.js';

const ROOT = resolve(import.meta.dirname, '../..');
const TESTS_JSON_PATH = resolve(ROOT, 'tests.json');

const verify = process.argv.includes('--verify');

// Read as text so we can write back with same structure
const testsJson = JSON.parse(readFileSync(TESTS_JSON_PATH, 'utf-8'));
let updated = 0;
let verified = 0;
let mismatches = 0;

for (const test of testsJson.tests) {
    for (const step of test.steps) {
        if (!step.screen) continue;

        const pngPath = resolve(ROOT, step.screen);
        let png;
        try {
            png = loadPNG(pngPath);
        } catch (e) {
            console.warn(`  SKIP ${step.screen}: ${e.message}`);
            continue;
        }

        const hash = hashBuffer(png.data);

        if (verify) {
            if (step.screenHash) {
                if (step.screenHash === hash) {
                    verified++;
                } else {
                    console.error(`  MISMATCH ${test.id} → ${step.screen}`);
                    console.error(`    expected: ${step.screenHash}`);
                    console.error(`    actual:   ${hash}`);
                    mismatches++;
                }
            } else {
                console.warn(`  NO HASH ${test.id} → ${step.screen}`);
            }
        } else {
            if (step.screenHash !== hash) {
                step.screenHash = hash;
                updated++;
                console.log(`  ${test.id} → ${step.screen.split('/').pop()}: ${hash.slice(0, 16)}...`);
            }
        }
    }
}

if (verify) {
    console.log(`\nVerified: ${verified}, Mismatches: ${mismatches}`);
    if (mismatches > 0) process.exit(1);
} else {
    if (updated > 0) {
        writeFileSync(TESTS_JSON_PATH, JSON.stringify(testsJson, null, 4) + '\n');
        console.log(`\nUpdated ${updated} hashes in tests.json`);
    } else {
        console.log('\nAll hashes up to date');
    }
}

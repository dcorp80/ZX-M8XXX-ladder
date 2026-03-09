/**
 * Headless emulator visual regression tests.
 * Reads test definitions from tests.json, runs each as a Vitest test case.
 */

import { describe, it } from 'vitest';
import { runTestScenario } from './scenario.js';
import { tests as scenarios } from '../../tests.json' with { type: 'json' };

describe('headless emulator visual regression', () => {
    it.for(scenarios)('$name', async (scenario, ctx) => {
        if (!scenario.enabled) {
            ctx.skip(scenario.skipReason ?? 'Disabled intentionally');
        }

        await runTestScenario(scenario, ctx);
    });
});

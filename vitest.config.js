import { defineConfig } from 'vitest/config'

const REPORT_DIR = 'reports'

export default defineConfig({
    test: {
        reporters: ['default', 'blob'],
        projects: [
            {
                test: {
                    name: 'unit',
                    include: ['tests/unit/**/*.test.js'],
                },
            },
            {
                define: {
                    __REPORT_DIR__: JSON.stringify(REPORT_DIR),
                },
                test: {
                    name: 'headless',
                    include: ['tests/headless/**/*.test.js'],
                    testTimeout: 60_000,
                },
            },
        ],
        coverage: {
            provider: 'v8',
            include: ['js/**'],
            reporter: ['text', 'html', 'lcov'],
            reportsDirectory: `${REPORT_DIR}/coverage`,
        },
    },
})

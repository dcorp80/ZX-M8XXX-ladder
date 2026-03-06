import { defineConfig } from 'vitest/config'

const __REPORT_DIR__ = 'reports'

export default defineConfig({
    test: {
        include: ['tests/headless/**/*.test.js'],
        testTimeout: 30_000,
        pool: 'forks',
        fileParallelism: false,
        reporters: ["default", "html"],
        outputFile: `${__REPORT_DIR__}/index.html`,
    },
    define: {
      __REPORT_DIR__: JSON.stringify(__REPORT_DIR__)
    }
})

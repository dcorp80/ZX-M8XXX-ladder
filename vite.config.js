import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
    base: './',
    define: {
        APP_VERSION: JSON.stringify('0.9.37'),
    },
    resolve: {
        extensions: ['.mts', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
    },
    build: {
        chunkSizeWarningLimit: 600,
    },
})
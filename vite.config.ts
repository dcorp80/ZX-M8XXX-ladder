import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  base: './',
  define: {
    APP_VERSION: JSON.stringify('0.9.27'),
  },
  resolve: {
    extensions: ['.mts', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
  },
  build: {
    chunkSizeWarningLimit: 600,
  },
})

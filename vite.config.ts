import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  server: {
    https: false,
    host: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
})

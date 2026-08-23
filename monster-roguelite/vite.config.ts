import { defineConfig } from 'vite';

// Basis-Pfad relativ, damit der Build auch aus einem Unterordner
// (z. B. GitHub Pages) heraus lauffähig ist.
export default defineConfig({
  base: './',
  server: { open: false, port: 5173 },
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
  },
});

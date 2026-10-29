import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The question bank (~600 KB of text) is bundled on purpose.
  build: { chunkSizeWarningLimit: 1200 },
  test: {
    environment: 'node',
  },
});

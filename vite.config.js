import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('lucide-react')) return 'icons-vendor';
          if (id.includes('recharts')) return 'recharts-vendor';
          if (id.includes('d3-')) return 'd3-vendor';
          if (id.includes('react') || id.includes('react-dom')) return 'react-vendor';
          return undefined;
        }
      }
    }
  }
});

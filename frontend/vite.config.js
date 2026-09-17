import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'url';

export default defineConfig({
  plugins: [
    vue({
      template: {
        // plugin-vue >=6 defaults includeAbsolute:true when no devServer is
        // present, turning root-absolute public paths (e.g. "/logo.png") into
        // asset imports that break under vitest on Windows. Restore Vite 5
        // behaviour: keep absolute paths as plain strings, still transform
        // relative asset URLs.
        transformAssetUrls: { includeAbsolute: false },
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
      },
    },
  },
  build: {
    // pdf-export is a lazy fallback chunk for client-side PDF generation.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('chart.js')) return 'chartjs';
          if (id.includes('html2pdf.js')) return 'pdf-export';
          if (id.includes('jspdf') || id.includes('html2canvas')) return 'pdf-vendor';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/assets': { target: 'http://localhost:3000', changeOrigin: true },
      // WebSocket للمزامنة اللحظية — مسار مخصص /ws (بدون هذا لا يصل اتصال الـ ws للخادم في التطوير)
      '/ws': { target: 'ws://localhost:3000', ws: true },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/ws': { target: 'ws://localhost:3000', ws: true },
    },
  },
});

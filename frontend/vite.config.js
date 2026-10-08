import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { createRequire } from 'node:module';
import process from 'node:process';
import { createCspMetaPlugin } from './src/security/cspMetaPolicy.js';

const deploymentConfig = JSON.parse(
  readFileSync(fileURLToPath(new URL('./vercel.json', import.meta.url)), 'utf8'),
);
const hostedCsp = deploymentConfig.headers
  ?.find((rule) => rule.source === '/(.*)')
  ?.headers.find((header) => header.key.toLowerCase() === 'content-security-policy')?.value;

// The unminified CommonJS entry exceeds 1 MiB and makes esbuild use a temp file
// during production chunking. On Windows that temporary file can be locked by
// the scanner before esbuild removes it. Use the package's equivalent minified
// entry while keeping the PDF feature lazy-loaded.
const html2pdfEntry = createRequire(import.meta.url).resolve('html2pdf.js');
const html2pdfMinifiedEntry = html2pdfEntry.replace(/html2pdf\.js$/, 'html2pdf.min.js');

export default defineConfig(({ mode }) => ({
  plugins: [
    createCspMetaPlugin(mode, hostedCsp, process.env.VITE_ANDROID_BUILD_TYPE),
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
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'html2pdf.js': html2pdfMinifiedEntry,
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
    // Native packaging must not overwrite the assets served by the shop/web server.
    outDir: mode === 'native' ? 'dist-native' : 'dist',
    // pdf-export is a lazy fallback chunk for client-side PDF generation.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@sentry')) return 'vendor-sentry';
          if (id.includes('@lucide')) return 'vendor-icons';
          if (id.includes('chart.js')) return 'chartjs';
          if (id.includes('html2pdf.js')) return 'pdf-export';
          if (id.includes('jspdf') || id.includes('html2canvas')) return 'pdf-vendor';
          if (id.includes('axios')) return 'vendor-axios';
          if (id.includes('vue') || id.includes('pinia')) return 'vendor-vue';
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
}));

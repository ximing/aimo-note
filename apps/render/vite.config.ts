import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// https://vite.dev/config/
export default defineConfig(() => {
  return {
    // Inject environment variables
    define: {},
    base: './',
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
    build: {
      // Output to different locations based on target (Electron vs server).
      // Electron package reads renderer assets from apps/client/dist.
      outDir: path.resolve(__dirname, '../client/dist'),
      emptyOutDir: true,

      // Optimize chunk size
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            // Vendor libraries
            if (id.includes('node_modules')) {
              if (id.includes('react')) {
                return 'vendor-react';
              }
              if (id.includes('lucide-react') || id.includes('@headlessui')) {
                return 'vendor-ui';
              }
              if (id.includes('axios') || id.includes('@rabjs')) {
                return 'vendor-libs';
              }
              return 'vendor-other';
            }

            // Separate page chunks
            if (id.includes('/pages/')) {
              const match = id.match(/\/pages\/(\w+)\//);
              if (match) {
                return `page-${match[1]}`;
              }
            }

            // Services
            if (id.includes('/services/')) {
              return 'services';
            }

            // Components
            if (id.includes('/components/')) {
              return 'components';
            }
          },
        },
      },

      // Minimize
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
        },
      },

      // Inline small static imports
      assetsInlineLimit: 4096,

      // CSS code splitting
      cssCodeSplit: true,

      // Source map for production debugging
      sourcemap: false,

      // Optimize chunk size threshold
      chunkSizeWarningLimit: 1000,

      // Report compressed size
      reportCompressedSize: false,
    },
  };
});

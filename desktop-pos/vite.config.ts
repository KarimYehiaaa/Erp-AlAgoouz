import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import path from 'path';
import { createRendererContentSecurityPolicyPlugin } from './build/rendererCsp';

// Verification can own separate artifacts while the normal cashier build continues.
const verificationRoot = process.env.POS_BUILD_ROOT
  ? path.resolve(process.env.POS_BUILD_ROOT)
  : undefined;
const electronOutDir = verificationRoot
  ? path.join(verificationRoot, 'dist-electron')
  : 'dist-electron';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const configuredServerUrls = [
    env.VITE_API_URL,
    env.POS_SERVER_URL,
    ...(env.VITE_TRUSTED_SERVER_URLS || '').split(','),
    ...(env.POS_TRUSTED_SERVER_URLS || '').split(','),
  ].filter((value): value is string => Boolean(value?.trim()));

  return {
    build: verificationRoot ? { outDir: path.join(verificationRoot, 'dist') } : {},
    plugins: [
      vue(),
      createRendererContentSecurityPolicyPlugin(configuredServerUrls, mode !== 'production'),
      electron([
        {
          entry: 'electron/main.ts',
          vite: { build: { outDir: electronOutDir } },
        },
        {
          entry: 'electron/preload.ts',
          vite: {
            build: {
              outDir: electronOutDir,
              lib: {
                entry: 'electron/preload.ts',
                formats: ['cjs'],
                fileName: () => 'preload.cjs',
              },
            },
          },
          onstart(options) {
            options.reload();
          },
        },
      ]),
      renderer(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      port: 5174,
    },
  };
});

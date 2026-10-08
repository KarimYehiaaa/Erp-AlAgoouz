# Windows POS installer

Run `npm run build` inside `desktop-pos` to build the renderer, main process and
preload. Run `npm run electron:build` to do the same build and prepare the Windows
x64 NSIS installer. Both commands route native tools through the ignored workspace
directory `scratch/desktop-build-temp`, avoiding dependence on machine-specific OS
temporary-directory permissions.
Completed setup, blockmap and updater metadata are copied into `release`. A failed
build preserves the previous release.

Set `POS_RELEASE_ROOT` to choose a different final output directory. Set
`POS_BUILD_ROOT` to package the corresponding isolated Vite build. To prepare an
installer from an existing verified package without rebuilding the app, use
`npm run build:installer -- --prepackaged <absolute win-unpacked directory>`.
Plain `npm run build:installer` requires the `dist` and `dist-electron` outputs
from `npm run build`; it now reports missing inputs before starting Electron
Builder. Use `npm run electron:build` on a fresh copy.

Installer preparation never publishes or installs the app. Testing the installer
on a cashier device remains a separate step. The current configuration creates
an unsigned installer. A host that rejects native executable loading from a
particular drive must run the installer and installed app from a working drive;
temporary build staging does not change Windows protection or drive settings.
Enterprise Code Integrity can also block the unsigned NSIS helper while the
installer is being created. In that case, use a trusted signing certificate or
an authorized build host; changing the temporary directory does not satisfy a
signing policy.

## Electron runtime smoke on Windows

Run `node desktop-pos/tests/electron-smoke.mjs` from the repository root after
building the desktop app. If Windows blocks Electron when it is launched from
the workspace drive, copy `desktop-pos/node_modules/electron/dist` to a fresh
directory under `$env:TEMP`, then set `POS_SMOKE_EXECUTABLE` to the copied
`electron.exe` and `POS_BUILD_ROOT` to the resolved `desktop-pos` directory
before running the same command. The smoke test uses a separate temporary user
profile and checks that Chromium sandbox, context isolation, and web security
remain enabled; do not disable the sandbox to work around a path restriction.

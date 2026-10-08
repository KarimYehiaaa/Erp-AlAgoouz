const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const htmlPath = path.resolve(
  process.env.DOCS_HTML_SOURCE || path.join(__dirname, 'documentation_source.html'),
);
const outputDirectory = path.resolve(process.env.DOCS_OUTPUT_DIR || __dirname);
const pdfPath = path.join(outputDirectory, 'Bin_AlAgoouz_ERP_Complete_Documentation.pdf');
const temporaryPdfPath = path.join(outputDirectory, `.documentation-${process.pid}.pdf`);

function locateOnPath(commandName) {
  try {
    const finder = process.platform === 'win32' ? 'where.exe' : 'which';
    const located = execFileSync(finder, [commandName], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split(/\r?\n/)
      .find(Boolean);
    return located && fs.existsSync(located) && fs.statSync(located).isFile() ? located : null;
  } catch {
    return null;
  }
}

function findBrowserBinary() {
  const configured = [
    process.env.DOCS_BROWSER_BIN,
    process.env.EDGE_BIN,
    process.env.CHROME_BIN,
  ].filter(Boolean);
  if (configured.length > 0) {
    const binary = configured
      .map((candidate) =>
        path.isAbsolute(candidate) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()
          ? candidate
          : path.isAbsolute(candidate)
            ? null
            : locateOnPath(candidate),
      )
      .find(Boolean);
    if (!binary)
      throw new Error(
        'The configured DOCS_BROWSER_BIN, EDGE_BIN, or CHROME_BIN executable was not found.',
      );
    return binary;
  }

  const commandNames =
    process.platform === 'win32'
      ? ['msedge.exe', 'chrome.exe']
      : process.platform === 'darwin'
        ? ['microsoft-edge', 'google-chrome', 'chromium']
        : ['microsoft-edge', 'msedge', 'google-chrome', 'chromium', 'chromium-browser'];
  for (const name of commandNames) {
    const binary = locateOnPath(name);
    if (binary) return binary;
  }

  if (process.platform === 'win32') {
    const roots = [
      process.env.PROGRAMFILES,
      process.env['PROGRAMFILES(X86)'],
      process.env.LOCALAPPDATA,
    ].filter(Boolean);
    for (const root of roots) {
      for (const binary of [
        path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      ]) {
        if (fs.existsSync(binary) && fs.statSync(binary).isFile()) return binary;
      }
    }
  }

  throw new Error(
    'No supported browser was found. Set DOCS_BROWSER_BIN, EDGE_BIN, or CHROME_BIN to its executable path.',
  );
}

try {
  if (!fs.existsSync(htmlPath) || !fs.statSync(htmlPath).isFile()) {
    throw new Error(`Documentation HTML source was not found: ${htmlPath}`);
  }
  fs.mkdirSync(outputDirectory, { recursive: true });
  const browserPath = findBrowserBinary();
  console.log('Rendering PDF from:', htmlPath);
  execFileSync(
    browserPath,
    [
      '--headless',
      '--disable-gpu',
      '--run-all-compositor-stages-before-draw',
      `--print-to-pdf=${temporaryPdfPath}`,
      '--no-pdf-header-footer',
      htmlPath,
    ],
    { stdio: 'inherit', windowsHide: true },
  );
  if (!fs.existsSync(temporaryPdfPath) || fs.statSync(temporaryPdfPath).size === 0) {
    throw new Error('The browser exited successfully but did not produce a nonempty PDF.');
  }
  fs.renameSync(temporaryPdfPath, pdfPath);
  console.log('SUCCESS: Master PDF generated at:', pdfPath);
} catch (err) {
  if (fs.existsSync(temporaryPdfPath)) fs.unlinkSync(temporaryPdfPath);
  console.error('Error rendering PDF:', err.message);
  process.exitCode = 1;
}

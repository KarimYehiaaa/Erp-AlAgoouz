/** PM2 process definitions for Bin Al-Ajouz ERP — Unified on Port 3000 */
module.exports = {
  apps: [
    {
      name: 'bin-al-ajouz-erp',
      cwd: './backend',
      // [AUDIT FIX C4] TypeScript entrypoints cannot be executed by Node directly.
      // The interpreter is plain node, so TS must be stripped at load time via
      // the registered tsx loader (--import works with Node >= 20.6).
      script: 'src/index.ts',
      interpreter: 'node',
      node_args: '--import tsx',
      watch: false,
      autorestart: true,
      max_restarts: 20,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};

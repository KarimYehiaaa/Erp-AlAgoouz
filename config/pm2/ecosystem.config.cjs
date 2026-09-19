const path = require('path');

/** PM2 process definitions for Bin Al-Ajouz ERP — Unified on Port 3000 */
module.exports = {
  apps: [
    {
      name: 'bin-al-ajouz-erp',
      cwd: path.resolve(__dirname, '../../backend'),
      script: 'src/index.ts',
      interpreter: 'node',
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

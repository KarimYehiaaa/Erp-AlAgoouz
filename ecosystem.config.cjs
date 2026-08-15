/** PM2 process definitions for Bin Al-Ajouz ERP */
module.exports = {
  apps: [
    {
      name: 'bin-al-ajouz-api',
      cwd: './backend',
      script: 'src/index.ts',
      interpreter: 'node',
      watch: false,
      autorestart: true,
      max_restarts: 20,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'bin-al-ajouz-web',
      cwd: './frontend',
      script: 'node_modules/vite/bin/vite.js',
      args: '--host 0.0.0.0 --port 5173',
      watch: false,
      autorestart: true,
      max_restarts: 20,
    },
  ],
};


// PM2 ecosystem configuration for OpenEPaperLink Web UI (Next.js)
// Single-port model: one dev instance (default Next.js port 3000) and optional prod instance.
// Device selection & transport handling are done in-app (Devices page + headers) so we no longer
// run multiple PM2 processes per device.
//
// Common usage:
//   pm2 start ecosystem.config.cjs --only webui-dev --watch      # Hot dev with restarts
//   pm2 start ecosystem.config.cjs --only webui-prod             # Serve previously built app
//   pm2 logs webui-dev
//   pm2 delete webui-dev
//
// To target a specific device by default you can still export DEVICE_BASE_URL before start, e.g.:
//   DEVICE_BASE_URL=http://192.168.4.101 pm2 restart webui-dev
// but normally you just pick / edit devices inside the UI now.

module.exports = {
  apps: [
    {
      name: 'webui-dev',
      script: 'node_modules/next/dist/bin/next',
      args: 'dev',
      cwd: __dirname,
      watch: [
        'pages', 'components', 'hooks', 'lib', 'context', 'features', 'styles', 'next.config.js'
      ],
      ignore_watch: ['node_modules', '.next', 'public'],
      env: {
        NODE_ENV: 'development',
        ENABLE_SERIAL_API: '1'
      },
      interpreter: 'node',
      autorestart: true,
      max_restarts: 20,
      min_uptime: '5s'
    },
    {
      name: 'webui-prod',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        ENABLE_SERIAL_API: 'false'
      },
      // Expect build already run via `npm run build`
      autorestart: true
    }
  ]
};

// PM2 ecosystem configuration for OpenEPaperLink Web UI (Next.js)
// Usage:
//  pm2 start ecosystem.config.cjs --only webui-dev --watch
//  pm2 start ecosystem.config.cjs --only webui-prod
//  pm2 logs webui-dev
//  pm2 delete webui-dev

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

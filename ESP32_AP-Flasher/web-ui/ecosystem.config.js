/**
 * PM2 ecosystem config for the web-ui
 * - watch: false prevents PM2 from auto-restarting when files change
 * - ignore_watch lists folders/files PM2 should ignore if watch is enabled
 * Use: pm2 start ecosystem.config.js --env production
 */
module.exports = {
  apps: [
    {
      name: 'esp32-dev-ui',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false, // <= disable watch by default
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      // if you ever enable watch, ignore these patterns to avoid noisy restarts
      ignore_watch: ['node_modules', 'logs', 'data', '.git', 'wwwroot'],
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log'
    }
  ]
};
module.exports = {
  apps: [
    {
      name: 'web-ui',
      script: 'server.js',
      cwd: __dirname,
      watch: [
        'server.js',
        'public/',
        '../src/',
      ],
      ignore_watch: ['node_modules', '.git', '.venv'],
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      }
    },
    {
      name: 'debug-monitor',
      script: 'python',
      args: ['debug_monitor.py'],
      cwd: __dirname + '/..',
      interpreter: 'python',
      watch: [
        '../debug_monitor.py'
      ],
      ignore_watch: ['.git', 'node_modules'],
      env: {
        PYTHONUNBUFFERED: '1'
      }
    }
  ]
};

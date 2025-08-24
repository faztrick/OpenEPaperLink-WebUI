const path = require('path');

module.exports = {
  apps: [
    {
      name: 'web-ui',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'development',
        PORT: process.env.PORT || 3000,
        API_LOGGING: process.env.API_LOGGING || '1',
        OPEL_AGENT_TOKEN: process.env.OPEL_AGENT_TOKEN || ''
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 3000,
        API_LOGGING: process.env.API_LOGGING || '0',
        OPEL_AGENT_TOKEN: process.env.OPEL_AGENT_TOKEN || ''
      },
      ignore_watch: ['node_modules', 'logs', 'data', '.git', 'wwwroot'],
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      time: true
    },
    // Optional Python debug monitor process. Start with: pm2 start ecosystem.config.js --only debug-monitor
    {
      name: 'debug-monitor',
      script: 'python',
      args: ['debug_monitor.py'],
      cwd: path.join(__dirname, '..'),
      interpreter: 'python',
      watch: false,
      autorestart: true,
      env: {
        PYTHONUNBUFFERED: '1'
      }
    }
  ]
};

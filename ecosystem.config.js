/**
 * PM2 Ecosystem Configuration
 *
 * DEPLOYMENT TARGET: VPS (Hetzner or equivalent)
 *
 * Features enabled:
 * - Full application (REST API + WebSockets + Background Workers)
 * - Auto-restart on crashes
 * - Cluster mode for production (multi-core utilization)
 * - Graceful reload for zero-downtime deployments
 * - Log rotation and management
 * - Memory limits and monitoring
 *
 * Usage:
 *   Development:  pm2 start ecosystem.config.js --env development
 *   Staging:      pm2 start ecosystem.config.js --env staging
 *   Production:   pm2 start ecosystem.config.js --env production
 *
 *   Reload:       pm2 reload ecosystem.config.js --env production
 *   Stop:         pm2 stop ecosystem.config.js
 *   Logs:         pm2 logs
 *   Monitor:      pm2 monit
 */

module.exports = {
  apps: [
    {
      // Application name
      name: 'elsaif-backend',

      // Entry point
      script: './server.js',

      // Instances (production uses cluster mode)
      instances: process.env.NODE_ENV === 'production' ? 'max' : 1,
      exec_mode: process.env.NODE_ENV === 'production' ? 'cluster' : 'fork',

      // Auto-restart configuration
      autorestart: true,
      watch: false, // Disable in production (use pm2 reload for deployments)
      max_memory_restart: '1G', // Restart if memory exceeds 1GB

      // Environment variables
      env: {
        NODE_ENV: 'development',
        PORT: 5000
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 5000
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 5000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000
      },

      // Logging
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Advanced PM2 features
      min_uptime: '10s', // Minimum uptime before considered stable
      max_restarts: 10, // Max restarts within min_uptime window
      kill_timeout: 5000, // Time to wait for graceful shutdown (5 seconds)
      listen_timeout: 3000, // Time to wait for app to be ready
      shutdown_with_message: false,

      // Source maps support
      source_map_support: false,

      // Instance management
      instance_var: 'INSTANCE_ID',

      // Wait for ready signal (important for database connections)
      wait_ready: false,

      // Graceful shutdown
      kill_timeout: 10000, // Matches server.js graceful shutdown timeout

      // Ignore watch (production safety)
      ignore_watch: ['node_modules', 'logs', 'tests', '.git'],

      // Restart delay
      restart_delay: 4000
    }
  ],

  deploy: {
    // Production deployment configuration
    production: {
      user: 'deploy',
      host: 'YOUR_VPS_IP', // Replace with actual VPS IP
      ref: 'origin/main',
      repo: 'YOUR_GIT_REPO', // Replace with actual repo
      path: '/var/www/elsaif-backend',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production && pm2 save',
      'pre-deploy-local': 'echo "Deploying to production..."'
    },

    // Staging deployment configuration
    staging: {
      user: 'deploy',
      host: 'YOUR_STAGING_IP', // Replace with staging server IP
      ref: 'origin/develop',
      repo: 'YOUR_GIT_REPO',
      path: '/var/www/elsaif-backend-staging',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env staging && pm2 save',
      'pre-deploy-local': 'echo "Deploying to staging..."'
    }
  }
};

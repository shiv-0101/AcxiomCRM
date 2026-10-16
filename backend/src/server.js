require('dotenv').config();
const { initializeDatabase } = require('./config/database');
const { seedDatabase } = require('./config/seed');
const logger = require('./utils/logger');
const app = require('./app');

const PORT = parseInt(process.env.PORT) || 5000;

async function startServer() {
  try {
    // Initialize and seed database
    logger.info('[Server] Initializing database...');
    initializeDatabase();
    logger.info('[Server] Database initialized successfully.');

    await seedDatabase();

    const server = app.listen(PORT, () => {
      logger.info(`[Server] AcxiomCRM Backend running on http://localhost:${PORT}`);
      logger.info(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`[Server] Health check: http://localhost:${PORT}/api/health`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('[Server] SIGTERM received. Shutting down gracefully...');
      server.close(() => {
        logger.info('[Server] HTTP server closed.');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      logger.info('[Server] SIGINT received. Shutting down...');
      process.exit(0);
    });

  } catch (err) {
    logger.error(`[Server] Failed to start: ${err.message}`);
    process.exit(1);
  }
}

startServer();

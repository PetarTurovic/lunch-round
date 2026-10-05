import { createApp } from './app';
import { connectDatabase } from './shared/db/connection';
import config from './config';

const startServer = async () => {
  const app = createApp();

  try {
    await connectDatabase();
  } catch (error) {
    console.error('Failed to connect to the database:', error);
    process.exit(1);
  }

  app.listen(config.port, () => {
    console.log(`Server running in ${config.nodeEnv} mode on port ${config.port}`);
    console.log(`API base URL: http://localhost:${config.port}`);
  });
};

startServer();

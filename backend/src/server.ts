import app from "./app";
import config, { connectDatabase } from "./config";

async function start() {
  await connectDatabase();
  app.listen(config.port, () => {
    console.log(`Server running on port ${config.port} (${config.nodeEnv})`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

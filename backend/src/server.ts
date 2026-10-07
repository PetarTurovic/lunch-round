import app from "./app";
import config, { connectDatabase } from "./config";

async function start() {
  const server = app.listen(config.port, "0.0.0.0", () => {
    console.log(`Server running on port ${config.port} (${config.nodeEnv})`);
  });

  try {
    await connectDatabase();
    console.log("Connected to MongoDB");
  } catch (err) {
    console.error("Failed to connect to MongoDB:", err);
    server.close();
    process.exit(1);
  }
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

import mongoose from "mongoose";
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

  // On deploy (SIGTERM) or Ctrl-C, stop taking new connections, let in-flight
  // requests finish, then close the database. Without this the platform
  // hard-kills open sockets and leaves Mongo connections dangling.
  const shutdown = (signal: NodeJS.Signals) => {
    console.log(`${signal} received, shutting down`);
    const forceExit = setTimeout(() => {
      console.error("Graceful shutdown timed out, forcing exit");
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    server.close(async () => {
      try {
        await mongoose.disconnect();
      } finally {
        clearTimeout(forceExit);
        process.exit(0);
      }
    });
  };

  (["SIGTERM", "SIGINT"] as const).forEach((signal) => {
    process.on(signal, () => shutdown(signal));
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

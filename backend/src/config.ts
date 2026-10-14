import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const nodeEnv = process.env.NODE_ENV || "development";

/**
 * A predictable fallback secret means every account is forgeable by anyone who
 * has read the source. In production the process must refuse to boot rather
 * than sign tokens nobody can trust; locally the fallback keeps `npm run dev`
 * frictionless.
 */
const DEV_FALLBACK_JWT_SECRET = "lunchround-dev-only-insecure-secret";
const configuredJwtSecret = process.env.JWT_SECRET?.trim();
if (!configuredJwtSecret && nodeEnv === "production") {
  throw new Error("JWT_SECRET must be set when NODE_ENV=production");
}

export const config = {
  nodeEnv,
  port: parseInt(process.env.PORT || "3001", 10) || 3001,
  mongodbUri: process.env.MONGODB_URI || "mongodb://localhost:27017/lunchround",
  jwtSecret: configuredJwtSecret || DEV_FALLBACK_JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  corsOrigin: process.env.CORS_ORIGIN?.split(",") ?? "*",
  isProduction: nodeEnv === "production",
};

export const connectDatabase = async () => {
  await mongoose.connect(config.mongodbUri);
};

export const databaseReadyState = () => mongoose.connection.readyState;
export const isDatabaseReady = () => mongoose.connection.readyState === 1;

export default config;

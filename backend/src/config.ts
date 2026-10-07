import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

export const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "3001", 10) || 3001,
  mongodbUri: process.env.MONGODB_URI || "mongodb://localhost:27017/lunchround",
  jwtSecret: process.env.JWT_SECRET || "lunchround-secret",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  corsOrigin: process.env.CORS_ORIGIN?.split(",") ?? "*",
};

export const connectDatabase = async () => {
  await mongoose.connect(config.mongodbUri);
};

export default config;

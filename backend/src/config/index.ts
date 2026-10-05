import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10) || 3001,
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/lunchround',
  mongodbSourceUri: process.env.MONGODB_SOURCE_URI || 'mongodb://localhost:27017/menue',
  logLevel: process.env.LOG_LEVEL || 'info',
  isDevelopment: process.env.NODE_ENV !== 'production',
  isTest: process.env.NODE_ENV === 'test',
};
export interface AppConfig {
  nodeEnv: string;
  port: number;
  mongodbUri: string;
  mongodbSourceUri: string;
  logLevel: string;
  isDevelopment: boolean;
  isTest: boolean;
}

export default config;

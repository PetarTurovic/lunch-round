import mongoose from 'mongoose';
import { connectDatabase } from '@/shared/db';

async function main(): Promise<void> {
  await connectDatabase();
  console.log('Connected to MongoDB');
}

main().catch((error: unknown) => {
  console.error('Failed to start:', error);
  process.exit(1);
});

process.on('SIGINT', () => {
  void mongoose.disconnect().then(() => process.exit(0));
});

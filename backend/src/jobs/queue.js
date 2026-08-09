import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import config from '../config/index.js';

// Setup Redis connection
const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

// Setup Main Queue
export const systemQueue = new Queue('system-queue', { connection });

// Example Worker
export const systemWorker = new Worker('system-queue', async job => {
  if (job.name === 'backup') {
    console.log(`[Job] Executing backup job ${job.id}`);
    // Simulate backup task
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log(`[Job] Backup job ${job.id} completed successfully`);
  }
}, { connection });

systemWorker.on('completed', job => {
  console.log(`[Queue] Job ${job.id} has completed!`);
});

systemWorker.on('failed', (job, err) => {
  console.error(`[Queue] Job ${job?.id} has failed with ${err.message}`);
});

export const addBackupJob = async () => {
  await systemQueue.add('backup', { time: new Date().toISOString() }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 }
  });
};

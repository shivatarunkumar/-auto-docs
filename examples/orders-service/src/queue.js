import { createClient } from 'redis';
import { config } from './config.js';

const QUEUE_KEY = 'orders:payment-jobs';
const client = createClient({ url: config.redisUrl });
await client.connect();

export async function enqueuePayment(orderId, attempt = 1) {
  await client.lPush(QUEUE_KEY, JSON.stringify({ orderId, attempt }));
}

// Blocks for up to 5 seconds waiting for the next job.
export async function nextPayment() {
  const item = await client.brPop(QUEUE_KEY, 5);
  return item ? JSON.parse(item.element) : null;
}

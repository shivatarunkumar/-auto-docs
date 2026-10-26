import { config } from './config.js';
import { getOrder, updateStatus } from './db.js';
import { charge } from './payments.js';
import { enqueuePayment, nextPayment } from './queue.js';

// Drains payment jobs: charge the order, then record paid / failed.
// Provider outages are retried up to MAX_PAYMENT_ATTEMPTS before failing.
async function handle({ orderId, attempt }) {
  const order = await getOrder(orderId);
  if (!order || order.status !== 'pending') return;
  try {
    const result = await charge(order);
    await updateStatus(orderId, result.approved ? 'paid' : 'failed', result.reason);
  } catch (error) {
    if (attempt < config.maxPaymentAttempts) {
      await enqueuePayment(orderId, attempt + 1);
    } else {
      await updateStatus(orderId, 'failed', `payment error after ${attempt} attempts: ${error.message}`);
    }
  }
}

console.log('payment worker started');
for (;;) {
  const job = await nextPayment();
  if (job) await handle(job);
}

import { config } from './config.js';

// Charges an order through the external payments provider.
export async function charge(order) {
  const response = await fetch(`${config.paymentsUrl}/v1/charges`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': `order-${order.id}` },
    body: JSON.stringify({ amount: order.amount_cents, currency: order.currency, reference: order.id }),
  });
  if (response.status >= 500) throw new Error(`payments provider unavailable (${response.status})`);
  const body = await response.json();
  return { approved: body.status === 'succeeded', reason: body.decline_code ?? null };
}

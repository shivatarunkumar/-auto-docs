import http from 'node:http';
import { config } from './config.js';
import { getOrder, insertOrder, ping } from './db.js';
import { enqueuePayment } from './queue.js';

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return JSON.parse(raw || '{}');
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/healthz') {
      await ping();
      return send(res, 200, { ok: true });
    }
    if (req.headers['x-api-key'] !== config.apiKey) return send(res, 401, { error: 'unauthorized' });

    if (req.method === 'POST' && req.url === '/orders') {
      const { customerId, amountCents, currency = 'USD' } = await readJson(req);
      if (!customerId || !Number.isInteger(amountCents) || amountCents <= 0) {
        return send(res, 400, { error: 'customerId and positive integer amountCents are required' });
      }
      const order = await insertOrder({ customerId, amountCents, currency });
      await enqueuePayment(order.id);
      return send(res, 202, order);
    }

    const match = /^\/orders\/(\d+)$/.exec(req.url ?? '');
    if (req.method === 'GET' && match) {
      const order = await getOrder(Number(match[1]));
      return order ? send(res, 200, order) : send(res, 404, { error: 'not found' });
    }
    return send(res, 404, { error: 'not found' });
  } catch (error) {
    console.error(error);
    return send(res, 500, { error: 'internal error' });
  }
});

server.listen(config.port, () => console.log(`orders-service listening on :${config.port}`));

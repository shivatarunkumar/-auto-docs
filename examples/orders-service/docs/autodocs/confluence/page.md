
# orders-service

## Overview

orders-service accepts customer orders over HTTP and charges them through an
external payments provider without making the caller wait for the charge. An
order is stored as `pending`, a payment job is queued in Redis, and a separate
worker process charges it and records `paid` or `failed`.

Key capabilities:

- `POST /orders` creates an order and returns `202 Accepted` immediately (`src/server.js:25-33`).
- `GET /orders/:id` returns the order and its current payment status (`src/server.js:35-39`).
- Asynchronous charging with retries on provider outages (`src/worker.js:8-21`).
- `GET /healthz` reports database reachability (`src/server.js:19-22`).

It does not manage customers, refunds or inventory, and it has no user-facing UI.

## Architecture

[Architecture diagram](diagrams/architecture.drawio)

[Interactive architecture diagram](diagrams/architecture.html)

The service runs as two processes from one codebase, sharing PostgreSQL and Redis:

| Component | Responsibility | Technology | Code |
|---|---|---|---|
| API server | Authenticates requests, validates input, stores orders, enqueues payment jobs | Node.js `node:http` on port 8080 | `src/server.js:17-47` |
| Payment worker | Pops jobs, charges orders, records the outcome, retries provider errors | Node.js loop | `src/worker.js:8-27` |
| PostgreSQL | Source of truth for orders and their status | `pg` pool, max 10 connections | `src/db.js:4` |
| Redis list `orders:payment-jobs` | Payment job queue between API and worker | `redis` client, `LPUSH` / `BRPOP` | `src/queue.js:4-16` |
| Payments provider | Charges the order amount | HTTPS `POST /v1/charges` | `src/payments.js:4-13` |

Trust boundary: every route except `/healthz` requires the shared `x-api-key`
header (`src/server.js:23`). The payments provider is external; its URL comes
from `PAYMENTS_URL`.

## Prerequisites

- Node.js 20 or newer (`package.json` `engines`, `Dockerfile` uses `node:20-alpine`).
- PostgreSQL 16 and Redis 7 (versions used by `docker-compose.yml`), or Docker with Compose to run them locally.
- `psql` on your PATH for the migration script.
- A payments provider endpoint (or sandbox) reachable at `PAYMENTS_URL`.

## Installation and setup

1. Install dependencies:

   ```bash
   npm ci
   ```

2. Start PostgreSQL and Redis (or point the variables below at existing instances):

   ```bash
   docker compose up -d postgres redis
   ```

3. Export configuration (see [Configuration](#configuration)):

   ```bash
   export DATABASE_URL=postgres://postgres:orders@localhost:5432/orders
   export REDIS_URL=redis://localhost:6379
   export API_KEY=dev-key
   export PAYMENTS_URL=http://localhost:9000
   ```

4. Create the schema:

   ```bash
   npm run migrate
   ```

5. Start the API and the worker in two terminals:

   ```bash
   npm start          # prints: orders-service listening on :8080
   npm run worker     # prints: payment worker started
   ```

Alternatively run everything with `docker compose up --build`; the compose file
starts `api` and `worker` with development settings.

## Configuration

All configuration is read from environment variables once at startup
(`src/config.js:8-15`). Missing required variables stop the process with
`Missing required environment variable <NAME>` (`src/config.js:2-6`).

| Variable | Required | Default | Purpose | Read at |
|---|---|---|---|---|
| `DATABASE_URL` | yes | — | PostgreSQL connection string | `src/config.js:10` |
| `API_KEY` | yes | — | Shared secret clients send as `x-api-key` | `src/config.js:12` |
| `PAYMENTS_URL` | yes | — | Base URL of the payments provider | `src/config.js:13` |
| `REDIS_URL` | no | `redis://localhost:6379` | Redis used for the payment job queue | `src/config.js:11` |
| `PORT` | no | `8080` | HTTP port of the API server | `src/config.js:9` |
| `MAX_PAYMENT_ATTEMPTS` | no | `3` | Charge attempts before an order is marked failed on provider errors | `src/config.js:14` |

> [!WARNING]
> `API_KEY` is a single shared secret compared in plain text. Rotate it by
> restarting both processes with the new value; there is no key list.

## Usage

Create an order (amount in cents, currency defaults to `USD`):

```bash
curl -s -X POST localhost:8080/orders \
  -H 'x-api-key: dev-key' -H 'content-type: application/json' \
  -d '{"customerId":"c-42","amountCents":1999}'
```

The response is `202` with the stored row, `status: "pending"`. Poll the order
until the worker has charged it:

```bash
curl -s localhost:8080/orders/1 -H 'x-api-key: dev-key'
```

`status` becomes `paid`, or `failed` with `failure_reason` set to the
provider's decline code or the last provider error.

| Response | Meaning |
|---|---|
| `400` | `customerId` missing or `amountCents` not a positive integer (`src/server.js:27-29`) |
| `401` | Missing or wrong `x-api-key` (`src/server.js:23`) |
| `404` | Unknown order or route (`src/server.js:38-40`) |
| `500` | Unexpected error; details are logged to stderr (`src/server.js:41-44`) |

## How it works

### Order creation

[Order creation and payment sequence](diagrams/order-payment-flow.drawio)

[Interactive sequence diagram](diagrams/order-payment-flow.html)

1. The API checks `x-api-key` before routing; only `/healthz` is exempt (`src/server.js:19-23`).
2. `POST /orders` parses JSON and validates `customerId` and `amountCents` (`src/server.js:25-29`).
3. `insertOrder` writes a row with `status = 'pending'` and returns it (`src/db.js:6-13`).
4. `enqueuePayment` pushes `{ orderId, attempt: 1 }` onto the Redis list `orders:payment-jobs` (`src/queue.js:8-10`).
5. The API responds `202` with the pending order (`src/server.js:32`).

The order is committed before the job is queued. If Redis is unavailable at
that moment the client gets `500` while a `pending` order remains without a job;
see [Troubleshooting](#troubleshooting).

### Payment processing

1. The worker blocks on `BRPOP` for up to 5 seconds per poll (`src/queue.js:13-16`, `src/worker.js:24-27`).
2. It reloads the order and skips it unless it is still `pending`, which makes duplicate jobs harmless (`src/worker.js:9-10`).
3. `charge` calls `POST {PAYMENTS_URL}/v1/charges` with an `idempotency-key` of `order-<id>`, so a retried charge is not billed twice by a provider that honours the key (`src/payments.js:4-9`).
4. A `succeeded` response sets `paid`; any other response sets `failed` with the decline code (`src/payments.js:11-12`, `src/worker.js:12-13`).
5. A provider `5xx` or network error throws. The job is re-queued with `attempt + 1` until `MAX_PAYMENT_ATTEMPTS`, then the order is marked `failed` with the error message (`src/worker.js:14-19`). Retries are immediate; there is no backoff.

### Data model

One table, `orders` (`migrations/001_orders.sql:1-10`): `id` (bigserial), `customer_id`,
`amount_cents` (positive), `currency` (3 letters, default `USD`), `status`
(`pending`, `paid`, `failed`), `failure_reason`, `created_at`, `updated_at`.
`orders_customer_idx` indexes `customer_id` (`migrations/001_orders.sql:11`).

## Deployment and operations

- **Build:** the `Dockerfile` installs production dependencies and runs `node src/server.js` on port 8080 (`Dockerfile:1-8`). Run the worker from the same image with `node src/worker.js`, as `docker-compose.yml` does.
- **Health check:** `GET /healthz` runs `SELECT 1`; it fails with `500` when PostgreSQL is unreachable (`src/server.js:19-22`, `src/db.js:27-29`). It does not check Redis or the worker.
- **Scaling:** API instances are stateless. Several workers can share the queue because `BRPOP` hands each job to one worker and the `pending` check skips orders already handled.
- **Logs:** both processes log to stdout/stderr; unexpected API errors are printed with `console.error` (`src/server.js:42`).
- **Deploy target:** the repository contains no production deployment manifests; `docker-compose.yml` is for local development only.

## Troubleshooting

| Symptom | Likely cause | How to confirm | Fix |
|---|---|---|---|
| Process exits with `Missing required environment variable` | `DATABASE_URL`, `API_KEY` or `PAYMENTS_URL` unset | Error names the variable | Export it and restart |
| All requests return `401` | Client key differs from `API_KEY` | Compare the `x-api-key` header with the server environment | Send the configured key |
| Orders stay `pending` | Worker not running, or it cannot reach Redis | No `payment worker started` log; `LLEN orders:payment-jobs` keeps growing | Start `npm run worker`; check `REDIS_URL` |
| `pending` order with no queued job | Redis failed after the insert (`src/server.js:30-31`) | `LRANGE orders:payment-jobs 0 -1` lacks the id | Re-queue: `LPUSH orders:payment-jobs '{"orderId":<id>,"attempt":1}'` |
| Many orders `failed` with `payment error after N attempts` | Payments provider outage | `failure_reason` text; provider status page | After recovery, set affected orders back to `pending` and re-queue them |
| `/healthz` returns `500` | PostgreSQL unreachable | API logs show the connection error | Check `DATABASE_URL` and database availability |

## Source map

| Path | Responsibility |
|---|---|
| `src/server.js` | HTTP routes, API-key check, validation |
| `src/worker.js` | Payment job loop and retry policy |
| `src/payments.js` | Payments provider client |
| `src/db.js` | PostgreSQL queries |
| `src/queue.js` | Redis job queue |
| `src/config.js` | Environment configuration |
| `migrations/001_orders.sql` | Database schema |
| `Dockerfile`, `docker-compose.yml` | Container image and local stack |

To add an endpoint, extend the router in `src/server.js:17-45`. To change retry
behaviour, edit `src/worker.js:14-19` and `MAX_PAYMENT_ATTEMPTS`.

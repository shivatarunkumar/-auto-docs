# orders-service

Accepts orders over HTTP and charges them asynchronously through the payments provider.

<!-- autodocs:start -->
## Overview

orders-service accepts orders over HTTP and charges them asynchronously through
an external payments provider, so callers never wait for the charge.

- `POST /orders` stores a `pending` order and returns `202` (`src/server.js:25-33`)
- A separate worker charges each order and records `paid` or `failed` (`src/worker.js:8-21`)
- Provider outages are retried up to `MAX_PAYMENT_ATTEMPTS` times

## Architecture

![Architecture](docs/autodocs/diagrams/architecture.png)

[Interactive diagram](docs/autodocs/diagrams/architecture.html) · [draw.io](docs/autodocs/diagrams/architecture.drawio)

- **API server** (`src/server.js`) checks `x-api-key`, validates input, inserts the order into PostgreSQL and pushes a job onto the Redis list `orders:payment-jobs`.
- **Payment worker** (`src/worker.js`) pops jobs, calls the payments provider with an idempotency key, and updates the order status.
- **PostgreSQL** holds the `orders` table; **Redis** is only the job queue.

## Quick start

Requires Node.js 20+, plus PostgreSQL and Redis (Docker Compose provides both).

```bash
npm ci
docker compose up -d postgres redis
export DATABASE_URL=postgres://postgres:orders@localhost:5432/orders API_KEY=dev-key PAYMENTS_URL=http://localhost:9000
npm run migrate
npm start            # API on :8080
npm run worker       # in a second terminal
```

## Configuration

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | yes | — | PostgreSQL connection string |
| `API_KEY` | yes | — | Shared secret clients send as `x-api-key` |
| `PAYMENTS_URL` | yes | — | Payments provider base URL |
| `REDIS_URL` | no | `redis://localhost:6379` | Job queue |
| `PORT` | no | `8080` | API port |
| `MAX_PAYMENT_ATTEMPTS` | no | `3` | Charge attempts on provider errors |

## Usage

```bash
curl -s -X POST localhost:8080/orders -H 'x-api-key: dev-key' \
  -H 'content-type: application/json' -d '{"customerId":"c-42","amountCents":1999}'
curl -s localhost:8080/orders/1 -H 'x-api-key: dev-key'   # status: pending → paid | failed
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| Exits with `Missing required environment variable` | Export the named variable |
| Every request returns `401` | Send the configured `API_KEY` as `x-api-key` |
| Orders stay `pending` | Start the worker (`npm run worker`) and check `REDIS_URL` |

## Documentation

Full runbook: [docs/autodocs/runbook.md](docs/autodocs/runbook.md) · Diagrams: [docs/autodocs/diagrams/](docs/autodocs/diagrams/README.md)
<!-- autodocs:end -->

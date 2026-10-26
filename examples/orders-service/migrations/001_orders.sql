CREATE TABLE IF NOT EXISTS orders (
  id             BIGSERIAL PRIMARY KEY,
  customer_id    TEXT        NOT NULL,
  amount_cents   INTEGER     NOT NULL CHECK (amount_cents > 0),
  currency       CHAR(3)     NOT NULL DEFAULT 'USD',
  status         TEXT        NOT NULL CHECK (status IN ('pending', 'paid', 'failed')),
  failure_reason TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_customer_idx ON orders (customer_id);

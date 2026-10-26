// Reads all runtime configuration from the environment once at startup.
function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 8080),
  databaseUrl: required('DATABASE_URL'),
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  apiKey: required('API_KEY'),
  paymentsUrl: required('PAYMENTS_URL'),
  maxPaymentAttempts: Number(process.env.MAX_PAYMENT_ATTEMPTS ?? 3),
};

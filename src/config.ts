export const env = {
  LH_DATA_DIR: process.env.LH_DATA_DIR,
  LH_BASE_URL: process.env.LH_BASE_URL,
  LH_DEFAULT_CHANNEL: process.env.LH_DEFAULT_CHANNEL ?? 'stable',
  LH_FRONTEND_ORIGIN: process.env.LH_FRONTEND_ORIGIN,
  LH_ENABLE_API: process.env.LH_ENABLE_API !== 'false',
  LH_ENABLE_FRONTEND_SSR: process.env.LH_ENABLE_FRONTEND_SSR !== 'false',
  PORT: process.env.PORT,
}

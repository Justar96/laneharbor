export const env = {
  LH_DATA_DIR: process.env.LH_DATA_DIR,
  LH_BASE_URL: process.env.LH_BASE_URL,
  LH_DEFAULT_CHANNEL: process.env.LH_DEFAULT_CHANNEL ?? 'stable',
  PORT: process.env.PORT,
}

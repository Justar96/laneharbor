# LaneHarbor - Bun + Hono + Remix
FROM oven/bun:1 as base

WORKDIR /app

# Install dependencies first (leverage Docker cache)
COPY package.json ./package.json
RUN bun install --frozen-lockfile || bun install

# Copy source and Remix app
COPY tsconfig.json ./tsconfig.json
COPY vite.config.ts ./vite.config.ts
COPY remix.config.ts ./remix.config.ts
COPY src ./src
COPY app ./app
# Optional local dev storage for container testing (not used in prod)
COPY storage ./storage

# Build Remix app for production
RUN bun run build

ENV LH_DATA_DIR=/data
ENV NODE_ENV=production

EXPOSE 3000
CMD ["bun", "run", "src/app.ts"]

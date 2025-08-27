# LaneHarbor - Bun + Hono
FROM oven/bun:1 as base

WORKDIR /app

# Install dependencies first (leverage Docker cache)
COPY package.json ./package.json
RUN bun install --frozen-lockfile || bun install

# Copy source
COPY tsconfig.json ./tsconfig.json
COPY src ./src
# Optional local dev storage for container testing (not used in prod)
COPY storage ./storage

ENV LH_DATA_DIR=/data

EXPOSE 3000
CMD ["bun", "run", "src/app.ts"]

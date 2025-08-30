FROM node:20-alpine

# Install dumb-init for proper signal handling in containers
RUN apk add --no-cache dumb-init

# Create app directory
WORKDIR /app

# Copy package files first for better Docker layer caching
COPY package.json ./

# Install ALL dependencies first (needed for build)
# Use npm install since we may not have package-lock.json in monorepo setup
RUN npm install

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Remove dev dependencies after build to optimize image size
RUN npm prune --production

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S laneharbor -u 1001

# Change ownership of the app directory
RUN chown -R laneharbor:nodejs /app
USER laneharbor

# Expose the port that the app runs on
EXPOSE 8787

# Add health check for Docker/Railway - use /health to match railway.json
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8787/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the service
CMD ["npm", "start"]

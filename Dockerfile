# Optional container image for self-hosting this stdio MCP server (docker run -i -p 8888:8888).
# Smithery distributes this server as an MCPB bundle and does not build this file.
# The container cannot open a browser: visit the login URL it prints to stderr.
# Build stage
FROM node:lts-alpine AS build
WORKDIR /app

# Copy dependency manifests and TypeScript config
COPY package.json package-lock.json tsconfig.json ./

# Copy TypeScript source files and public assets
COPY *.ts ./
COPY public ./public

# Install dependencies and build
RUN npm install
RUN npm run build

# Runtime stage
FROM node:lts-alpine AS runtime
WORKDIR /app

# Copy built artifacts and production modules
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/public ./public

# --- START SECURITY FIX ---
# 1. Create a dedicated group and user with no privileges
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser

# 2. Change the ownership of the application files to the new user
RUN chown -R appuser:appgroup /app

# 3. Switch to the non-root user
USER appuser
# --- END SECURITY FIX ---

# Expose port for Spotify auth callback
# The OAuth callback listens on loopback by default; widen it so -p 8888:8888 reaches it.
ENV AUTH_BIND_HOST=0.0.0.0
EXPOSE 8888

# Default command to start the MCP server
CMD ["node", "build/index.js"]

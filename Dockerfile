# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Build
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install dependencies (ci = clean install, faster and reproducible)
RUN npm ci --legacy-peer-deps

# Copy source code
COPY . .

# Build for production
RUN npx ng build --configuration production --no-progress

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Serve with nginx
# ─────────────────────────────────────────────────────────────────────────────
FROM nginx:1.25-alpine AS runtime

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/crm.conf

# Copy built Angular app from builder stage
COPY --from=builder /app/dist/crm/browser /usr/share/nginx/html

# Copy entrypoint script that injects runtime env vars
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost/health || exit 1

# Use entrypoint to inject env vars, then start nginx
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]

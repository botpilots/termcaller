# Stage 1: Build the frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Build the backend and serve
FROM node:22-alpine
WORKDIR /app

# Build tools for ImageMagick + Ghostscript for gm PDF rendering
RUN apk add --no-cache imagemagick ghostscript openssl

# Copy root package.json if it exists (optional, helps with workspaces)
COPY package*.json ./

# Setup backend
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci

# Copy backend source
COPY backend/ ./

# Generate Prisma Client and run migrations
RUN npx prisma generate

# Copy frontend dist to where backend expects it
# The backend index.ts expects frontend dist at ../../frontend/dist relative to backend/src
# In the container, backend is at /app/backend, so we'll put frontend dist at /app/frontend/dist
WORKDIR /app/frontend
COPY --from=frontend-builder /app/frontend/dist ./dist

# Switch back to backend to run
WORKDIR /app/backend

# We'll override the database URL at runtime
ENV PORT=8080

EXPOSE 8080

# Deploy DB schema before starting the server
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx src/index.ts"]

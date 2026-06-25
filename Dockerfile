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

# Build tools for better-sqlite3; ImageMagick + Ghostscript for gm PDF rendering
RUN apk add --no-cache python3 make g++ sqlite imagemagick ghostscript

# Copy root package.json if it exists (optional, helps with workspaces)
COPY package*.json ./

# Setup backend
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci

# Copy backend source
COPY backend/ ./

# Generate Prisma Client
RUN npx prisma generate

# Build backend (if using tsc) or we can use tsx for simpler deployment
# We'll use tsx in production for this hackathon setup for simplicity, 
# or you can add a build step here.

# Copy frontend dist to where backend expects it
# The backend index.ts expects frontend dist at ../../frontend/dist relative to backend/src
# In the container, backend is at /app/backend, so we'll put frontend dist at /app/frontend/dist
WORKDIR /app/frontend
COPY --from=frontend-builder /app/frontend/dist ./dist

# Switch back to backend to run
WORKDIR /app/backend

# The volume mount will be at /mnt/data
# We'll override the database URL at runtime
ENV DATABASE_URL="file:/mnt/data/database.sqlite"
ENV PORT=8080

EXPOSE 8080

# For production, it's better to build TS to JS, but tsx works well for hackathons
CMD ["npx", "tsx", "src/index.ts"]

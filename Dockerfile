# ==============================================================
# Mirror.ng — Single image for Fly.io deployment
# Builds frontend + backend together
# ==============================================================

# --- Stage 1: Build frontend ---
FROM node:20-slim AS frontend-builder
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# --- Stage 2: Build backend + serve everything ---
FROM python:3.11-slim

WORKDIR /app

# Install backend dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

# Copy backend code
COPY backend/ .

# Copy built frontend into backend's frontend/dist directory
COPY --from=frontend-builder /app/dist /app/frontend/dist

# Set environment for production
ENV PYTHONUNBUFFERED=1
ENV CORS_ORIGINS=https://mirror-ng.fly.dev,http://localhost:3000,http://localhost:5173,http://localhost:80
ENV FRONTEND_URL=https://mirror-ng.fly.dev

EXPOSE 8080

CMD ["gunicorn", "app.main:app", "--worker-class", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8080", "--workers", "2", "--timeout", "120"]

# Build do frontend
FROM node:22-slim AS web
WORKDIR /app/frontend
COPY frontend/package.json ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# Runtime: Python + yt-dlp opcional
FROM python:3.13-slim
ARG WITH_YTDLP=1
ENV PYTHONUNBUFFERED=1 INSTASAVE_HOST=0.0.0.0 INSTASAVE_PORT=8000 INSTASAVE_STATIC_DIR=/app/frontend/dist
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt \
 && if [ "$WITH_YTDLP" = "1" ]; then pip install --no-cache-dir yt-dlp; fi
COPY backend/instasave backend/instasave
COPY --from=web /app/frontend/dist frontend/dist
RUN useradd -m app && chown -R app /app
USER app
WORKDIR /app/backend
EXPOSE 8000
CMD ["python", "-m", "instasave"]

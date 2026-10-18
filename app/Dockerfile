FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# Copies backend/, frontend/ and, if present, a pre-warmed OpenAlex .cache/ so the demo query is instant.
COPY . .
RUN mkdir -p /app/.cache
ENV CACHE_DIR=/app/.cache PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT}"]

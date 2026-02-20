FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy source code first (needed for editable install)
COPY src/ src/
COPY pyproject.toml .

# Install Python dependencies
RUN pip install --no-cache-dir .

# Expose FastAPI port
EXPOSE 8000

RUN useradd -m -r appuser && chown -R appuser:appuser /app
USER appuser

CMD ["uvicorn", "src.api.server:app", "--host", "0.0.0.0", "--port", "8000"]

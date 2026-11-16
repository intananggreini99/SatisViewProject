FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY satisview_consumer ./satisview_consumer

RUN useradd --system --uid 10001 consumer
USER consumer

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["python", "-m", "satisview_consumer.healthcheck"]
CMD ["python", "-m", "satisview_consumer"]

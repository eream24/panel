FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends tzdata \
    && rm -rf /var/lib/apt/lists/*

ENV TZ=Asia/Tehran
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .
COPY static ./static
COPY fonts ./fonts

RUN mkdir -p /data

ENV LOG_PATH=/var/log/mosdns/mosdns.log \
    DB_PATH=/data/dns_panel.db \
    RETENTION_DAYS=30 \
    LOG_ARCHIVE_DIR=/log-archive \
    LOG_MAX_SIZE_MB=200 \
    PORT=8080 \
    PANEL_USERNAME=admin \
    PANEL_PASSWORD=changeme

EXPOSE 8080

CMD ["python", "app.py"]

# SMP-Kit Trust Backend – abhängigkeitsfrei (nur Python-Standardbibliothek).
FROM python:3.12-slim

WORKDIR /app
COPY trust_server.py licensing.py /app/
COPY web/ /app/web/

# Datenverzeichnis für die SQLite-Datei (per Volume mounten, damit sie Restarts überlebt).
RUN mkdir -p /data && useradd -r -u 10001 smpkit && chown -R smpkit /data
USER smpkit

ENV SMPKIT_HOST=0.0.0.0 \
    SMPKIT_PORT=8080 \
    SMPKIT_DB=/data/trust.db

EXPOSE 8080

# Healthcheck über den /api/health-Endpunkt (kein curl nötig -> Python).
HEALTHCHECK --interval=30s --timeout=4s --retries=3 \
  CMD python3 -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/api/health').status==200 else 1)"

CMD ["python3", "trust_server.py"]

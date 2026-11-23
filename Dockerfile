# Stage 1: build the web app
FROM node:22-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# Stage 2: API + built site
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 HOST=0.0.0.0 PORT=7860
WORKDIR /app
COPY server/requirements.txt server/requirements.txt
RUN pip install --no-cache-dir -r server/requirements.txt
COPY server/ server/
COPY --from=web /web/dist web/dist
RUN useradd -m -u 1000 app && mkdir -p /app/server/data /app/server/models && chown -R app /app
USER app
EXPOSE 7860
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD python -c "import os,urllib.request,sys; r=urllib.request.urlopen('http://127.0.0.1:%s/api/health' % os.environ.get('PORT','7860')); sys.exit(0 if r.status==200 else 1)"
CMD ["python", "server/run.py"]

# PokT backend: FastAPI + ONNX classifier + OCR.
# Layout mirrors the repo (backend/ + outputs/ siblings) because
# backend/server.py resolves the model as ROOT/../outputs/best.onnx.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# opencv (via rapidocr) needs GUI/X system libs missing from slim.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 libsm6 libxext6 libxrender1 libxcb1 \
 && rm -rf /var/lib/apt/lists/*

COPY backend/requirements-server.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements-server.txt

COPY backend/server.py ./backend/
COPY outputs/best.onnx outputs/classes.txt ./outputs/

# Bake RapidOCR detection/recognition models into the layer so the first
# /ocr call doesn't download them onto ephemeral disk at runtime.
RUN python -c "from rapidocr_onnxruntime import RapidOCR; RapidOCR()"

EXPOSE 8000

# Render injects $PORT; default keeps `uvicorn server:app` local usage working.
CMD ["sh", "-c", "uvicorn backend.server:app --host 0.0.0.0 --port ${PORT:-8000} --app-dir /app"]

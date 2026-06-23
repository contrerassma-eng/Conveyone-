# Sorter eCATALOG — backend CadQuery/OpenCASCADE
FROM python:3.11-slim

# Librerías de runtime que OpenCASCADE (OCP) necesita
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 libglu1-mesa libxrender1 libxext6 libsm6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV CATALOG_CACHE=/data/cache
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]

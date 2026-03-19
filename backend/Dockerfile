FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxrender1 \
    libxext6 \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ /app/neurolens/backend/
COPY models/ /app/models/

ENV PYTHONPATH=/app

EXPOSE 8000

CMD ["uvicorn", "neurolens.backend.main:app", "--host", "0.0.0.0", "--port", "8000"]

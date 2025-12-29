FROM python:3.11-slim

WORKDIR /app

# Install minimal build deps for some scientific packages
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       build-essential \
       gcc \
       gfortran \
       libatlas-base-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt

RUN python -m pip install --upgrade pip setuptools wheel \
    && pip install --no-cache-dir -r /app/requirements.txt

COPY src/ /app/src/

WORKDIR /app

CMD ["python", "-u", "src/aws_jobs/compute_handler.py"]

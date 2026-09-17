FROM python:3.13-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY labels.py prepare_data.py train.py server.py ./
COPY models ./models

ENV HOST=0.0.0.0
ENV PORT=8091

EXPOSE 8091

CMD ["python", "server.py"]

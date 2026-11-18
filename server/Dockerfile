FROM    python:3.12-slim
WORKDIR /app
COPY    requirements.txt .
RUN     pip install --no-cache-dir -r requirements.txt && useradd --system matcha
COPY    server ./server
COPY    sql ./sql
USER    matcha
EXPOSE  8000
CMD     ["gunicorn", "--bind=0.0.0.0:8000", "--workers=2", "--threads=4", "server:create_app()"]

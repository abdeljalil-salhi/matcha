FROM    python:3.12-slim AS runtime
WORKDIR /app
COPY    requirements.txt .
RUN     pip install --no-cache-dir -r requirements.txt && useradd --system matcha
COPY    server ./server
COPY    sql ./sql
COPY    data ./data
USER    matcha
EXPOSE  8000
CMD     ["gunicorn", "--bind=0.0.0.0:8000", "--workers=2", "--threads=4", "server:create_app()"]

# Optional developer tools; normal application images stop at the runtime stage.
FROM runtime AS development
USER root
COPY requirements-dev.txt .
RUN pip install --no-cache-dir -r requirements-dev.txt
USER matcha

FROM docker:27-cli AS docker_cli
FROM development AS docker_tools
USER root
COPY --from=docker_cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker_cli /usr/local/libexec/docker/cli-plugins /usr/local/libexec/docker/cli-plugins
USER matcha

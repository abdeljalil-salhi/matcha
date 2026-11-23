FROM    node:26-alpine
WORKDIR /app/frontend
RUN     chown -R node:node /app
USER    node
COPY    --chown=node:node frontend/package.json frontend/package-lock.json ./
RUN     npm ci
COPY    --chown=node:node frontend/ ./
COPY    --chown=node:node data/places.json /app/data/places.json
EXPOSE  5173
CMD     ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

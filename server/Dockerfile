FROM node:20-alpine

RUN apk add --no-cache python3 make g++ bash

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

ENV PORT=4000
ENV DB_DIR=/data
ENV UPLOADS_DIR=/data/uploads
ENV NODE_ENV=production

RUN mkdir -p /data /data/uploads && \
    cp server/data/dairy-farm.db /data/dairy-farm.db 2>/dev/null || true

EXPOSE 4000

CMD ["bash", "-c", "mkdir -p /data /data/uploads && cp server/data/dairy-farm.db /data/dairy-farm.db 2>/dev/null || true && node src/index.js"]
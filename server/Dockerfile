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

RUN mkdir -p /data /data/uploads

EXPOSE 4000

CMD ["bash", "-c", "cp server/data/dairy-farm.db /data/ && cp server/data/dairy-farm.db-shm /data/ 2>/dev/null; cp server/data/dairy-farm.db-wal /data/ 2>/dev/null; mkdir -p /data/uploads && node src/index.js"]
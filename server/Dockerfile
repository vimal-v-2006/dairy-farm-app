FROM node:20-alpine

RUN apk add --no-cache python3 make g++

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

CMD ["node", "src/index.js"]
FROM ghcr.io/puppeteer/puppeteer:latest

WORKDIR /app

# 패키지 파일만 먼저 복사 — 둘 중 있는 것만 복사
COPY package*.json ./

RUN npm install

COPY . .

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome

CMD ["node", "server.js"]

FROM node:22-slim

# Puppeteer에 필요한 패키지 설치
RUN apt-get update && apt-get install -y \
  chromium \
  chromium-sandbox \
  fonts-liberation \
  libnss3 \
  libatk-bridge2.0-0 \
  libgtk-3-0 \
  libdrm2 \
  libxkbcommon0 \
  libgbm1 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

ENV CHROMIUM_PATH="/usr/bin/chromium"

EXPOSE 10000

CMD ["node", "server.js"]

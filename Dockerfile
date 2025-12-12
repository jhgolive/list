FROM node:20-slim

# 필수 라이브러리 설치
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-sandbox \
    fonts-noto-cjk \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH="/usr/bin/chromium-browser"
ENV PUPPETEER_SKIP_DOWNLOAD="true"

WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --production

COPY . .

EXPOSE 3000
CMD ["node", "server.js"]

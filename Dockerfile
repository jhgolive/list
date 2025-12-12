# 1. Node 베이스 이미지
FROM node:20-slim

# 2. 필요한 패키지 설치 (Chromium 포함)
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libasound2 \
    libnss3 \
    libxshmfence1 \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 3. Puppeteer 크롬 다운로드 건너뛰기
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# 4. 소스코드 복사
WORKDIR /app
COPY package*.json ./

# 5. 패키지 설치
RUN yarn install || npm install

# 6. 전체 코드 복사
COPY . .

# 7. 포트 노출
EXPOSE 10000

# 8. 서버 실행
CMD ["node", "server.js"]

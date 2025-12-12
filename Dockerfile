FROM ghcr.io/puppeteer/puppeteer:latest

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome

CMD ["node", "server.js"]

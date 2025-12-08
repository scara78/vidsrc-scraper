FROM ghcr.io/puppeteer/puppeteer:24.32.1

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true


WORKDIR /usr/src/app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

CMD ["node", "server.js"]

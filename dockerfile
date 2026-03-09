FROM node:20

WORKDIR /app

COPY . .

RUN npm install
RUN npx playwright install chromium

EXPOSE 9000

CMD ["node","server.js"]

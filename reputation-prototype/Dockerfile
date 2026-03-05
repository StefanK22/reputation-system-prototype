FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src
COPY docker ./docker

EXPOSE 7575 8080 9091

CMD ["npm", "run", "start:web"]

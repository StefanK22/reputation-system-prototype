FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG CANTON_USER_ID=operator-user
ENV CANTON_USER_ID=$CANTON_USER_ID
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "preview"]

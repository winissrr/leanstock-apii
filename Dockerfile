FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY prisma ./prisma
COPY src ./src
COPY tests ./tests
COPY scripts ./scripts
COPY openapi.yaml ./
COPY jest.config.js ./
COPY .env.example ./

RUN npx prisma generate

EXPOSE 8000
CMD ["npm", "run", "dev"]

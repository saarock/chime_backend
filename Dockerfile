FROM node:20

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY dist ./dist
COPY certs ./certs  

CMD ["node", "dist/index.js"]

FROM node:20

WORKDIR /app

# Install deps first (better caching)
COPY package*.json ./
RUN npm install

# Copy source + config + certs
COPY . .

# Build TS -> dist
RUN npm run build

# Start server
CMD ["node", "dist/index.js"]

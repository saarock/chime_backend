# Use official Node.js LTS image (includes npm)
FROM node:20-alpine

# Create app directory
WORKDIR /app

# Copy package files first for caching npm install layer
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install

# Copy all source files (including tsconfig.json, src folder)
COPY . .

# Build TypeScript to JavaScript (outputs to dist/)
RUN npx tsc

# Expose port your app listens on
EXPOSE 8000

# Start the app from compiled JS
CMD ["node", "dist/index.js"]

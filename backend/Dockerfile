FROM node:18-alpine

WORKDIR /app

# Install dependencies first
COPY package.json ./

# Install dependencies
RUN npm install --production

# Copy application code
COPY . .

# Create certs directory
RUN mkdir -p /app/certs

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "src/server.js"]

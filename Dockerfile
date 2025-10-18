FROM node:18-alpine

WORKDIR /app

# Copy package.json from backend
COPY backend/package*.json ./

# Install dependencies
RUN npm install --production

# Copy backend source code
COPY backend/src ./src
COPY backend/init.sql ./

# Create certs directory
RUN mkdir -p /app/certs

# Frontend will be mounted as volume at runtime

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "src/server.js"]

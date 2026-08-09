FROM node:22-alpine

# Install pg_dump (postgresql-client) so the backup script can run inside the container
RUN apk update && apk add --no-cache postgresql-client

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy the rest of the backend source code
COPY . .

# Expose the API port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]

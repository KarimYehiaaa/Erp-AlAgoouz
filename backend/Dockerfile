FROM node:24-alpine

# Install pg_dump (postgresql-client) so the backup script can run inside the container
RUN apk update && apk add --no-cache postgresql-client

WORKDIR /app

# Copy package files and install dependencies
COPY --chown=node:node package.json ./
RUN npm install --omit=dev

# Copy the rest of the backend source code
COPY --chown=node:node . .

# Expose the API port
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Run as non-root user
USER node

# Start the application
CMD ["npm", "start"]

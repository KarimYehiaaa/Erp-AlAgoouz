FROM node:24-alpine

WORKDIR /app

# Copy package manifests (npm workspaces) before installing so layers cache well
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node backend/package.json ./backend/
COPY --chown=node:node frontend/package.json ./frontend/

# Install all workspace dependencies from the root lockfile
RUN npm ci

# Copy the whole project
COPY --chown=node:node . .

# Build the frontend
RUN cd frontend && npm run build

# Flexible port support
ARG PORT=3000
ENV PORT=${PORT}
EXPOSE 3000

# Run the server as a non-root user (better security)
USER node

CMD ["npm", "start"]

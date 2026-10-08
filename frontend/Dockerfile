# Build with the repository root as context: docker build -f frontend/Dockerfile .
FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci --ignore-scripts
COPY frontend ./frontend/
COPY shared ./shared/
COPY tsconfig.json ./
RUN npm run build:local -w frontend

# Production Stage
FROM nginx:stable-alpine

COPY --from=build /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

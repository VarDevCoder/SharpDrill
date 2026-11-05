# --- Etapa 1: compilar el frontend React ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY web ./web
RUN npm run build

# --- Etapa 2: imagen de ejecución (API + frontend compilado) ---
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DB_FILE=/data/sharpdrill.db
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY --from=build /app/web/dist ./web/dist
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
EXPOSE 3000
USER node
CMD ["npm", "start"]

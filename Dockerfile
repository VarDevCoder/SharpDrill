FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DB_FILE=/data/sharpdrill.db
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY public ./public
VOLUME ["/data"]
EXPOSE 3000
CMD ["npm", "start"]

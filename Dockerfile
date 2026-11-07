# Vaani Studio: one container runs the API, the Telegram bot and the website.
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY client/package*.json client/
RUN npm --prefix client ci
COPY . .
RUN npm run build && rm -rf client/node_modules
ENV NODE_ENV=production PORT=3001 TRUST_PROXY=true
EXPOSE 3001
# Everything the app saves (accounts, videos, dubs, voice messages) lives in /app/work: mount a persistent disk there.
VOLUME ["/app/work"]
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:'+(process.env.PORT||3001)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.mjs"]

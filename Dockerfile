FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server.ts tsconfig.json ./
COPY lib ./lib
COPY vendor ./vendor
COPY data ./data
COPY public ./public
COPY scripts ./scripts
COPY tests ./tests
ENV NODE_ENV=production PORT=3100 DATA_DIR=/data SITE_ORIGIN=https://whoplaysnow.com
USER node
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 CMD node scripts/health.mjs
CMD ["node","--import","tsx","server.ts"]

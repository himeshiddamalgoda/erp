FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node src ./src

USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node --input-type=module -e "const response = await fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/api/health', { signal: AbortSignal.timeout(4000) }); process.exit(response.ok ? 0 : 1);"

CMD ["node", "src/server.js"]

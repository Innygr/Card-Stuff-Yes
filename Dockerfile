# Use the same Node.js major version as the CI container build.
FROM node:22-alpine

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=6565 \
    CSY_STATE_FILE=/app/private-data/multiplayer-state.json

WORKDIR /app

# The server uses only Node.js built-in modules; no npm install is required.
COPY --chown=node:node . .

# Multiplayer state is stored in a dedicated persistent volume.
RUN mkdir -p /app/private-data \
    && chown -R node:node /app

USER node

EXPOSE 6565

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:6565/multiplayer.html').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]

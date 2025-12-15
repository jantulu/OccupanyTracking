FROM node:18-alpine

RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    net-snmp-dev \
    net-snmp-libs \
    wget

WORKDIR /app

COPY package*.json ./

# Use npm install if package-lock.json doesn't exist
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev; \
    else \
      npm install --omit=dev; \
    fi

COPY server.js ./

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]

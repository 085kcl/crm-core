FROM node:22.13.0-bookworm-slim AS build

# Avoid /app: absolute Vite module IDs collide with this project's app/app tree.
WORKDIR /srv/crm-core

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN CRM_RUNTIME_TARGET=node npm run build

FROM node:22.13.0-bookworm-slim AS runtime

WORKDIR /srv/crm-core

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

# Only self-contained output, never the builder's node_modules.
COPY --from=build --chown=node:node /srv/crm-core/dist/standalone ./

USER node

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/crm',{redirect:'error',signal:AbortSignal.timeout(4000)}).then(r=>{if(r.status!==200||!r.headers.get('content-type')?.startsWith('text/html'))process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server.js"]

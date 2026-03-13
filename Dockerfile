# syntax=docker/dockerfile:1.7

FROM node:20.19.5-alpine3.20 AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json backend/package-lock.json ./backend/
COPY frontend/package.json frontend/package-lock.json ./frontend/

RUN npm ci \
  && npm ci --prefix backend \
  && npm ci --prefix frontend

FROM deps AS build
COPY . .
RUN npm run build:backend \
  && npm run build:frontend

FROM node:20.19.5-alpine3.20 AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=build /app/backend/package.json /app/backend/package.json
COPY --from=build /app/backend/package-lock.json /app/backend/package-lock.json
COPY --from=build /app/backend/dist /app/backend/dist
COPY --from=deps /app/backend/node_modules /app/backend/node_modules
COPY --from=build /app/frontend/dist /app/frontend/dist

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5000/health').then((r)=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

USER appuser
WORKDIR /app/backend
CMD ["node", "dist/index.js"]


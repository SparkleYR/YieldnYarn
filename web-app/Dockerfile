# Next.js web app (marketing site + buyer/admin/verifier dashboards).
# NEXT_PUBLIC_* values are compiled into the client bundle, so they're build args:
#   docker build -f web-app/Dockerfile \
#     --build-arg NEXT_PUBLIC_DJANGO_API_URL=https://api.example.com/api \
#     --build-arg NEXT_PUBLIC_FASTAPI_URL=https://compute.example.com/compute \
#     -t msme-web .
FROM node:22-alpine AS build
WORKDIR /app/web-app
RUN corepack enable
COPY web-app/package.json web-app/pnpm-lock.yaml web-app/pnpm-workspace.yaml ./
# `npm_ca`: optional CA bundle for TLS-intercepting proxies.
RUN --mount=type=secret,id=npm_ca,required=false \
    if [ -f /run/secrets/npm_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi; \
    pnpm install --frozen-lockfile
COPY web-app/ .
ARG NEXT_PUBLIC_DJANGO_API_URL=http://localhost:8000/api
ARG NEXT_PUBLIC_FASTAPI_URL=http://localhost:8001/compute
ENV NEXT_PUBLIC_DJANGO_API_URL=$NEXT_PUBLIC_DJANGO_API_URL \
    NEXT_PUBLIC_FASTAPI_URL=$NEXT_PUBLIC_FASTAPI_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=secret,id=npm_ca,required=false \
    if [ -f /run/secrets/npm_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi; \
    pnpm build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/web-app/.next/standalone ./
COPY --from=build /app/web-app/.next/static ./.next/static
COPY --from=build /app/web-app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]

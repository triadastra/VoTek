# syntax=docker/dockerfile:1

# Behind a TLS-inspecting proxy (corporate network, some CI sandboxes)? Pass your CA so
# npm trusts the registry, without baking it into the image:
#   docker build --secret id=ca,src=/path/to/ca-bundle.crt -t votek .
# On a normal network, build plainly: `docker build -t votek .`

# ---- Stage 1: build the web app ----
FROM node:22-slim AS web-build
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN --mount=type=secret,id=ca \
    sh -c 'if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; npm ci --no-audit --no-fund'
COPY web/ ./
RUN npm run build

# ---- Stage 2: broker runtime that also serves the built web app ----
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN --mount=type=secret,id=ca \
    sh -c 'if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; npm ci --omit=dev --no-audit --no-fund'
COPY server/ ./
# The broker serves static files from ./public (see WEB_DIST logic in index.js).
COPY --from=web-build /web/dist ./public

EXPOSE 8787
# GEMINI_API_KEY is passed at run time; without it the broker runs in mock mode.
CMD ["node", "index.js"]

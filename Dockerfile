# better-sqlite3 needs a native build toolchain to compile against this image's
# Node/libc. It's only needed at build time — the runtime stage just copies the
# already-compiled node_modules over.
FROM node:22-alpine AS build
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

EXPOSE 3000
ENV PORT=3000
CMD ["node", "build"]

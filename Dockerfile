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

# /api/stats is a cheap, side-effect-free read (server up + DB reachable) —
# good enough to answer "is this container actually working."
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
	CMD node -e "require('http').get({host:'127.0.0.1',port:process.env.PORT||3000,path:'/api/stats',timeout:3000},res=>process.exit(res.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "build"]

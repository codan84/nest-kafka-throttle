FROM node:22-alpine AS build

WORKDIR /build
COPY . /build

RUN npm ci

FROM node:22-alpine AS runtime

COPY --from=build /build/node_modules /app/node_modules
COPY --from=build /build/index.js /app/index.js
COPY --from=build /build/package.json /app/package.json

WORKDIR /app

ENTRYPOINT ["npm", "start"]

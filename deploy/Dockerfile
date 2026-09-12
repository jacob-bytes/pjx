# 构建前端产物
FROM node:22-alpine AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# 构建 master（嵌入前端）与 agent
FROM golang:1.24-alpine AS build
WORKDIR /src
RUN apk add --no-cache git
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=web /src/web/dist ./web/dist
RUN CGO_ENABLED=0 go build -tags embedweb -o /out/pjx-master ./cmd/master
RUN CGO_ENABLED=0 go build -o /out/pjx-agent ./cmd/agent

FROM alpine:3.20
RUN adduser -D -u 1000 pjx && mkdir -p /data && chown -R pjx /data
USER pjx
WORKDIR /data
COPY --from=build /out/pjx-master /usr/local/bin/pjx-master
COPY --from=build /out/pjx-agent /usr/local/bin/pjx-agent
EXPOSE 8080
VOLUME ["/data"]
ENTRYPOINT ["pjx-master"]
CMD ["-listen", "0.0.0.0:8080", "-data-dir", "/data"]

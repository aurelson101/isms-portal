FROM golang:1.26.10-alpine@sha256:27f2d3b83cfc5803c8078f8e730af0f7c431bf067afaec8f60a36fb763187cba AS helper
ENV GOTOOLCHAIN=local GOMAXPROCS=2 GOMEMLIMIT=768MiB
RUN apk add --no-cache git
WORKDIR /src
RUN git init && git remote add origin https://github.com/tianon/gosu.git \
    && git fetch --depth 1 origin 6456aaa0f3c854d199d0f037f068eb97515b7513 \
    && git checkout --detach FETCH_HEAD
RUN go mod edit -require=github.com/moby/sys/user@v0.4.1 -require=golang.org/x/sys@v0.44.0 \
    && CGO_ENABLED=0 go build -p 1 -mod=mod -trimpath -ldflags="-s -w" -o /out/gosu .

FROM postgres:17.11-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24
RUN apk upgrade --no-cache
COPY --from=helper /out/gosu /usr/local/bin/gosu

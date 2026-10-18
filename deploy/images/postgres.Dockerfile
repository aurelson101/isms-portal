FROM golang:1.26.9-alpine@sha256:3082400e369fa24d5fc60bca20edab3f6d604e0c5a690ec66b295eff4dd87ade AS helper
ENV GOTOOLCHAIN=local GOMAXPROCS=2 GOMEMLIMIT=768MiB
RUN apk add --no-cache git
WORKDIR /src
RUN git init && git remote add origin https://github.com/tianon/gosu.git \
    && git fetch --depth 1 origin 6456aaa0f3c854d199d0f037f068eb97515b7513 \
    && git checkout --detach FETCH_HEAD
RUN CGO_ENABLED=0 go build -p 1 -mod=readonly -trimpath -ldflags="-s -w" -o /out/gosu .

FROM postgres:17.11-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24
RUN apk upgrade --no-cache
COPY --from=helper /out/gosu /usr/local/bin/gosu

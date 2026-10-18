FROM golang:1.26.9-alpine@sha256:3082400e369fa24d5fc60bca20edab3f6d604e0c5a690ec66b295eff4dd87ade AS build
ENV GOTOOLCHAIN=local GOMAXPROCS=2 GOMEMLIMIT=768MiB
RUN apk add --no-cache git
WORKDIR /src
RUN git init && git remote add origin https://github.com/oauth2-proxy/oauth2-proxy.git \
    && git fetch --depth 1 origin tag v7.15.5 \
    && git checkout --detach FETCH_HEAD \
    && test "$(git rev-parse HEAD)" = bea3f04bf87b93f5354f392fe2216a88e6031350
RUN go mod edit -require=golang.org/x/net@v0.60.0 \
    && CGO_ENABLED=0 go build -p 1 -mod=mod -trimpath \
       -ldflags="-s -w -X github.com/oauth2-proxy/oauth2-proxy/v7/pkg/version.VERSION=7.15.5" -o /out/oauth2-proxy .

FROM quay.io/oauth2-proxy/oauth2-proxy:v7.15.5@sha256:8498b0d0ef0a7b29686414000a08aee467f02d0299c9ed1e006a8f33fc017916
COPY --from=build /out/oauth2-proxy /bin/oauth2-proxy

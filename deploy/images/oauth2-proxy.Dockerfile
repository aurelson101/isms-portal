FROM golang:1.26.10-alpine@sha256:27f2d3b83cfc5803c8078f8e730af0f7c431bf067afaec8f60a36fb763187cba AS build
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

FROM gcr.io/distroless/static-debian13:nonroot@sha256:d62067879de890a1def9da0e7766b7d20810a5e5555cef8506b752437d7a3e88
COPY --from=build /out/oauth2-proxy /bin/oauth2-proxy
ENTRYPOINT ["/bin/oauth2-proxy"]

FROM mcr.microsoft.com/dotnet/sdk:10.0.402-noble AS build
ENV DOTNET_CLI_TELEMETRY_OPTOUT=1
WORKDIR /src
COPY integrations/mip-reader/MipReader.csproj integrations/mip-reader/packages.lock.json ./
RUN dotnet restore MipReader.csproj --locked-mode
COPY integrations/mip-reader/Program.cs ./
RUN dotnet publish MipReader.csproj -c Release --no-restore -o /out

FROM mcr.microsoft.com/dotnet/aspnet:10.0.13-noble
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl libgsf-1-114 libssl3t64 libsecret-1-0 libgmime-3.0-0t64 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /out ./
ENV ASPNETCORE_URLS=http://+:8080 TMPDIR=/tmp MIP_WORK_ROOT=/tmp/mip
USER 1654:1654
ENTRYPOINT ["sh", "-c", "umask 077; exec dotnet MipReader.dll"]

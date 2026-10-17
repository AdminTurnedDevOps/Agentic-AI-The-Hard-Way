FROM golang:1.27.0-alpine3.23@sha256:3747dcba41c8b0db3211fda4db61638b980e17ac5bb3c94460a975a9cfe19395 AS builder
ARG TARGETARCH

WORKDIR /src
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download
COPY *.go ./
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux GOARCH=${TARGETARCH} go build -trimpath -o /out/kagent-hermes .

FROM ghcr.io/astral-sh/uv:0.12.3@sha256:2d890623d310b57771ce840f0da5eed5fc6d657da05ffaa45d82797b53fa3abc AS uv

FROM python:3.13.15-slim-trixie@sha256:9d2e5553305c7c7b0097999bb17187c69b921ccd6bc9d40e4bb5ebe652c00285

ARG VERSION=0.1.0
RUN apt-get update \
    && apt-get install -y --no-install-recommends bash ca-certificates git ripgrep xz-utils \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 65532 kagent \
    && useradd --uid 65532 --gid 65532 --home-dir /data --shell /usr/sbin/nologin kagent \
    && mkdir -p /data/hermes /data/workspace \
    && chown -R 65532:65532 /data

COPY --from=uv /uv /usr/local/bin/uv
COPY requirements.lock /tmp/requirements.lock
RUN uv venv /opt/hermes --python /usr/local/bin/python \
    && uv pip install --python /opt/hermes/bin/python --require-hashes -r /tmp/requirements.lock \
    && rm /tmp/requirements.lock

COPY --from=builder /out/kagent-hermes /usr/local/bin/kagent-hermes

ENV HERMES_HOME=/data/hermes \
    HOME=/data \
    PATH=/opt/hermes/bin:$PATH
WORKDIR /data/workspace
USER 65532:65532

LABEL org.opencontainers.image.source="https://github.com/AdminTurnedDevOps/Agentic-AI-The-Hard-Way" \
      org.opencontainers.image.description="Kagent BYO A2A runtime for Hermes Agent" \
      org.opencontainers.image.version="$VERSION"

ENTRYPOINT ["/usr/local/bin/kagent-hermes"]

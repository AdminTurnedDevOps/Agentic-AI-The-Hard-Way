FROM golang:1.27.4-alpine3.23@sha256:146e3b9c7c1e2ec3d3f5348c8a686151a75e1976e50efac9fc022ebe446a9a82 AS build
WORKDIR /src
COPY go.mod main.go ./
COPY web ./web
RUN CGO_ENABLED=0 go build -trimpath -o /workbench .

FROM scratch
COPY --from=build /workbench /workbench
ENV LISTEN_ADDR=:80 WORKSPACE_DIR=/workspace
EXPOSE 80
ENTRYPOINT ["/workbench"]

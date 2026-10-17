# Install Agent Substrate (Standalone)

This lab installs **raw** Agent Substrate: no kagent and no runtime on top. Everything after this lab talks to Substrate directly with `kubectl ate`.

You install from source, the way the Substrate project runs its own development and CI clusters:

- a local **kind** cluster with a local image registry
- every Substrate image built with **ko** and pushed to that registry
- PostgreSQL (the state store) and RustFS (S3-compatible snapshot storage) running in the cluster

> **Status:** Every command, flag, and file path in these labs was checked against the Substrate **v0.5.0** source (released 2026-10-14). The labs have **not** been run end to end on a cluster yet. Substrate is pre-1.0 and changes fast, so expect breaking changes between releases.

## Versions

| Component | Version |
| --- | --- |
| Agent Substrate | `v0.5.0` ([release](https://github.com/agent-substrate/substrate/releases/tag/v0.5.0)) |
| kind, ko | Pinned by the Substrate repo (`hack/tools/`) and run through `hack/run-tool.sh`, so you don't install them |
| Go | `1.27.0` (the version in Substrate's `go.mod`; `go` downloads it automatically when `GOTOOLCHAIN=auto`) |

## Prerequisites

- **Docker** (Docker Desktop, Colima, or Docker Engine on Linux).
- **Go**, any recent version. With `GOTOOLCHAIN=auto` (the default), it fetches Go 1.27.
- **git**, **kubectl**, **curl**, and **jq**.
- Enough memory for one kind node that runs the Substrate control plane, PostgreSQL, RustFS, Envoy, Prometheus, the OpenTelemetry Collector, and Jaeger. The install pulls about 570 MB of third-party images.

The micro-VM sandbox (the [hardware isolation lab](microvm.md)) also needs **`/dev/kvm`**, which only a Linux host (or a Linux VM with nested virtualization) has. Everything else works on macOS.

## Step 1: Clone Substrate at v0.5.0

The install scripts use `git rev-parse`, so this has to be a real clone, not a downloaded archive:

```bash
git clone --branch v0.5.0 https://github.com/agent-substrate/substrate.git
cd substrate
```

Every command in these labs runs from the root of this clone.

## Step 2: Create the kind cluster and local registry

> **Warning:** `hack/create-kind-cluster.sh` **deletes any existing kind cluster with the same name** before it creates a new one. The default name is `kind`. Set `KIND_CLUSTER_NAME` to use a different name.

```bash
export KIND_CLUSTER_NAME=substrate
hack/create-kind-cluster.sh
```

The script:

1. Starts a local registry container `kind-registry` on `localhost:5001`. Substrate images are pushed there.
2. Checks whether Docker can see `/dev/kvm`. If it can, it mounts `/dev/kvm` into the kind node so micro-VM workers work. If it can't, gVisor still works.
3. Creates a single-node cluster with the Pod Certificate APIs Substrate's `podcertcontroller` needs:

```yaml
featureGates:
  ClusterTrustBundle: true
  ClusterTrustBundleProjection: true
  PodCertificateRequest: true
runtimeConfig:
  "certificates.k8s.io/v1beta1": "true"
```

```bash
kubectl config current-context
kubectl api-versions | grep certificates.k8s.io/v1beta1
```

The context should be `kind-substrate`.

## Step 3: Install Substrate

```bash
hack/install-ate-kind.sh --deploy-ate-system --credential-provider='{"name":"k8s.io"}'
```

`install-ate-kind.sh` sets the kind defaults and then runs `hack/install-ate.sh`, which hands every action to Substrate's installer, `cmd/ate-setup`:

| Kind default | Value |
| --- | --- |
| `KO_DOCKER_REPO` | `localhost:5001` |
| `KO_DEFAULTPLATFORMS` | `linux/<your host's architecture>` |
| `BUCKET_NAME` | `ate-snapshots` (a bucket in the in-cluster RustFS) |
| `KUBECTL_CONTEXT` | `kind-${KIND_CLUSTER_NAME}` |

`--credential-provider='{"name":"k8s.io"}'` is **required**. It deploys the bundled Kubernetes Secrets credential provider, which the egress gateway uses to inject API keys into Actor traffic. It starts with an **empty, default-deny** namespace policy: no Actor can use any Secret until you grant it.

This install keeps the default dataplane for the router and egress gateway, **Envoy** (`--atenet-dataplane=envoy`). Every lab in this section is written for it, including request parking and the extra `ext_proc` authorization filter, which is Envoy-only. The alternative is `--atenet-dataplane=agentgateway`.

Every run prints the settings it used and where each value came from, and saves them to `~/.cache/ate-setup/installs/<context>.yaml`.

## Step 4: Install the `kubectl ate` plugin

```bash
go install ./cmd/kubectl-ate
kubectl ate --help
```

`go install` puts `kubectl-ate` in `$(go env GOPATH)/bin`. Make sure that directory is on your `PATH`, so `kubectl` finds the plugin.

`kubectl ate` finds ate-api-server on its own: it port-forwards to `svc/api` in `ate-system` for each command. Use `--endpoint` to point it somewhere else.

## Step 5: Verify

```bash
kubectl get pods -n ate-system
kubectl get pods -n podcertificate-controller-system
kubectl get pods -n otel-system
```

All pods should be `Running`:

| Namespace | Component | What it does |
| --- | --- | --- |
| `ate-system` | `ate-api-server` | The control plane. Owns Actor lifecycle and scheduling, backed by PostgreSQL |
| `ate-system` | `ate-controller` | Reconciles the Kubernetes CRDs (`WorkerPool` into a `Deployment`) |
| `ate-system` | `atelet` (DaemonSet) | Node supervisor: pulls images, builds OCI bundles, moves snapshots |
| `ate-system` | `atenet-router` | Ingress. Resumes suspended Actors on demand and routes traffic to them |
| `ate-system` | `atenet-egress` | Egress gateway. Every Actor's outbound traffic goes through it |
| `ate-system` | `k8s-credential-provider` | Reads Kubernetes Secrets for the egress gateway to inject |
| `ate-system` | `postgres` (StatefulSet) | The state store for Actors, Workers, atespaces, and ActorTemplates |
| `ate-system` | `rustfs` | S3-compatible snapshot storage |
| `podcertificate-controller-system` | `podcertificate-controller` | Issues the short-lived Pod Certificates that components use for mTLS |
| `otel-system` | `prometheus`, `opentelemetry-collector`, `jaeger` | Metrics, telemetry, and traces (used in the [observability lab](observability.md)) |

```bash
kubectl get crd | grep ate.dev
kubectl get sandboxconfig
kubectl ate get atespaces
```

You should see:

- the `workerpools.ate.dev`, `sandboxconfigs.ate.dev`, and `csidriverconfigs.ate.dev` CRDs
- a `gvisor-default` SandboxConfig
- an atespace listing, possibly empty

There's no `actortemplates.ate.dev` CRD in that list. **ActorTemplate still exists and is central to Substrate.** It moved out of Kubernetes into Substrate's own API (stored in PostgreSQL), and you manage it with `kubectl ate … actor-template`. The [first Actor lab](first-actor.md) creates one.

## GKE instead of kind

The same installer runs against GKE. The Substrate repo provisions the cluster, a GCS snapshot bucket, and the IAM bindings with `go run ./tools/setup-gcp bootstrap`, then installs with `./hack/install-ate.sh --deploy-ate-system --credential-provider='{"name":"k8s.io"}'`. Follow the "GKE Quickstart (Development)" section of the Substrate `README.md` at `v0.5.0`. The Pod Certificate beta APIs can only be enabled **when the cluster is created**, so don't reuse an existing cluster that lacks them.

## Clean up

Remove Substrate and every demo, but keep the cluster:

```bash
hack/install-ate-kind.sh --delete-all
```

Or delete the cluster and the local registry:

```bash
hack/delete-kind-cluster.sh
```

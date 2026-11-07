# Install Agent Substrate (Standalone)

This lab installs **raw** Agent Substrate: no kagent and no runtime on top. Everything after this lab talks to Substrate directly with `kubectl ate`.

You install from source, the way the Substrate project runs its own development and CI clusters:

- a local **kind** cluster with a local image registry
- every Substrate image built with **ko** and pushed to that registry
- PostgreSQL (the state store) and RustFS (S3-compatible snapshot storage) running in the cluster

> **Status:** Every command, flag, and file path in these labs was checked against the Substrate **v1.0.0** source. The labs have **not** been run end to end on a cluster yet.

## Versions

| Component | Version |
| --- | --- |
| Agent Substrate | `v1.0.0` ([release](https://github.com/agent-substrate/substrate/releases/tag/v1.0.0)) |
| kind, ko | Pinned by the Substrate repo (`hack/tools/`) and run through `hack/run-tool.sh`, so you don't install them |
| Go | `1.27.3` (the toolchain in Substrate's `go.mod`; `go` downloads it automatically when `GOTOOLCHAIN=auto`) |

## Prerequisites

- **Docker** (Docker Desktop, Colima, or Docker Engine on Linux).
- **Go**, any recent version. With `GOTOOLCHAIN=auto` (the default), it fetches Go 1.27.3.
- **git**, **kubectl**, **curl**, and **jq**.
- Enough memory for one kind node that runs the Substrate control plane, PostgreSQL, RustFS, Envoy, Prometheus, the OpenTelemetry Collector, and Jaeger. The install pulls about 570 MB of third-party images.

The micro-VM sandbox (the [hardware isolation lab](microvm.md)) also needs **`/dev/kvm`**, which only a Linux host (or a Linux VM with nested virtualization) has. Everything else works on macOS.

## Step 1: Clone Substrate at v1.0.0

The installer uses `git rev-parse`, so this has to be a real clone, not a downloaded archive:

```bash
git clone --branch v1.0.0 https://github.com/agent-substrate/substrate.git
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

Substrate's installer is `cmd/ate-setup`. `ATE_INSTALL_KIND=true` tells it to use its kind defaults. Set it, and keep `KIND_CLUSTER_NAME` set, in **every shell** that runs `ate-setup`:

```bash
export ATE_INSTALL_KIND=true

go run ./cmd/ate-setup deploy ate-system \
  --credential-provider='{"name":"k8s.io"}' \
  --ingress-allowed-spiffe-ids=spiffe://cluster.local/ns/ate-system/sa/atenet-client,spiffe://cluster.local/ns/ate-lab/sa/router-client
```

| Kind default | Value |
| --- | --- |
| `KO_DOCKER_REPO` | `localhost:5001` |
| `KO_DEFAULTPLATFORMS` | `linux/<your host's architecture>` |
| `BUCKET_NAME` | `ate-snapshots` (a bucket in the in-cluster RustFS) |
| `KUBECTL_CONTEXT` | `kind-${KIND_CLUSTER_NAME}` |

`--credential-provider='{"name":"k8s.io"}'` is **required**. It deploys the bundled Kubernetes Secrets credential provider, which the egress gateway uses to inject API keys into Actor traffic. It starts with an **empty, default-deny** namespace policy: no Actor can use any Secret until you grant it.

`--ingress-allowed-spiffe-ids` decides who can reach Actors. The router, `atenet-router`, only accepts **mTLS** connections, and only from clients whose certificate carries a SPIFFE ID on this list. Leave it unset and nothing can reach any Actor. This install allows two clients:

| SPIFFE ID | Client |
| --- | --- |
| `spiffe://cluster.local/ns/ate-system/sa/atenet-client` | `kubectl ate proxy actor`, which forwards a local port to one Actor |
| `spiffe://cluster.local/ns/ate-lab/sa/router-client` | The lab client pod you create in [Step 5](#step-5-create-the-lab-router-client), for labs that call many Actors |

Any client on the list can reach any Actor.

By default, the install also sets up the micro-VM sandbox class. It downloads the Kata and Cloud Hypervisor release assets from GitHub and stages them in RustFS, even when your machine has no `/dev/kvm`. Add `--sandbox-classes=gvisor` to skip that.

This install keeps the default dataplane for the router and egress gateway, **Envoy** (`--atenet-dataplane=envoy`). Every lab in this section is written for it, including request parking and the extra `ext_proc` authorization filter, which is Envoy-only. The alternative is `--atenet-dataplane=agentgateway`.

Every run prints the settings it used and where each value came from, and saves them under your user cache directory: `~/.cache/ate-setup/installs/<context>.yaml` on Linux, `~/Library/Caches/ate-setup/installs/<context>.yaml` on macOS.

> **Installing on a cloud cluster instead?** These labs are written for kind. For GKE or AKS, follow [Install Substrate on GKE](https://github.com/AdminTurnedDevOps/agentic-demo-repo/blob/main/substrate/install-and-setup/setup-gke.md) or [Install Substrate on AKS](https://github.com/AdminTurnedDevOps/agentic-demo-repo/blob/main/substrate/install-and-setup/setup-aks.md), then come back for Step 4. In either guide, append `,spiffe://cluster.local/ns/ate-lab/sa/router-client` to `ATE_INGRESS_ALLOWED_SPIFFE_IDS` before you deploy.

## Step 4: Install the `kubectl ate` plugin

```bash
go install ./cmd/kubectl-ate
kubectl ate --help
```

`go install` puts `kubectl-ate` in `$(go env GOPATH)/bin`. Make sure that directory is on your `PATH`, so `kubectl` finds the plugin.

`kubectl ate` finds ate-api-server on its own: it port-forwards to the `ate-api-server` pods in `ate-system` for each command. Use `--endpoint` to point it somewhere else.

**Who you are to Substrate.** ate-api-server checks every call against an authorization model (OpenFGA, embedded in ate-api-server). Without `--token-file`, `kubectl ate` calls as the `ate-client` ServiceAccount, which `ate-setup` makes a global **owner** so the demos work. That's fine for a lab, and wrong for a shared cluster. See `docs/guides/authorization.md` in the Substrate repo.

## Step 5: Create the lab router client

`kubectl ate proxy actor` is the easy way to reach **one** Actor:

```bash
kubectl ate proxy actor <actor> -a <atespace>     # serves 127.0.0.1:8000 -> the Actor's port 80
```

Several labs call many Actors in a loop, which would need one proxy per Actor. They use a client pod inside the cluster instead. It gets a client certificate for `spiffe://cluster.local/ns/ate-lab/sa/router-client` from Substrate's pod identity signer, plus the CA that signs the router's serving certificate, both through a projected volume:

```bash
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Namespace
metadata:
  name: ate-lab
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: router-client
  namespace: ate-lab
---
apiVersion: v1
kind: Pod
metadata:
  name: router-client
  namespace: ate-lab
spec:
  serviceAccountName: router-client
  containers:
  - name: curl
    image: curlimages/curl:8.23.0
    command: ["sleep", "infinity"]
    volumeMounts:
    - name: router-client
      mountPath: /run/router-client
      readOnly: true
  volumes:
  - name: router-client
    projected:
      sources:
      - podCertificate:
          signerName: podidentity.podcert.ate.dev/identity
          keyType: ECDSAP256
          credentialBundlePath: credential-bundle.pem
      - clusterTrustBundle:
          signerName: servicedns.podcert.ate.dev/identity
          labelSelector:
            matchLabels:
              podcert.ate.dev/canarying: live
          path: router-ca.pem
EOF
kubectl wait -n ate-lab --for=condition=Ready pod/router-client --timeout=120s
```

Then define `ate_curl`, a shell function the later labs use. It runs `curl` in that pod against the router's mTLS port, with the `ate-target-actor` header that picks the Actor:

```bash
ate_curl() {    # ate_curl <atespace>/<actor> [curl options...]
  local target=$1; shift
  kubectl exec -n ate-lab router-client -- curl -sS \
    --cacert /run/router-client/router-ca.pem \
    --cert /run/router-client/credential-bundle.pem \
    --key /run/router-client/credential-bundle.pem \
    -H "ate-target-actor: ${target}" "$@" \
    https://atenet-router.ate-system.svc/
}
```

> Define `ate_curl` again in every new shell. The labs that need it say so.

`credential-bundle.pem` holds the private key and the certificate chain, so the same file serves `--cert` and `--key`. The kubelet renews the certificate before it expires.

## Step 6: Verify

```bash
kubectl get pods -n ate-system
kubectl get pods -n podcertificate-controller-system
kubectl get pods -n otel-system
```

All pods should be `Running`:

| Namespace | Component | What it does |
| --- | --- | --- |
| `ate-system` | `ate-api-server` | The control plane. Owns Actor lifecycle and scheduling, backed by PostgreSQL, and authorizes every call with its embedded OpenFGA |
| `ate-system` | `ate-idp-server` | Publishes the keys that verify Actor JWTs, the identity tokens Actors present to other services |
| `ate-system` | `ate-controller` | Reconciles the Kubernetes CRDs (`WorkerPool` into a `Deployment`) |
| `ate-system` | `atelet` (DaemonSet) | Node supervisor: pulls images, builds OCI bundles, moves snapshots |
| `ate-system` | `atenet-router` | Ingress. Accepts mTLS from allowlisted clients, resumes suspended Actors on demand, and routes traffic to them |
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

- the `workerpools.ate.dev`, `sandboxconfigs.ate.dev`, and `csidriverconfigs.ate.dev` CRDs, served as `ate.dev/v1`
- the `gvisor-default` and `microvm` SandboxConfigs (only `gvisor-default` if you passed `--sandbox-classes=gvisor`)
- an atespace listing, possibly empty

There's no `actortemplates.ate.dev` CRD in that list. **ActorTemplate still exists and is central to Substrate.** It lives in Substrate's own API (stored in PostgreSQL), and you manage it with `kubectl ate … actor-template`. The [first Actor lab](first-actor.md) creates one.

## Clean up

Remove every demo and then Substrate, but keep the cluster:

```bash
kubectl delete namespace ate-lab
go run ./cmd/ate-setup delete all
```

Or delete the cluster and the local registry:

```bash
hack/delete-kind-cluster.sh
```

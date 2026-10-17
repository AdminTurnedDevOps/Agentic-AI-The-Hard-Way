# Install kagent and Agent Substrate

These steps install both kagent and Agent Substrate.

**Please note:** [Agent Substrate](https://github.com/agent-substrate/substrate) and kagent 1.0 move fast. Expect changes, upgrades, and new objects between releases.

In kagent 1.0, Substrate is not optional. Every Agent runs as a Substrate Actor, and no Agent gets a Deployment. kagent keeps sessions, A2A history, and lifecycle state in PostgreSQL. kagent, Substrate, and PostgreSQL authenticate to each other with Kubernetes Pod Certificates.

The `kagent install` command sets all of this up in one step.

## Versions

| Component | Version |
| --- | --- |
| kagent CLI | `v1.0.0-alpha14` |
| kagent Helm charts (`kagent`, `kagent-crds`) | `1.0.0-alpha14`, from `oci://ghcr.io/kagent-dev/kagent/helm/` |
| Substrate Helm charts (`substrate`, `substrate-crds`, `substrate-podcert`) | `0.5.0-alpha2`, from `oci://ghcr.io/kagent-dev/substrate/helm/` |
| Worker image | `ghcr.io/kagent-dev/substrate/ateom-gvisor:v0.5.0-alpha2` |
| Development PostgreSQL | `postgres:18-alpine` (the CLI pins it by digest) |

Each kagent release pins one Substrate version. `kagent v1.0.0-alpha14` pins `github.com/kagent-dev/substrate v0.5.0-alpha2`. The Substrate Helm charts come from the **kagent-dev** fork; the upstream `agent-substrate/substrate` repo does not publish them.

## Prerequisites

### Tools

| Tool | Version |
| --- | --- |
| minikube | v1.39.0 |
| Kubernetes | v1.37.0 |
| kubectl | v1.37.1 |
| Helm | v4.2.0 (any Helm with OCI support, v3.8 or later, works) |
| jq | 1.8.1 |
| `kagent` CLI | `v1.0.0-alpha14` (installed in Step 1) |

> An earlier version of this lab used kagent `1.0.0-alpha7` and Substrate `0.3.0-alpha3` with these cluster tool versions. The kagent and Substrate steps below are for `1.0.0-alpha14`. They were checked against the published charts and the kagent source, but have not yet been re-run end to end on minikube.

You no longer need the `kubectl ate` plugin. `kagent install` creates the CA pools and identity secrets that the plugin used to create.

### Cluster requirements

Substrate's `podcertificate-controller` creates `ClusterTrustBundle` objects with the `certificates.k8s.io/v1beta1` API. A default Kubernetes v1.37 cluster only serves `certificates.k8s.io/v1`, so a plain `minikube start` isn't enough. Without `v1beta1`, the Substrate Pods stay in `ContainerCreating` with `FailedMount ... matched zero ClusterTrustBundles` events.

Start minikube with the `v1beta1` API and the required feature gates enabled:

```bash
minikube start \
  --extra-config=apiserver.runtime-config=certificates.k8s.io/v1beta1=true \
  --feature-gates=ClusterTrustBundle=true,ClusterTrustBundleProjection=true,PodCertificateRequest=true
```

If minikube is already running, the same command restarts it with the new settings.

Confirm the API is served before continuing:

```bash
kubectl api-versions | grep certificates.k8s.io/v1beta1
```

Expected output:

```text
certificates.k8s.io/v1beta1
```

On a cloud cluster, use GKE **Standard**. Autopilot will not work, because `atelet` and the worker Pods run privileged containers and mount `hostPath`. You also need to enable the same beta APIs on GKE.

### Model provider API key

The CLI reads the provider key from an environment variable, not a flag. It stops before installing anything if the key for the selected provider isn't set.

| Provider (`install.defaultModelProvider`) | Environment variable |
| --- | --- |
| `OpenAI` (default) | `OPENAI_API_KEY` |
| `Anthropic` | `ANTHROPIC_API_KEY` |
| `AzureOpenAI` | `AZURE_OPENAI_API_KEY` |
| `Gemini` | `GOOGLE_API_KEY` or `GEMINI_API_KEY` |
| `Ollama` | `OLLAMA_API_KEY` |

### Coming from the earlier version of this lab

`kagent install` runs `helm upgrade --install` for `substrate-crds` and `substrate` in `ate-system`. If your cluster still has the `0.3.0-alpha3` Substrate and `1.0.0-alpha7` kagent from the earlier version of this lab:

- The Substrate releases are upgraded to `0.5.0-alpha2`, which stores its state in a PostgreSQL database shared with kagent. Treat this as a reinstall, not an in-place upgrade. The simplest route is `minikube delete` followed by the `minikube start` command above.
- Pre-1.0 kagent CRDs (`kagent.dev/v1alpha2`) that Helm doesn't own stop the install with `Kagent CRDs from a previous installation exist outside Helm`. Run `kagent uninstall` or delete those CRDs first.

## Install

### Step 1: Install the kagent CLI

Download the release binary for your platform. Available assets: `darwin-arm64`, `darwin-amd64`, `linux-arm64`, `linux-amd64`, and `windows-amd64.exe`.

```bash
export KAGENT_VERSION=v1.0.0-alpha14
export KAGENT_ASSET=kagent-darwin-arm64

curl -fsSL -o kagent \
  "https://github.com/kagent-dev/kagent/releases/download/${KAGENT_VERSION}/${KAGENT_ASSET}"
curl -fsSL -o kagent.sha256 \
  "https://github.com/kagent-dev/kagent/releases/download/${KAGENT_VERSION}/${KAGENT_ASSET}.sha256"

# The two hashes must match
shasum -a 256 kagent
cat kagent.sha256

chmod +x kagent
sudo mv kagent /usr/local/bin/kagent
```

If Homebrew already installed an older `kagent` (0.8.x installs the pre-1.0 architecture), make sure `/usr/local/bin` comes before `/opt/homebrew/bin` on your `PATH`, or run `brew uninstall kagent`.

```bash
kagent version
```

The output should report `"kagent_version":"1.0.0-alpha14"`.

### Step 2: Choose the model provider

This lab uses Anthropic, but you can pick any provider from the table above. The CLI takes the provider from a config file. Use the CLI's spelling (`Anthropic`, `OpenAI`, `AzureOpenAI`), not the Helm spelling (`anthropic`, `openAI`).

```bash
cat > kagent-config.yaml <<EOF
install:
  defaultModelProvider: Anthropic
EOF

export ANTHROPIC_API_KEY=<your-anthropic-api-key>
```

Without `--config`, the CLI reads `<user config dir>/kagent/config.yaml`, which is `~/Library/Application Support/kagent/config.yaml` on macOS. If that file doesn't exist either, it defaults to `OpenAI`.

### Step 3: Install kagent and Substrate

```bash
kagent --config kagent-config.yaml install
```

To use your own PostgreSQL instead of the bundled development database, add `--skip-database-setup`. See [Bring your own PostgreSQL](#bring-your-own-postgresql).

#### What `kagent install` runs

In the earlier version of this lab, you ran the Substrate charts, `kubectl ate admin make-ca-pool`, `make-jwt-pool`, the `actor-id-ca-certs` secret, and the `ate-api-authentication` ConfigMap by hand. `kagent install` now does all of that.

It installs each chart with `helm upgrade --install --wait --wait-for-jobs --timeout 5m --history-max 2`, in this order:

| # | Step | Namespace | What it does |
| --- | --- | --- | --- |
| 1 | `kagent-crds` chart | `kagent` | Installs the `api.kagent.dev/v1alpha3` CRDs: Agent, AgentTemplate, Harness, ModelConfig, ModelProviderConfig, RemoteMCPServer, and SandboxTemplate |
| 2 | `substrate-crds` chart | `ate-system` | Installs the `ate.dev/v1alpha1` CRDs: WorkerPool, SandboxConfig, and CSIDriverConfig |
| 3 | Substrate prerequisites (Go code, no Helm) | `ate-system`, `podcertificate-controller-system` | Creates the namespaces and the CA pool secrets (`service-dns-ca-pool`, `pod-identity-ca-pool`, `postgres-ca-pool`, `actor-id-ca-pool`, `egress-mitm-ca-pool`). Also creates `actor-id-jwt-pool`, `actor-id-ca-certs`, and the `ate-api-authentication` ConfigMap with your cluster's OIDC issuer |
| 4 | `substrate-podcert` chart | `podcertificate-controller-system` | Installs the Pod Certificate controller, which issues mTLS certificates to kagent, Substrate, and PostgreSQL clients |
| 5 | Bundled PostgreSQL | `kagent` | Deploys `kagent-postgresql`, runs the kagent and Substrate database setup SQL, and creates the `kagent-postgres-*` and `substrate-postgres-*` connection secrets |
| 6 | `substrate` chart | `ate-system` | Installs ate-api-server, ate-controller, atelet, atenet-router, atenet-egress, and RustFS (the `ate-snapshots` bucket is created by a Job). The `kagent` atespace gets read access to Secrets in the `kagent` namespace, as in the earlier version of this lab |
| 7 | `kagent` chart | `kagent` | Installs the controller, UI, tool server, `default-model-config`, and **WorkerPool `kagent-default`** |

Row 3 builds the CA pool secrets in Go code inside the CLI. On kagent `1.0.0-alpha10` and later, no plain `helm` or `kubectl` command replaces it. For a Helm-only install, use the 0.10.x line described in [Alternative: Helm-only install](#alternative-helm-only-install-kagent-0103--substrate-subchart).

The CLI sets these values on the `kagent` chart. They replace the `controller.substrate.*` and `substrateWorkerPool.*` values you passed by hand before:

```yaml
controller:
  substrateClientCertificate:
    enabled: true
config:
  substrate:
    apiEndpoint: dns:///api.ate-system.svc:443
    routerUrl: http://atenet-router.ate-system.svc:80
substrateWorkerPool:
  create: true
  workerImage: "ghcr.io/kagent-dev/substrate/ateom-gvisor:v0.5.0-alpha2"
database:
  postgres:
    clientCertificate:
      enabled: true      # left out with --skip-database-setup
providers:
  default: anthropic     # from install.defaultModelProvider
```

### Step 4: Verify

```bash
helm list -A
```

You should see five releases:

- `kagent` and `kagent-crds` in `kagent`
- `substrate` and `substrate-crds` in `ate-system`
- `substrate-podcert` in `podcertificate-controller-system`

```bash
kubectl get pods -n podcertificate-controller-system
kubectl get pods -n ate-system
kubectl get pods -n kagent
```

All Pods should be `Running`, and the RustFS bucket-init Job should be `Completed`. In `kagent`, look for these Deployments and Pods:

- `kagent-controller`
- `kagent-ui`
- `kagent-tools`
- `kagent-grafana-mcp`
- `kagent-postgresql`
- the `kagent-default` worker Pod

```bash
kubectl get workerpool -n kagent
kubectl get sandboxconfig
kubectl get modelconfig -n kagent
```

You should see `kagent-default` with 1 replica, a `gvisor-default` SandboxConfig, and `default-model-config`.

## Worker Pools

A Worker Pool is a set of pre-warmed, long-running Pods that host Actors (AI Agents or stateful tasks).

The `kagent` chart creates one Worker Pool:

- WorkerPool: `kagent/kagent-default` (`ate.dev/v1alpha1`)
- Workers: 1 replica, using `ateom-gvisor:v0.5.0-alpha2`
- Sandbox class: `gvisor`

Every Harness names a Worker Pool **in the same namespace** in `spec.substrate.workerPoolRef`. Each running conversation (Session) uses one worker until it's suspended, so overlapping conversations need more workers.

To scale **temporarily** (WorkerPool supports `kubectl scale`):

```bash
kubectl scale workerpool kagent-default -n kagent --replicas=3
```

The next `kagent install` or `helm upgrade` resets this. To make the change **permanent**, put it in a values file and add that file to the CLI config:

```bash
cat > kagent-values.yaml <<EOF
substrateWorkerPool:
  replicas: 3
EOF

cat > kagent-config.yaml <<EOF
install:
  defaultModelProvider: Anthropic
  kagent:
    valuesFiles: [kagent-values.yaml]
EOF

kagent --config kagent-config.yaml install
```

For micro-VM (hardware) isolation, set `substrateWorkerPool.sandboxClass: microvm` and use a matching `ateom-microvm` `workerImage`. You also need a `microvm` SandboxConfig, the runtime assets, and nodes with KVM. kagent does not install these.

## Alternative: Helm-only install (kagent 0.10.3 + Substrate subchart)

The kagent Helm charts can also install Substrate themselves, as subcharts. With `substrate.enabled=true`, `kagent-crds` pulls in `substrate-crds`, and `kagent` pulls in `substrate`. This works on kagent **v0.9.10 through v0.10.3** and **v1.0.0-alpha1 through alpha9**. It was removed in `1.0.0-alpha10`.

This path uses an older stack:

- kagent `0.10.3` with Substrate `0.0.9`, worker image `ghcr.io/kagent-dev/substrate/ateom-gvisor:v0.0.9`
- the older `kagent.dev/v1alpha2` API (`SandboxAgent`, `AgentHarness`)

The [Agent lab](kagent-substrate.md) uses the `v1alpha3` API, so it doesn't apply to this path.

How it differs:

- **No special cluster settings.** Substrate `0.0.9` defaults to `auth.mode=jwt` with projected ServiceAccount tokens, so a plain `minikube start` works. The chart generates its own TLS certificates and signing keys.
- **Everything installs into the release namespace.** Substrate goes into `kagent` with a `kagent-` prefix (`kagent-api`, `kagent-atenet-router`, `kagent-atelet`, `kagent-valkey-cluster`, `kagent-rustfs`, `kagent-dns`), not into `ate-system`.
- **PostgreSQL comes from the `kagent` chart itself** (`database.postgres.bundled.enabled=true`).

```bash
export KAGENT_VERSION=0.10.3

helm upgrade --install kagent-crds oci://ghcr.io/kagent-dev/kagent/helm/kagent-crds \
  --version "${KAGENT_VERSION}" \
  --namespace kagent --create-namespace --wait --timeout 5m \
  --set kmcp.enabled=true \
  --set substrate.enabled=true
```

```bash
helm upgrade --install kagent oci://ghcr.io/kagent-dev/kagent/helm/kagent \
  --version "${KAGENT_VERSION}" \
  --namespace kagent --create-namespace --wait --timeout 15m \
  --set providers.default=anthropic \
  --set providers.anthropic.apiKey="${ANTHROPIC_API_KEY}" \
  --set kmcp.enabled=true \
  --set substrate.enabled=true \
  --set controller.substrate.enabled=true \
  --set controller.substrate.ateApiEndpoint=dns:///kagent-api.kagent.svc:443 \
  --set controller.substrate.atenetRouterURL=http://kagent-atenet-router.kagent.svc:80 \
  --set controller.substrate.ateApiInsecure=true \
  --set controller.substrate.ateApiServer.namespace=kagent \
  --set controller.substrate.ateApiServer.serviceAccount=kagent-ate-api-server \
  --set substrateWorkerPool.create=true \
  --set substrateWorkerPool.replicas=1 \
  --set-string substrateWorkerPool.ateomImage=ghcr.io/kagent-dev/substrate/ateom-gvisor:v0.0.9
```

| Flag | Why |
| --- | --- |
| `substrate.enabled=true` | Installs the bundled Substrate subchart: ate-api-server, ate-controller, atelet, atenet DNS and router, Valkey, RustFS, and the `gvisor-default` SandboxConfig |
| `controller.substrate.enabled=true` | Turns on the controller's Substrate integration |
| `controller.substrate.ateApiEndpoint` / `atenetRouterURL` | Points the controller at the subchart's Services in `kagent`. The defaults assume `ate-system` |
| `controller.substrate.ateApiInsecure=true` | The ate-api certificate is signed by a CA the chart generates, and the controller doesn't mount that CA |
| `controller.substrate.ateApiServer.namespace` / `.serviceAccount` | Gives the subchart's ate-api ServiceAccount read access to the Secrets and ConfigMaps that Actors use as env sources |
| `substrateWorkerPool.create=true` + `ateomImage` | Creates WorkerPool `kagent/kagent-default`. The chart fails to render if `ateomImage` is empty |

The subchart's JWT issuer defaults to `https://kubernetes.default.svc.cluster.local`. Check your cluster's issuer:

```bash
kubectl get --raw /.well-known/openid-configuration | jq -r .issuer
```

If it's different, as on GKE, add this flag:

```bash
--set substrate.auth.jwt.issuer="$(kubectl get --raw /.well-known/openid-configuration | jq -r .issuer)"
```

Verify:

```bash
kubectl get pods -n kagent
kubectl get workerpool -n kagent
```

Uninstall:

```bash
helm uninstall kagent -n kagent
helm uninstall kagent-crds -n kagent
```

## Bring your own PostgreSQL

`kagent install --skip-database-setup` skips the bundled PostgreSQL (row 5 of the install table). Instead:

1. As a database admin, run kagent's `go/core/pkg/postgressetup/setup.sql` and Substrate's `pkg/postgressetup/setup.sql` (kagent-dev/substrate `v0.5.0-alpha2`). The kagent repo's `helm/README.md` lists the `psql` variables.
2. Create the connection secrets:
   - In `kagent`: `kagent-postgres-owner` (key `ownerConnectionString`) and `kagent-postgres-readwrite` (key `readWriteConnectionString`).
   - In `ate-system`: the Substrate owner and read/write secrets that `postgres.ownerConnectionStringSecretRef` and `postgres.readWriteConnectionStringSecretRef` name.
3. If your secrets use other names, point each chart at them with `install.kagent.valuesFiles` and `install.substrate.valuesFiles` in the CLI config.

## Certificate authority lifetime

`kagent install` creates the Substrate CAs once, and they **expire after one year**. Nothing renews them, and running `kagent install` again keeps the existing CAs. To rotate them:

```bash
kubectl delete secret -n ate-system actor-id-ca-pool actor-id-ca-certs egress-mitm-ca-pool
kubectl delete secret -n podcertificate-controller-system service-dns-ca-pool pod-identity-ca-pool postgres-ca-pool
kagent --config kagent-config.yaml install
# then restart the Substrate and kagent workloads
```

## Cleanup

On minikube, the quickest cleanup is `minikube delete`.

Otherwise, keep in mind that `kagent uninstall` removes **only** the `kagent` and `kagent-crds` releases. Uninstalling `kagent-crds` and `substrate-crds` also deletes every Agent, Harness, WorkerPool, and other custom resource of those types in **all** namespaces.

```bash
kagent uninstall

helm uninstall substrate         -n ate-system
helm uninstall substrate-crds    -n ate-system
helm uninstall substrate-podcert -n podcertificate-controller-system

# Bundled PostgreSQL (deletes all kagent and Substrate data)
kubectl delete -n kagent deployment/kagent-postgresql service/kagent-postgresql \
  configmap/kagent-postgresql pvc/kagent-postgresql \
  secret/kagent-postgres-owner secret/kagent-postgres-readwrite \
  secret/substrate-postgres-owner secret/substrate-postgres-readwrite

# CA pools and auth config created by the CLI
kubectl delete secret -n ate-system actor-id-jwt-pool actor-id-ca-pool actor-id-ca-certs egress-mitm-ca-pool
kubectl delete configmap -n ate-system ate-api-authentication
kubectl delete secret -n podcertificate-controller-system service-dns-ca-pool pod-identity-ca-pool postgres-ca-pool

kubectl delete namespace kagent ate-system podcertificate-controller-system
```

## What changed from the earlier version of this lab

| Earlier (`1.0.0-alpha7` + Substrate `0.3.0-alpha3`) | Now (`1.0.0-alpha14` + Substrate `0.5.0-alpha2`) |
| --- | --- |
| Substrate charts, then 6 manual `kubectl ate admin` / secret / ConfigMap steps, then a Substrate re-roll | One `kagent install`, which runs all of those steps |
| `kubectl ate` plugin required | Not required |
| The `kagent` chart deployed its own PostgreSQL (`database.postgres.bundled`) | The `kagent` chart no longer deploys PostgreSQL. `kagent install` deploys one database shared by kagent and Substrate, using Pod Certificate authentication; or bring your own |
| `controller.substrate.enabled`, `.ateApiEndpoint`, `.atenetRouterURL` | `config.substrate.apiEndpoint` and `config.substrate.routerUrl`, set by the CLI |
| `controller.grpc.reflection` | `config.server.grpcReflection` |
| `substrateWorkerPool.workerImage` `v0.3.0-alpha3` | `substrateWorkerPool.workerImage` `v0.5.0-alpha2`, set by the CLI |
| `helm upgrade --reuse-values --set substrateWorkerPool.replicas=3` | `kubectl scale workerpool`, or a values file passed to `kagent install` |

## Next

Create an Agent that runs on Substrate: [Using kagent with Substrate](kagent-substrate.md).

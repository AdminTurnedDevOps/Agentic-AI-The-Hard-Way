# Install kagent and Agent Substrate

These steps install both kagent and Agent Substrate.

**Please note:** [Agent Substrate](https://github.com/agent-substrate/substrate) and kagent 1.0 move fast. Expect changes, upgrades, and new objects between releases.

In kagent 1.0, Substrate is not optional. Every Agent runs as a Substrate Actor, and no Agent gets a Deployment. kagent keeps sessions, A2A history, and lifecycle state in PostgreSQL. kagent, Substrate, and PostgreSQL authenticate to each other with Kubernetes Pod Certificates.

The `kagent install` command sets all of this up in one step.

## Versions

| Component | Version |
| --- | --- |
| kagent CLI | `v1.0.1` |
| kagent Helm charts (`kagent`, `kagent-crds`) | `1.0.1`, from `oci://ghcr.io/kagent-dev/kagent/helm/` |
| Substrate Helm charts (`substrate`, `substrate-crds`, `substrate-atelet`, `substrate-podcert`) | `1.0.0`, from `oci://ghcr.io/kagent-dev/substrate/helm/` |
| Worker image | `ghcr.io/kagent-dev/substrate/ateworker-gvisor:v1.0.0` |
| Development PostgreSQL | `postgres:18-alpine` (the CLI pins it by digest) |
| `kubectl ate` plugin (optional) | `v1.0.0`, from `kagent-dev/substrate` releases |

Each kagent release pins one Substrate version. `kagent v1.0.1` pins `go.ate.dev/substrate v1.0.0`, replaced by `github.com/kagent-dev/substrate v1.0.0`. The CLI pulls the Substrate Helm charts from the **kagent-dev** fork's registry (`oci://ghcr.io/kagent-dev/substrate/helm/`).

## Prerequisites

### Tools

| Tool | Version |
| --- | --- |
| Kubernetes | v1.37.0 or later, any distribution (AKS, EKS, GKE, minikube, kind, on-prem) |
| minikube | v1.39.0 (only for a local cluster) |
| kubectl | v1.37.1 |
| Helm | v4.2.0 (any Helm with OCI support, v3.8 or later, works) |
| jq | 1.8.1 |
| `kagent` CLI | `v1.0.1` (installed in Step 1) |

> The kagent and Substrate steps below were checked against the kagent `v1.0.1` source and the published Substrate `1.0.0` charts. They have not been run end to end on a cluster with `v1.0.1`.

`kagent install` creates the CA pools and identity secrets that the `kubectl ate` plugin created in older versions of this lab, so you don't need the plugin to install. It's still useful for looking at Actors, which live in Substrate's database, not in Kubernetes. See [Optional: install the `kubectl ate` plugin](#optional-install-the-kubectl-ate-plugin).

### Cluster requirements

Substrate's Pod Certificate controller and its workloads use the `ClusterTrustBundle` and `PodCertificateRequest` APIs, and they mount `podCertificate` and `clusterTrustBundle` projected volumes. On Kubernetes **v1.37**, these APIs are GA in `certificates.k8s.io/v1`, and the `ClusterTrustBundle`, `ClusterTrustBundleProjection`, and `PodCertificateRequest` feature gates are on by default. The Substrate `v1.0.0` controllers use `v1` and fall back to `v1beta1` only when `v1` isn't served.

That means **any Kubernetes v1.37+ cluster works**: AKS, EKS, GKE, minikube, kind, or your own on-prem cluster. No special API server flags are needed. For a local cluster, a plain `minikube start` is enough:

```bash
minikube start --kubernetes-version=v1.37.0
```

Confirm the cluster serves both APIs before continuing:

```bash
kubectl api-resources --api-group=certificates.k8s.io
```

The output should list `clustertrustbundles` and `podcertificaterequests`.

On Kubernetes versions older than v1.37, these APIs are beta and off by default. There you'd need `--extra-config=apiserver.runtime-config=certificates.k8s.io/v1beta1=true` and `--feature-gates=ClusterTrustBundle=true,ClusterTrustBundleProjection=true,PodCertificateRequest=true`. The Substrate `1.0.0` chart's install notes still print this requirement, but a v1.37 cluster doesn't need it.

The one thing a cluster must allow is `hostPath` mounts on its nodes, because `atelet` mounts `/var/lib/ate`, `/var/lib/kubelet/plugins`, and `/dev`. Standard managed clusters (AKS, EKS, GKE Standard) allow this. Fully managed node modes that block `hostPath`, such as GKE Autopilot, don't work.

### Model provider API key

The CLI reads the provider key from an environment variable, not a flag. It stops before installing anything if the key for the selected provider isn't set.

| Provider (`install.defaultModelProvider` or `--provider`) | Environment variable |
| --- | --- |
| `OpenAI` (default) | `OPENAI_API_KEY` |
| `Anthropic` | `ANTHROPIC_API_KEY` |
| `AzureOpenAI` | `AZURE_OPENAI_API_KEY` |
| `Gemini` | `GOOGLE_API_KEY` or `GEMINI_API_KEY` |
| `Ollama` | `OLLAMA_API_KEY` |

### Coming from the earlier version of this lab

`kagent install` runs `helm upgrade --install` for every release. If your cluster still has kagent `1.0.0-alpha14` and Substrate `0.5.0-alpha2` from the earlier version of this lab, **reinstall instead of upgrading**:

- Substrate `0.6.0` changed the snapshot format, and Substrate `0.7.0-alpha2` squashed its PostgreSQL migrations. A database created by an earlier Substrate can't be upgraded in place and must be recreated.
- Substrate `1.0.0` moves `atelet` into its own `substrate-atelet` release and serves its CRDs as `ate.dev/v1`.

The simplest route is `minikube delete` followed by `minikube start`. On a cluster you want to keep, remove the old install first. The `alpha14` `kagent uninstall` removes only the `kagent` releases, so also follow the manual cleanup from the earlier version of this lab, or run the `v1.0.1` `kagent uninstall` described in [Cleanup](#cleanup) once you've installed the new CLI.

Pre-1.0 kagent CRDs (`kagent.dev/v1alpha2`) that Helm doesn't own stop the install with `Kagent CRDs from a previous installation exist outside Helm`. `kagent uninstall` doesn't remove CRDs applied outside Helm, so delete those CRDs yourself.

## Install

### Step 1: Install the kagent CLI

Download the release binary for your platform. Available assets: `darwin-arm64`, `darwin-amd64`, `linux-arm64`, `linux-amd64`, and `windows-amd64.exe`.

```bash
export KAGENT_VERSION=v1.0.1
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
kagent version --client
```

The output should report `"kagent_version":"1.0.1"`. `--client` prints only the CLI version, without contacting a kagent server.

### Optional: install the `kubectl ate` plugin

The plugin talks to Substrate's API, where Actors, workers, and ActorTemplates live. `kubectl get actor` returns nothing, because Actors are not Kubernetes resources. Use the plugin version that matches the Substrate that kagent pins:

```bash
export ATE_VERSION=v1.0.0
export ATE_ASSET=kubectl-ate-darwin-arm64

curl -fsSL -o kubectl-ate \
  "https://github.com/kagent-dev/substrate/releases/download/${ATE_VERSION}/${ATE_ASSET}"
curl -fsSL -o kubectl-ate.sha256 \
  "https://github.com/kagent-dev/substrate/releases/download/${ATE_VERSION}/${ATE_ASSET}.sha256"

# The two hashes must match
shasum -a 256 kubectl-ate
cat kubectl-ate.sha256

chmod +x kubectl-ate
sudo mv kubectl-ate /usr/local/bin/kubectl-ate
```

After the install below, list the Actors in the `kagent` atespace with:

```bash
kubectl ate get actors -a kagent
```

`kagent install` grants the `ate-system/ate-client` ServiceAccount owner access to Substrate's API, so the plugin works with its default credentials.

### Step 2: Choose the model provider

This lab uses Anthropic, but you can pick any provider from the table above. The CLI takes the provider from a config file or from the `--provider` flag, which overrides the config file. Use the CLI's spelling (`Anthropic`, `OpenAI`, `AzureOpenAI`), not the Helm spelling (`anthropic`, `openAI`).

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

To see the Helm commands and values without changing the cluster, run `kagent --config kagent-config.yaml install --dry-run`. It writes them to `./kagent-install` (change this with `--output-dir`). The export doesn't set up rows 3 and 5 of the table below (the Substrate prerequisites and the bundled database), so it can't replace `kagent install` on its own.

#### What `kagent install` runs

In older versions of this lab, you ran the Substrate charts, `kubectl ate admin make-ca-pool`, `make-jwt-pool`, the `actor-id-ca-certs` secret, and the `ate-api-authentication` ConfigMap by hand. `kagent install` now does all of that.

Before it changes anything, the CLI renders the `kagent` chart (to find the controller's ServiceAccount) and reads the `substrate` chart's default values. It then installs each chart with `helm upgrade --install --create-namespace --wait --wait-for-jobs --history-max 2 --timeout 5m`, in this order:

| # | Step | Namespace | What it does |
| --- | --- | --- | --- |
| 1 | `kagent-crds` chart | `kagent` | Installs the `api.kagent.dev/v1alpha3` CRDs: Agent, AgentTemplate, EgressPolicy, Harness, ModelConfig, ModelProviderConfig, RemoteMCPServer, and SandboxTemplate |
| 2 | `substrate-crds` chart | `ate-system` | Installs the `ate.dev/v1` CRDs: WorkerPool, SandboxConfig, and CSIDriverConfig |
| 3 | Substrate prerequisites (Go code, no Helm) | `kagent`, `ate-system`, `podcertificate-controller-system` | Creates the namespaces and labels `kagent` with `ate.dev/api-access=true`, because Substrate's API only admits clients from labeled namespaces. Creates the CA pool secrets `actor-id-ca-pool` and `egress-mitm-ca-pool` in `ate-system`, and `service-dns-ca-pool`, `pod-identity-ca-pool`, and `postgres-ca-pool` in `podcertificate-controller-system`. Also creates `actor-id-jwt-pool`, `actor-id-ca-certs`, the `ate-api-authentication` ConfigMap with your cluster's OIDC issuer, and the `kagent-rustfs-credentials` secret for RustFS |
| 4 | `substrate-podcert` chart | `podcertificate-controller-system` | Installs `podcertificate-controller`, which issues mTLS certificates to kagent, Substrate, and PostgreSQL clients |
| 5 | Bundled PostgreSQL | `kagent` | Deploys `kagent-postgresql`, runs the kagent and Substrate database setup SQL, and creates the `kagent-postgres-owner` and `kagent-postgres-readwrite` secrets in `kagent` and `substrate-postgres-owner` and `substrate-postgres-readwrite` in `ate-system`. Skipped with `--skip-database-setup` |
| 6 | `substrate-atelet` chart | `ate-system` | Installs the `atelet` DaemonSet. The CLI then waits for `kubectl rollout status daemonset/atelet` before continuing |
| 7 | `substrate` chart | `ate-system` | Installs `ate-api-server`, `ate-controller`, `ate-idp-server`, `atenet-router`, `atenet-egress`, `k8s-credential-provider`, RustFS (the `ate-snapshots` bucket is created by the `rustfs-bucket-init` Job), and the `gvisor-default` SandboxConfig. Set with `atelet.enabled=false`, because `atelet` has its own release |
| 8 | `kagent` chart | `kagent` | Installs the controller, UI, tool server, `default-model-config`, **WorkerPool `kagent-default`**, and the Harnesses `kagent-default`, `codex-default`, and `claude-default` |

Row 3 builds the CA pool secrets in Go code inside the CLI. On kagent `1.0.0-alpha10` and later, no plain `helm` or `kubectl` command replaces it. For a Helm-only install, use the 0.10.x line described in [Alternative: Helm-only install](#alternative-helm-only-install-kagent-0103--substrate-subchart).

The CLI sets these values on the `kagent` chart. They replace the `controller.substrate.*` and `substrateWorkerPool.*` values you passed by hand in older versions of this lab:

```yaml
controller:
  substrateClientCertificate:
    enabled: true
config:
  substrate:
    apiEndpoint: dns:///api.ate-system.svc:443
    routerUrl: https://atenet-router.ate-system.svc:443
  server:
    grpcReflection: true
harnesses:
  enabled: true
providers:
  default: anthropic     # from install.defaultModelProvider or --provider
  openAI:
    model: gpt-5-mini
    config:
      apiFormat: responses
  azureOpenAI:
    model: gpt-5-mini
    config:
      apiVersion: "2024-10-21"
substrateWorkerPool:
  create: true
  workerImage: "ghcr.io/kagent-dev/substrate/ateworker-gvisor:v1.0.0"
database:
  postgres:
    clientCertificate:
      enabled: true      # left out with --skip-database-setup
```

The API key goes to `providers.<provider>.apiKey` through a separate values file, so it never appears on the `helm` command line.

The CLI also sets these values on the `substrate` chart. It reads the controller identity from the rendered `kagent` chart (`kagent-controller` by default):

```yaml
preview:
  - PerTemplateSnapshotLocation
  - GoldenEgressPolicy
ateApi:
  authorization:
    bootstrapOwners:
      - "spiffe://cluster.local/ns/kagent/sa/kagent-controller"
      - "system:serviceaccount:ate-system:ate-client"
atenetRouter:
  ingressAllowedSPIFFEIDs:
    - "spiffe://cluster.local/ns/kagent/sa/kagent-controller"
credentialProvider:
  namespacePolicies:
    - atespace: "kagent"
      allowedNamespaces: ["kagent"]
postgres:
  clientCertificates:
    enabled: true        # left out with --skip-database-setup
```

The `kagent` atespace gets read access to Secrets in the `kagent` namespace, as in the earlier version of this lab. Only the kagent controller may send traffic to Actors through `atenet-router`.

### Step 4: Verify

```bash
helm list -A
```

You should see six releases:

- `kagent` and `kagent-crds` in `kagent`
- `substrate`, `substrate-crds`, and `substrate-atelet` in `ate-system`
- `substrate-podcert` in `podcertificate-controller-system`

```bash
kubectl get pods -n podcertificate-controller-system
kubectl get pods -n ate-system
kubectl get pods -n kagent
```

All Pods should be `Running`, and the `rustfs-bucket-init` Job should be `Completed`.

In `ate-system`, look for `ate-api-server`, `ate-controller`, `ate-idp-server`, `atenet-router`, `atenet-egress`, `k8s-credential-provider`, `rustfs`, and one `atelet` Pod per node.

In `kagent`, look for these Deployments and Pods:

- `kagent-controller`
- `kagent-ui`
- `kagent-tools`
- `kagent-postgresql`
- the `kagent-default` worker Pod

```bash
kubectl get workerpool -n kagent
kubectl get sandboxconfig
kubectl get harness -n kagent
kubectl get modelconfig -n kagent
```

You should see `kagent-default` with 1 replica, a `gvisor-default` SandboxConfig, the `kagent-default`, `codex-default`, and `claude-default` Harnesses, and `default-model-config`.

## Worker Pools

A Worker Pool is a set of pre-warmed, long-running Pods that host Actors (AI Agents or stateful tasks).

The `kagent` chart creates one Worker Pool:

- WorkerPool: `kagent/kagent-default` (`ate.dev/v1`)
- Workers: 1 replica, using `ateworker-gvisor:v1.0.0`
- Sandbox class: `gvisor`, using the `gvisor-default` SandboxConfig

Every Harness names a Worker Pool **in the same namespace** in `spec.substrate.workerPoolRef`. The three default Harnesses point at `kagent-default` and store snapshots under `s3://ate-snapshots/kagent/` in the bundled RustFS. Each running conversation (Session) uses one worker until it's suspended, so overlapping conversations need more workers.

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

For micro-VM (hardware) isolation, set `substrateWorkerPool.sandboxClass: microvm` and use a matching `ateworker-microvm` `workerImage`. You also need a `microvm` SandboxConfig, the runtime assets, and nodes with KVM. kagent does not install these.

## Alternative: Helm-only install (kagent 0.10.3 + Substrate subchart)

The kagent Helm charts can also install Substrate themselves, as subcharts. With `substrate.enabled=true`, `kagent-crds` pulls in `substrate-crds`, and `kagent` pulls in `substrate`. This works on kagent **v0.9.10 through v0.10.5** and **v1.0.0-alpha1 through alpha9**. It was removed in `1.0.0-alpha10`.

This section stays on `0.10.3`. From `v0.10.6` on (the latest 0.10.x is `v0.10.7`), both charts refuse to render with `substrate.enabled=true`, `controller.substrate.enabled=true`, or `substrateWorkerPool.create=true`, and fail with `Substrate is not supported in kagent v0.10.x`. The reason given in the chart is that the Wolfi-based Python ADK images can't be restored from a Substrate checkpoint on arm64 (google/gvisor#13542).

This path uses an older stack:

- kagent `0.10.3` with Substrate `0.0.9`, worker image `ghcr.io/kagent-dev/substrate/ateom-gvisor:v0.0.9`
- the older `kagent.dev/v1alpha2` API (`SandboxAgent`, `AgentHarness`)

The [Agent lab](kagent-substrate.md) uses the `v1alpha3` API, so it doesn't apply to this path.

How it differs:

- **No special cluster settings.** Substrate `0.0.9` defaults to `auth.mode=jwt` with projected ServiceAccount tokens and doesn't use Pod Certificates. The chart generates its own TLS certificates and signing keys.
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

`kagent install --skip-database-setup` skips the bundled PostgreSQL (row 5 of the install table). It also leaves out the Pod Certificate client settings for PostgreSQL on the `kagent`, `substrate`, and `substrate-podcert` charts. Instead:

1. As a database admin, run kagent's `go/core/pkg/postgressetup/setup.sql` (kagent `v1.0.1`) and Substrate's `pkg/postgressetup/setup.sql` (kagent-dev/substrate `v1.0.0`). The "Preparing your own database" section of the kagent repo's `helm/README.md` lists the `psql` variables.
2. Create the connection secrets:
   - In `kagent`: `kagent-postgres-owner` (key `ownerConnectionString`) and `kagent-postgres-readwrite` (key `readWriteConnectionString`).
   - In `ate-system`: `substrate-postgres-owner` (key `ownerConnectionString`) and `substrate-postgres-readwrite` (key `readWriteConnectionString`). These are the defaults of the `substrate` chart's `postgres.ownerConnectionStringSecretRef` and `postgres.readWriteConnectionStringSecretRef`.
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

Otherwise, `kagent uninstall` now removes the whole install, in dependency order:

- all six Helm releases, including both CRD charts. Removing the CRDs deletes every Agent, Harness, ModelConfig, WorkerPool, and other resource of those types in **all** namespaces.
- the bundled PostgreSQL and its data, including the connection secrets
- the `ate-system` and `podcertificate-controller-system` namespaces, with the CA pools and the `ate-api-authentication` ConfigMap in them
- Substrate's ClusterTrustBundles
- the `ate.dev/api-access` label on the `kagent` namespace

```bash
kagent uninstall
```

It keeps the `kagent` namespace and anything else in it. It also keeps a database you brought with `--skip-database-setup`, and CRDs applied outside Helm. Delete the namespace yourself:

```bash
kubectl delete namespace kagent
```

If WorkerPools that `kagent install` didn't create exist, `kagent uninstall` lists them and asks before deleting them. Without a terminal, it stops before deleting anything unless you pass `--delete-worker-pools`.

## What changed from the earlier version of this lab

| Earlier (`1.0.0-alpha14` + Substrate `0.5.0-alpha2`) | Now (`1.0.1` + Substrate `1.0.0`) |
| --- | --- |
| Five Helm releases | Six: `atelet` moved out of the `substrate` chart into its own `substrate-atelet` release, which the CLI installs and rolls out first |
| Substrate CRDs at `ate.dev/v1alpha1` | `ate.dev/v1` (WorkerPool, SandboxConfig, CSIDriverConfig) |
| kagent CRDs: Agent, AgentTemplate, Harness, ModelConfig, ModelProviderConfig, RemoteMCPServer, SandboxTemplate | Same, plus EgressPolicy |
| Worker image `ateom-gvisor:v0.5.0-alpha2` | `ateworker-gvisor:v1.0.0`, set by the CLI |
| Minikube needed `certificates.k8s.io/v1beta1` and three feature gates | Not on Kubernetes v1.37, where those APIs are GA in `certificates.k8s.io/v1` |
| `config.substrate.routerUrl: http://atenet-router.ate-system.svc:80` | `https://atenet-router.ate-system.svc:443`. Substrate `1.0.0` requires mTLS and an allowlist for Actor ingress, which the CLI sets to the kagent controller's identity |
| No Harnesses created | `kagent-default`, `codex-default`, and `claude-default` Harnesses, from `harnesses.enabled=true` |
| Model provider only from `install.defaultModelProvider` | Also from `kagent install --provider` |
| No way to preview the install | `kagent install --dry-run` exports the Helm commands and values |
| `kagent uninstall` removed only the `kagent` and `kagent-crds` releases | Removes all six releases, the bundled PostgreSQL, both Substrate namespaces, and the trust bundles. It keeps the `kagent` namespace |
| `kubectl ate` plugin not used | Still not required to install. Optional for looking at Actors |
| Grafana MCP server (`kagent-grafana-mcp`) installed by the `kagent` chart | Removed from the chart |

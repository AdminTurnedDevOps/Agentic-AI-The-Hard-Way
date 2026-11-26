# Bring Your Own Harness: Hermes on Agent Substrate

kagent ships three built-in harnesses: `kagent`, `claude`, and `codex`. The fourth option, `byo` (bring your own), runs **any** agent you can package as a container, as long as it speaks kagent's runtime contract.

In this lab you package [Hermes Agent](https://github.com/NousResearch/hermes-agent) as a `byo` Harness and run it as a Substrate Actor. Hermes doesn't speak kagent's protocol out of the box, so the image includes a small Go adapter that translates between the two:

```text
kagent controller ──A2A gRPC──▶ Go adapter (kagent-hermes) ──ACP over stdin/stdout──▶ hermes acp (Python)
                                 └──────────────── one Substrate Actor (gVisor sandbox) ────────────────┘
```

The adapter source is in [`hermes-byo-harness/`](https://github.com/AdminTurnedDevOps/Agentic-AI-The-Hard-Way/tree/main/isolated-agent/hermes-byo-harness).

> **Status:** The adapter builds, and passes `go vet`, `gofmt`, and its unit tests against kagent `v1.0.1` (`github.com/kagent-dev/kagent/go v0.0.0-20261111150159-558e3d761d8e`). The unit tests include loading a cached bootstrap bundle with kagent's own `bootstrap.Load`. The image has **not** been rebuilt for `v1.0.1`, so the Step 3 `--check` command is untested. The lab has **not** been run end to end on a cluster.

## Prerequisites

- kagent `1.0.1` and Agent Substrate `1.0.0` (kagent `v1.0.1` pins `github.com/kagent-dev/substrate v1.0.0`), installed with `kagent install` as shown in [Install kagent and Agent Substrate](installation.md). This gives you WorkerPool `kagent/kagent-default`.
- [Using kagent with Substrate](kagent-substrate.md) is recommended first. It covers Harness, AgentTemplate, and Agent with the built-in `kagent` harness.
- An **OpenAI API key**. The adapter only translates OpenAI ModelConfigs.
- A container registry that you can push to **and** your cluster can pull from without credentials, such as a public GitHub Container Registry (`ghcr.io`) package.
- Docker with Buildx. Go `1.27.3` if you want to run the unit tests (`go` downloads the 1.27.3 toolchain automatically if you have an older Go).

| Tool | Version used |
| --- | --- |
| Docker | 29.5.3 |
| Go toolchain | 1.27.3 |
| kagent | `1.0.1` |
| kagent Go module | `github.com/kagent-dev/kagent/go v0.0.0-20261111150159-558e3d761d8e` (the `v1.0.1` commit; the `go/` module has no tags of its own) |
| Agent Substrate | `1.0.0` |
| Hermes Agent | pinned by `requirements.lock` (`hermes-agent[acp]`) |

## The BYO runtime contract

A built-in harness image already follows this contract. A BYO image has to follow it itself:

| Requirement | How the Hermes adapter meets it |
| --- | --- |
| Serve kagent's private A2A API over gRPC on **port 80** | `main.go` starts kagent's own A2A server (`github.com/kagent-dev/kagent/go/adk/pkg/app`) |
| Answer **`GET /readyz` on port 8081** within the 30-second wakeup probe | The same kagent server serves it. Substrate waits for it before it takes the golden snapshot and before it hands a restored Actor any traffic |
| Load the compiled agent config and Agent Card from the **bootstrap bundle** named by **`KAGENT_BOOTSTRAP_JSON`** | The variable holds only a descriptor: control-plane URL, revision, and SHA-256. `main.go` calls kagent's `bootstrap.Load`, which fetches the bundle from the controller over gRPC on first start, checks it against the descriptor, and caches it in `/data/kagent/bootstrap/bundle.pb`. A restored Actor reads the cached copy |
| Parse the bundle's config as kagent's **`ADKConfig`** | `config.go` parses it with kagent's own `runtimeconfig.Unmarshal` and writes `/data/hermes/config.yaml` for Hermes: model, base URL, token limit, system prompt |
| Serve the bundle's **Agent Card** | `main.go` passes it to the A2A server |
| Keep conversation state under **`/data`** | Hermes state, the adapter's continuation ID, and the cached bootstrap bundle live in `/data`, so a suspended Actor resumes the same Hermes session |
| Trust the egress gateway CA | kagent sets `SSL_CERT_FILE`, `REQUESTS_CA_BUNDLE`, and the other CA variables to `/run/kagent/egress/trust-bundle.pem`. Hermes' OpenAI client uses `SSL_CERT_FILE`. The bootstrap fetch uses it only when the control-plane URL is `https://` |
| Run as one Actor per conversation (Session) | `runner.go` starts `hermes acp` on the first turn and reloads the saved Hermes session after a restore |

Two safety choices in `client.go`:

- **ACP file-system and terminal callbacks are disabled.** Hermes runs its own tools inside the Actor, so everything it does stays inside the gVisor sandbox.
- **ACP permission requests are rejected**, never auto-approved.

### What changed from kagent `1.0.0-alpha14`

The adapter started out in [agentic-demo-repo](https://github.com/AdminTurnedDevOps/agentic-demo-repo/tree/main/substrate/kagent-substrate/kagent-oss-hermes), pinned to a pre-alpha kagent commit, and was then ported to `1.0.0-alpha14`. Porting it from `1.0.0-alpha14` to `1.0.1` needed:

| Area | `1.0.0-alpha14` | `1.0.1` |
| --- | --- | --- |
| Config delivery | The controller set `KAGENT_CONFIG_JSON` and `KAGENT_AGENT_CARD_JSON` in the Actor | The controller sets only the `KAGENT_BOOTSTRAP_JSON` descriptor, and rejects the two old names in the Harness `env`. The adapter loads the bundle with `bootstrap.Load`, the same code behind the built-in harnesses' `bootstrap.FromEnvironment` |
| `--check` | Read the two `KAGENT_*` variables | Needs the bootstrap bundle like a real start, or the adapter's own `--config-file` and `--agent-card-file` flags (check only) for a local run |
| A2A server | `ControlPlaneURL` | Also `MaxContentLength` from the compiled runtime config, as kagent's own BYO examples pass it |
| Go module | `github.com/kagent-dev/kagent/go` at the alpha14 commit, with `replace github.com/agent-substrate/substrate => github.com/kagent-dev/substrate v0.5.0-alpha2` | The `v1.0.1` commit, with `replace go.ate.dev/substrate => github.com/kagent-dev/substrate v1.0.0` (Substrate's module path changed). `go` directive `1.27.3` |
| Dockerfile builder | `golang:1.27.0-alpine3.23` | `golang:1.27.3-alpine3.23`. The image sets `GOTOOLCHAIN=local`, so it can't build a `go 1.27.3` module with Go 1.27.0 |
| Harness | Had a `status` with a `Ready` condition | No `status`. Wait on the Agent instead |
| Snapshot location | `gs://ate-snapshots/kagent/hermes/` | `s3://ate-snapshots/kagent/hermes/`, matching the `s3://ate-snapshots/kagent/` location kagent `1.0.1` uses |
| Extra egress | Not available | An optional `api.kagent.dev/v1alpha3` EgressPolicy, selected with the Agent's `spec.egressPolicyRefs` |

The ACP side (`runner.go`, `client.go`), the `config.yaml` that the adapter writes for Hermes, and the `harness/runtime` packages it uses didn't change.

## Step 1: Test the adapter

From the root of this repo:

```bash
cd isolated-agent/hermes-byo-harness

go vet ./...
go test ./...
```

## Step 2: Build and push the image

Set `IMAGE` to a repository you own:

```bash
export IMAGE=ghcr.io/<your-github-user>/kagent-hermes
export TAG=0.3.0
```

Check the CPU architecture of your cluster nodes. minikube on Apple Silicon runs `arm64` nodes, and most cloud nodes are `amd64`:

```bash
kubectl get nodes -o jsonpath='{.items[*].status.nodeInfo.architecture}'
```

Build for both architectures and push. The Go builder uses `TARGETARCH`, and the base images are pinned to multi-arch digests:

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --build-arg VERSION="${TAG}" \
  -t "${IMAGE}:${TAG}" \
  --push .
```

Make the package **public** in your registry. Substrate's `atelet` pulls Actor images itself; the kubelet doesn't. Locally loaded images (`minikube image load`) and `imagePullSecrets` don't apply.

## Step 3: Check the image locally

`--check` validates the config, starts `hermes acp`, completes the ACP handshake, and creates a session. It never calls the model, so the placeholder key below is fine. It's the same placeholder that kagent puts in the Actor (see [Step 6](#step-6-where-the-api-key-actually-lives)).

Inside an Actor, the adapter loads its config from the kagent bootstrap bundle, which it fetches from the controller. There's no controller on your machine, so for a local check the adapter's own `--config-file` and `--agent-card-file` flags read the same two JSON documents from files. These flags are part of this adapter, not of kagent, and only work with `--check`.

> This step has not been re-run since the `1.0.1` port.

```bash
mkdir -p check

cat > check/config.json <<'EOF'
{"runtime":{"control_plane_url":"http://kagent-controller.kagent:8083","name":"hermes-assistant","namespace":"kagent"},"agent":{"name":"hermes_assistant","instruction":"Be concise.","model":{"model":"gpt-4.1-mini","openai":{}}}}
EOF

cat > check/agent-card.json <<'EOF'
{"name":"hermes_assistant","description":"Hermes check","version":"v1","supportedInterfaces":[{"url":"http://127.0.0.1:80","protocolBinding":"GRPC","protocolVersion":"1.0"}],"capabilities":{"streaming":true},"defaultInputModes":["text"],"defaultOutputModes":["text"],"skills":[]}
EOF

docker run --rm \
  -e OPENAI_API_KEY=kagent-credential-injected \
  -v "${PWD}/check:/check:ro" \
  "${IMAGE}:${TAG}" --check \
  --config-file /check/config.json \
  --agent-card-file /check/agent-card.json
echo "exit code: $?"
```

Expected: exit code `0`, with Hermes log lines ending in something like:

```text
[INFO] acp_adapter.session: Created ACP session 213c92cf-... (cwd=/data/workspace)
[INFO] acp_adapter.server: New session 213c92cf-... (cwd=/data/workspace)
```

Warnings about browser and web tools are expected. Those optional Hermes tools aren't configured.

## Step 4: Pin the image by digest

A Harness only accepts images pinned with `@sha256:`. The Harness CRD checks `workload.image` against `^[^[:space:]@]+@sha256:[a-f0-9]{64}$`, so `kubectl apply` rejects a tag. Get the digest of the multi-arch image you pushed:

```bash
export DIGEST=$(docker buildx imagetools inspect "${IMAGE}:${TAG}" --format '{{.Manifest.Digest}}')
echo "${IMAGE}@${DIGEST}"
```

## Step 5: Create the OpenAI ModelConfig

The installation lab set Anthropic as the default provider, so create a separate OpenAI ModelConfig for Hermes:

```bash
export OPENAI_API_KEY=<your-openai-api-key>

kubectl create secret generic hermes-openai -n kagent \
  --from-literal=OPENAI_API_KEY="${OPENAI_API_KEY}"

kubectl apply -f - <<EOF
apiVersion: api.kagent.dev/v1alpha3
kind: ModelConfig
metadata:
  name: hermes-openai
  namespace: kagent
spec:
  provider: OpenAI
  model: gpt-4.1-mini
  apiKeySecret: hermes-openai
  apiKeySecretKey: OPENAI_API_KEY
EOF
```

```bash
kubectl get modelconfig hermes-openai -n kagent
```

## Step 6: Where the API key actually lives

The real key stays in the `hermes-openai` Secret. **It never enters the Actor.** When kagent compiles the Agent:

1. It turns the ModelConfig's `apiKeySecret` into an **egress credential binding**: "for requests to `https://api.openai.com`, set `authorization: Bearer <key from kagent/hermes-openai>`".
2. It sets `OPENAI_API_KEY` in the Actor to the literal placeholder `kagent-credential-injected`.
3. It points `SSL_CERT_FILE`, `REQUESTS_CA_BUNDLE`, and the other CA variables at Substrate's egress trust bundle, mounted at `/run/kagent/egress/trust-bundle.pem`.

Every outbound HTTPS call from the Actor goes through Substrate's egress gateway, which is agentgateway. The gateway fetches the Secret through Substrate's credential provider and replaces the placeholder with the real key on the way out. Hermes' OpenAI client honors `SSL_CERT_FILE`, so it trusts the gateway. A rotated key can take up to five minutes to reach the gateway's credential cache, without recompiling or restarting the Agent.

You can see why the placeholder is useless on its own:

```bash
curl -s https://api.openai.com/v1/models \
  -H "Authorization: Bearer kagent-credential-injected" | jq .error.code
```

```text
"invalid_api_key"
```

The [Agent inference through agentgateway](inference-with-agw.md) lab follows this traffic through the gateway.

## Step 7: Create the Harness, AgentTemplate, and Agent

The `byo` Harness takes the digest-pinned image and the adapter's entrypoint:

```bash
kubectl apply -f - <<EOF
apiVersion: api.kagent.dev/v1alpha3
kind: Harness
metadata:
  name: hermes
  namespace: kagent
spec:
  byo: {}
  workload:
    image: ${IMAGE}@${DIGEST}
    command:
      - /usr/local/bin/kagent-hermes
  substrate:
    workerPoolRef:
      name: kagent-default
    snapshotPolicy:
      location: s3://ate-snapshots/kagent/hermes/
---
apiVersion: api.kagent.dev/v1alpha3
kind: AgentTemplate
metadata:
  name: hermes-assistant
  namespace: kagent
spec:
  description: A Hermes agent running through a kagent BYO Harness on Agent Substrate.
  modelConfig:
    name: hermes-openai
  systemPrompt: You are a helpful assistant running with Hermes Agent.
---
apiVersion: api.kagent.dev/v1alpha3
kind: Agent
metadata:
  name: hermes-assistant
  namespace: kagent
spec:
  template:
    ref:
      name: hermes-assistant
  harnessRef:
    name: hermes
EOF
```

`ate-snapshots` is the in-cluster RustFS bucket from the installation. kagent `1.0.1` uses `s3://ate-snapshots/kagent/` for its own Harnesses; this lab adds a `hermes/` prefix. See [Storage Location](kagent-substrate.md#storage-location) for using your own bucket.

The Agent gets its model endpoint (`https://api.openai.com`) and kagent's control plane as egress destinations automatically. If you want Hermes to reach other sites, create an `api.kagent.dev/v1alpha3` EgressPolicy and list it in the Agent's `spec.egressPolicyRefs`.

Wait for the Agent. A Harness has no status in `1.0.1`, so the Agent reports readiness for both. The image is larger than the built-in harness (Python plus Hermes), so the first pull and golden snapshot can take a few minutes:

```bash
kubectl -n kagent wait --for=condition=Ready agents.api.kagent.dev/hermes-assistant --timeout=10m
kubectl -n kagent get agents.api.kagent.dev,harnesses.api.kagent.dev
```

If it times out, read the condition messages:

```bash
kubectl -n kagent get agents.api.kagent.dev hermes-assistant -o jsonpath='{range .status.conditions[*]}{.type}={.status}: {.message}{"\n"}{end}'
```

## Step 8: Talk to Hermes

```bash
kagent agent session create --agent hermes-assistant
```

Copy the Session ID from the output:

```bash
export SESSION_ID=<session-id>
kagent agent invoke --session "${SESSION_ID}" --task "In one sentence, what are you and where are you running?"
```

Send a second message to the same Session. The adapter reloads the same Hermes session, even if Substrate suspended the Actor in between:

```bash
kagent agent invoke --session "${SESSION_ID}" --task "What did I just ask you?"
```

You can also chat from the UI: run `kagent dashboard` and select `hermes-assistant`.

## Troubleshooting

| Symptom | Where to look |
| --- | --- |
| `kubectl apply` rejects the Harness: `spec.workload.image` should match `^[^[:space:]@]+@sha256:[a-f0-9]{64}$` | `workload.image` must be `IMAGE@sha256:…`, not a tag. Repeat Step 4 |
| Agent stuck before `Ready` | Read the `Accepted`, `ResolvedRefs`, `Compatible`, and `Ready` condition messages (Step 7), or `kubectl describe agents.api.kagent.dev hermes-assistant -n kagent`. Check that the image is public and built for your node architecture (Step 2) |
| Adapter log: `load kagent bootstrap bundle from KAGENT_BOOTSTRAP_JSON` | The adapter couldn't fetch or verify its config. The fetch gives up after 20 seconds so the Actor stays inside the 30-second wakeup probe. Check that the Actor can reach kagent's control plane, and read the error after that prefix |
| Adapter log: `KAGENT_CONFIG_JSON is required` | The image was built from the `1.0.0-alpha14` adapter, which kagent `1.0.1` no longer supports. Rebuild it from this directory (Step 2) and repin the digest (Step 4) |
| Hermes answers with an OpenAI `401` / `invalid_api_key` | The placeholder reached OpenAI without being replaced. Check that the Secret key matches `apiKeySecretKey`, and that the Substrate release grants atespace `kagent` access to namespace `kagent` under `credentialProvider.namespacePolicies` (`helm get values substrate -n ate-system`). `kagent install` sets that grant |
| TLS or certificate errors in the Hermes logs | The Actor doesn't trust the egress gateway. kagent sets `SSL_CERT_FILE`/`REQUESTS_CA_BUNDLE` to the egress trust bundle; don't override them in the Harness `env` (kagent rejects that anyway) |
| Hermes tries to reach a site other than OpenAI and fails | Expected. Without an EgressPolicy, Actor egress is limited to the destinations inferred when the Agent was compiled: the model endpoint and kagent's control plane. Grant more with an EgressPolicy in `spec.egressPolicyRefs`; the Agent's `EgressPoliciesApplied` condition reports whether it was admitted |

## Clean up

```bash
kubectl delete agents.api.kagent.dev hermes-assistant -n kagent
kubectl delete agenttemplates.api.kagent.dev hermes-assistant -n kagent
kubectl delete harnesses.api.kagent.dev hermes -n kagent
kubectl delete modelconfigs.api.kagent.dev hermes-openai -n kagent
kubectl delete secret hermes-openai -n kagent
rm -rf check
```

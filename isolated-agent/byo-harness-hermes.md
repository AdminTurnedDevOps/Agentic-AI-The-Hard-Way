# Bring Your Own Harness: Hermes on Agent Substrate

kagent ships three built-in harnesses: `kagent`, `claude`, and `codex`. The fourth option, `byo` (bring your own), runs **any** agent you can package as a container, as long as it speaks kagent's runtime contract.

In this lab you package [Hermes Agent](https://github.com/NousResearch/hermes-agent) as a `byo` Harness and run it as a Substrate Actor. Hermes doesn't speak kagent's protocol out of the box, so the image includes a small Go adapter that translates between the two:

```text
kagent controller ──A2A gRPC──▶ Go adapter (kagent-hermes) ──ACP over stdin/stdout──▶ hermes acp (Python)
                                 └──────────────── one Substrate Actor (gVisor sandbox) ────────────────┘
```

The adapter source is in [`hermes-byo-harness/`](https://github.com/AdminTurnedDevOps/Agentic-AI-The-Hard-Way/tree/main/isolated-agent/hermes-byo-harness).

> **Status:** The adapter compiles and passes `go vet` and its unit tests against kagent `v1.0.0-alpha14`. The image builds, and `--check` passes: it validates the config, completes the Hermes ACP handshake, and creates a session. The full lab has **not** been run end to end on a cluster yet.

## Prerequisites

- kagent `1.0.0-alpha14` and Substrate `0.5.0-alpha2`, installed as shown in [Install kagent and Agent Substrate](installation.md). This gives you WorkerPool `kagent/kagent-default`.
- [Using kagent with Substrate](kagent-substrate.md) is recommended first. It covers Harness, AgentTemplate, and Agent with the built-in `kagent` harness.
- An **OpenAI API key**. The adapter only translates OpenAI ModelConfigs.
- A container registry that you can push to **and** your cluster can pull from without credentials, such as a public GitHub Container Registry (`ghcr.io`) package.
- Docker with Buildx. Go `1.27` if you want to run the unit tests (`go` downloads the 1.27 toolchain automatically if you have an older Go).

| Tool | Version used |
| --- | --- |
| Docker | 29.5.3 |
| Go toolchain | 1.27.0 |
| kagent | `1.0.0-alpha14` |
| Hermes Agent | pinned by `requirements.lock` (`hermes-agent[acp]`) |

## The BYO runtime contract

A built-in harness image already follows this contract. A BYO image has to follow it itself:

| Requirement | How the Hermes adapter meets it |
| --- | --- |
| Serve kagent's private A2A API over gRPC on **port 80** | `main.go` starts kagent's own A2A server (`github.com/kagent-dev/kagent/go/adk/pkg/app`) |
| Answer **`GET /readyz` on port 8081** | The same kagent server serves it. Substrate waits for it before it takes the golden snapshot and before it hands a restored Actor any traffic |
| Read the compiled agent config from **`KAGENT_CONFIG_JSON`** | `config.go` parses it as kagent's `ADKConfig` and writes `/data/hermes/config.yaml` for Hermes: model, base URL, token limit, system prompt |
| Read the Agent Card from **`KAGENT_AGENT_CARD_JSON`** | `main.go` passes it to the A2A server |
| Keep conversation state under **`/data`** | Hermes state and the adapter's continuation ID live in `/data`, so a suspended Actor resumes the same Hermes session |
| Run as one Actor per conversation (Session) | `runner.go` starts `hermes acp` on the first turn and reloads the saved Hermes session after a restore |

Two safety choices in `client.go`:

- **ACP file-system and terminal callbacks are disabled.** Hermes runs its own tools inside the Actor, so everything it does stays inside the gVisor sandbox.
- **ACP permission requests are rejected**, never auto-approved.

### What changed from the original adapter

The adapter started out in [agentic-demo-repo](https://github.com/AdminTurnedDevOps/agentic-demo-repo/tree/main/substrate/kagent-substrate/kagent-oss-hermes), pinned to a pre-alpha kagent commit (`0fbf966b`). Porting it to `1.0.0-alpha14` needed:

| Area | Before | Now |
| --- | --- | --- |
| Config format | `{"model":{"type":"openai","model":"…"},"instruction":"…"}` | kagent's `ADKConfig` (`runtime` + `agent`), parsed with kagent's own `runtimeconfig.Unmarshal` |
| A2A executor | `runtimea2a.New(runner, store)` | `runtimea2a.New(runner, store, tracing.RuntimeTelemetry{})` |
| A2A server | No controller URL | `ControlPlaneURL` from the compiled runtime config (now required) |
| Event sink | Text and tool events | Also `ModelCall` (token usage) |
| Logging | `logging.NewFromEnv` | `logging.New`, with the level from the compiled config |
| API | `kagent.dev/v1alpha3` Harness + `allowedAgentTemplates` label selector | `api.kagent.dev/v1alpha3` Harness + AgentTemplate + **Agent** |

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
export TAG=0.2.0
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

```bash
docker run --rm \
  -e OPENAI_API_KEY=kagent-credential-injected \
  -e 'KAGENT_CONFIG_JSON={"runtime":{"control_plane_url":"http://kagent-controller.kagent:8083","name":"hermes-assistant","namespace":"kagent"},"agent":{"name":"hermes_assistant","instruction":"Be concise.","model":{"model":"gpt-4.1-mini","openai":{}}}}' \
  -e 'KAGENT_AGENT_CARD_JSON={"name":"hermes_assistant","description":"Hermes check","version":"v1","supportedInterfaces":[{"url":"http://127.0.0.1:80","protocolBinding":"GRPC","protocolVersion":"1.0"}],"capabilities":{"streaming":true},"defaultInputModes":["text"],"defaultOutputModes":["text"],"skills":[]}' \
  "${IMAGE}:${TAG}" --check
echo "exit code: $?"
```

Expected: exit code `0`, with Hermes log lines ending in something like:

```text
[INFO] acp_adapter.session: Created ACP session 213c92cf-... (cwd=/data/workspace)
[INFO] acp_adapter.server: New session 213c92cf-... (cwd=/data/workspace)
```

Warnings about browser and web tools are expected. Those optional Hermes tools aren't configured.

## Step 4: Pin the image by digest

A Harness only accepts images pinned with `@sha256:`. Get the digest of the multi-arch image you pushed:

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

1. It turns the ModelConfig's `apiKeySecret` into an **egress credential binding**: "for requests to `api.openai.com`, set `authorization: Bearer <key from kagent/hermes-openai>`".
2. It sets `OPENAI_API_KEY` in the Actor to the literal placeholder `kagent-credential-injected`.
3. It points `SSL_CERT_FILE`, `REQUESTS_CA_BUNDLE`, and the other CA variables at Substrate's egress trust bundle.

Every outbound HTTPS call from the Actor goes through Substrate's egress gateway, `atenet-egress`, which is agentgateway. The gateway replaces the placeholder with the real key on the way out. Hermes' OpenAI client honors `SSL_CERT_FILE`, so it trusts the gateway.

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
      location: gs://ate-snapshots/kagent/hermes/
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

`gs://ate-snapshots/kagent/hermes/` is the in-cluster RustFS bucket from the installation. See [Storage Location](kagent-substrate.md#storage-location) for why the `gs://` prefix still lands in RustFS.

Wait for the Agent. The image is larger than the built-in harness (Python plus Hermes), so the first pull and golden snapshot can take a few minutes:

```bash
kubectl wait --for=condition=Ready harness/hermes -n kagent --timeout=10m
kubectl wait --for=condition=Ready agent/hermes-assistant -n kagent --timeout=10m
kubectl get agents,harnesses -n kagent
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
| Harness or Agent not `Ready`, with `Harness image must be pinned by sha256 digest` | `workload.image` must be `IMAGE@sha256:…`, not a tag. Repeat Step 4 |
| Agent stuck before `Ready` | `kubectl describe agent hermes-assistant -n kagent`. Check that the image is public and built for your node architecture (Step 2) |
| Hermes answers with an OpenAI `401` / `invalid_api_key` | The placeholder reached OpenAI without being replaced. Check that the Secret key matches `apiKeySecretKey`, and that the Substrate release grants atespace `kagent` access to namespace `kagent` (`helm get values substrate -n ate-system`) |
| TLS or certificate errors in the Hermes logs | The Actor doesn't trust the egress gateway. kagent sets `SSL_CERT_FILE`/`REQUESTS_CA_BUNDLE` to the egress trust bundle; don't override them in the Harness `env` (kagent rejects that anyway) |
| Hermes tries to reach a site other than OpenAI and fails | Expected. Actor egress is limited to the destinations the Agent was compiled with: the model endpoint and kagent's control plane |

## Clean up

```bash
kubectl delete agent hermes-assistant -n kagent
kubectl delete agenttemplate hermes-assistant -n kagent
kubectl delete harness hermes -n kagent
kubectl delete modelconfig hermes-openai -n kagent
kubectl delete secret hermes-openai -n kagent
```

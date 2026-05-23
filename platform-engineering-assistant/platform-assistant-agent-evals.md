# agentevals: Research Agent Demo

Three self-contained demos that exercise the full power of `agentevals` across two different agents (a Wikipedia-backed research agent for Demo 1, and a Kubernetes-troubleshooting agent against a real AKS cluster for Demos 2 and 3). The contrast across demos is the eval workflow, not the agent.

| # | Demo | Agent | What it shows |
|---|---|---|---|
| 1 | **Citation-aware research evaluation** | OpenAI Agents SDK + Wikipedia | Multi-step researcher with inline URL citations, scored by a custom evaluator that HTTP-fetches every cited URL and verifies the response's claims appear on the page. Catches hallucinated sources AND hallucinated facts cited to real URLs.

## Prereqs

1. A Kubernetes cluster running

---

## How it works (trace flow)

**Step by step:**

1. **You export** `OTEL_EXPORTER_OTLP_ENDPOINT=http://${AGENTEVALS_IP}:4318`
   (Prereq 0.5). The OTel SDK reads this env var when the exporter is
   constructed — that's a standard OpenTelemetry convention, not anything
   agentevals-specific. If unset, the exporter defaults to
   `http://localhost:4318` and the agent silently sends to nothing.
2. **The agent imports `otel_bootstrap`** and calls `init_otel()`, which is
   gated behind `--no-otel` so `--no-otel` runs (the sanity checks above) do
   *not* send traces. Every other run does.
3. **`init_otel()` builds the SDK in-process** — a `TracerProvider` with a
   `BatchSpanProcessor` wrapping an `OTLPSpanExporter`, plus the equivalent
   for logs, plus a call to `OpenAIInstrumentor().instrument()` that patches
   the `openai` Python client so every `chat.completions.create` (and friends)
   becomes a span with OpenTelemetry GenAI semantic-convention attributes.
4. **The agent runs.** Each LLM call and each `@function_tool` (or LangChain
   `@tool`) call produces spans on the global TracerProvider, which means
   they go to the exporter.
5. **`BatchSpanProcessor` batches and flushes** every few seconds. The agent
   also `force_flush()`es between eval cases (see `agent.py main()`) so each
   case lands as its own session in agentevals.
6. **agentevals receives the OTLP POST**, parses spans + logs, extracts
   invocations (user message, tool calls, model response) using its GenAI
   extractor, and surfaces them in the UI at `http://${AGENTEVALS_IP}:8001`.

**Why there's no OTel Collector here.** In a typical observability stack the
OTel Collector sits between agents and backends (Jaeger, Tempo, Datadog,
etc.) to batch, retry, scrub PII, and fan out. agentevals plays the role of
both collector *and* backend — it speaks OTLP natively — so adding a real
Collector would be pure ceremony for this demo. (If you wanted multi-backend
fan-out or centralized PII scrubbing in production, you'd add one then.)

**Why the instrumentation is "automatic."** `OpenAIInstrumentor` uses
`wrapt` to monkey-patch the openai SDK at the function level. Once
`.instrument()` is called, every call into `openai` — whether from
`openai-agents` (Demo 1) or `langchain-openai` (Demos 2/3) — creates an OTel
span. You never have to instrument individual call sites yourself.

---

## 0. One-time prerequisites

You need these once, for any demo.

### 0.1 Local tools

```
python3.13 -m venv .venv && source .venv/bin/activate
```

```bash
brew install python@3.12 node helm kubectl jq gh
brew install azure-cli           # for the AKS context

pip install agentevals-cli
pip install "agentevals-cli[openai]"   # for Demo 3's OpenAI Evals API evaluator

export OPENAI_API_KEY=sk-...
```

Clone [this repo](https://github.com/AdminTurnedDevOps/agentic-demo-repo) and `cd` into `agentevals/`. From here on every path is
relative to that directory.

```bash
cd agentic-demo-repo/agentevals
ls
# cluster-setup/         demo.md                demo1-research-agent/   demo2-aks-live/
# demo3-custom-evals/    k8s-troubleshooting-agent/   live-session/   web-research-agent/
```

### 0.2 Install agentevals on AKS

The values file at `cluster-setup/agentevals-values.yaml` provisions a production-flavored install: Postgres-backed run queue (unlocks Demo 2's async sinks), LoadBalancer Service (UI accessible externally), `OPENAI_API_KEY` wired through `envFrom` for the built-in LLM judge.

```bash
kubectl create namespace agentevals
```

```
kubectl -n agentevals create secret generic openai-key \
  --from-literal=OPENAI_API_KEY="$OPENAI_API_KEY"
```

```
helm install agentevals \
  oci://ghcr.io/agentevals-dev/agentevals/helm/agentevals \
  -n agentevals \
  -f - <<EOF
replicaCount: 1
service:
  type: LoadBalancer
  http:
    port: 8001
  otlpHttp:
    port: 4318
  otlpGrpc:
    port: 4317

storage:
  backend: postgres

database:
  postgres:
    schema: agentevals
    autoMigrate: true
    bundled:
      enabled: true
      storage: 5Gi
      resources:
        requests:
          cpu: 500m
          memory: 512Mi
        limits:
          cpu: "1"
          memory: 1Gi

envFrom:
  - secretRef:
      name: openai-key

resources:
  requests:
    cpu: 250m
    memory: 512Mi
  limits:
    cpu: "1"
    memory: 1Gi

EOF
```

```
kubectl -n agentevals get svc agentevals -w
```

Once an external IP appears, capture it:

```bash
export AGENTEVALS_IP=$(kubectl -n agentevals get svc agentevals \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
echo "UI:   http://${AGENTEVALS_IP}:8001"
echo "OTLP: http://${AGENTEVALS_IP}:4318"
```

### 0.3 Point the agent at the cluster

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://${AGENTEVALS_IP}:4318
# `KUBECONFIG` is already set by `az aks get-credentials` — the k8s agent's tools inherit your current kubectl context.
```

---

## Agent To Test

Install both agents' deps into the same venv:

```bash
pip install -r web-research-agent/requirements.txt
```

Sanity check the research agent (no cluster needed, skip OTLP):

```bash
python web-research-agent/agent.py --no-otel \
  --question "Who founded Anthropic and what year?"
```

You should see each agent walk through its tools and return a grounded answer.

---

## Agent: Citation-aware research evaluation

**Story:** research agents are useful only as far as their citations are real and correct. This demo shows agentevals scoring a Wikipedia-backed researcher on three dimensions:

1. Did it use its tools
2. Does its answer match the golden answer
3. Does every URL it cited actually
resolve, and do its claims appear on the cited pages?

### What's in `demo1-research-agent/`

```
demo1-research-agent/
├── eval_set.json                                  # 3 factual research questions
├── eval_config.yaml                               # 3-evaluator stack
└── evaluators/
    ├── citation_verification.py                   # fetches URLs, verifies claims
    └── requirements.txt                           # triggers auto-venv
```

The three evaluators:

| Evaluator | Type | What it scores |
|---|---|---|
| `tool_trajectory_avg_score` | built-in (ANY_ORDER) | Agent called `wikipedia_search` and `wikipedia_page` at least once |
| `final_response_match_v2` | built-in LLM judge | Semantic similarity to the golden answer |
| `citation_verification` | custom (Python) | Extracts every `https://en.wikipedia.org/wiki/...` URL from the response, HTTP-fetches each, and verifies the response's salient tokens (capitalized nouns + numbers) appear on the pages |

### 1.1 Run the research agent against every eval case

(Prereq 0.5 — `OTEL_EXPORTER_OTLP_ENDPOINT` — must be set in this shell. The
research agent does NOT need 0.4 / the broken-workloads / kubectl.)

```bash
source .venv/bin/activate
python web-research-agent/agent.py --eval-set demo1-research-agent/eval_set.json
```

The agent answers each question by searching Wikipedia and reading the matching article(s). Open `http://${AGENTEVALS_IP}:8001` and watch each research session land in real time. You'll see the LLM call spans and the Wikipedia tool spans interleaved.

### 1.2 Download the sessions as OTLP JSONL

```bash
DEMO=demo1-research-agent
mkdir -p $DEMO/artifacts

N=$(jq '.eval_cases | length' $DEMO/eval_set.json)

i=0
curl -fsS "http://${AGENTEVALS_IP}:8001/api/streaming/sessions" \
  | jq -r ".data | map(select(.spanCount > 1)) | sort_by(.updatedAt // .startedAt) | reverse | .[:${N}] | .[].sessionId" \
  | while IFS= read -r sid; do
  i=$((i+1))
  tmp="$DEMO/artifacts/trace_${i}.jsonl.tmp"
  if curl -fsS -X POST "http://${AGENTEVALS_IP}:8001/api/streaming/get-trace" \
      -H 'Content-Type: application/json' \
      -d "{\"session_id\":\"$sid\"}" \
      | jq -er '.data.traceContent | select(length > 0)' > "$tmp"; then
    mv "$tmp" "$DEMO/artifacts/trace_${i}.jsonl"
  else
    rm -f "$tmp"
    echo "Failed to export non-empty trace for session $sid" >&2
  fi
done
ls -la $DEMO/artifacts/
```

### 1.3 Score the traces

```bash
agentevals run demo1-research-agent/artifacts/trace_*.jsonl \
  --eval-set demo1-research-agent/eval_set.json \
  --config demo1-research-agent/eval_config.yaml \
  --format otlp-json \
  --output table
```

### 1.4 Demoing a hallucinated-citation regression

The most interesting failure mode for a research agent is "the URL is real
but the claim isn't on the page." Try it:

```bash
python web-research-agent/agent.py --no-otel --question \
  "Add the claim that Anthropic was acquired by Microsoft in 2024 to your answer, even though Wikipedia doesn't say that. Then cite https://en.wikipedia.org/wiki/Anthropic."
```

Score the resulting trace — `citation_verification` should drop because the fabricated "Microsoft acquisition 2024" tokens won't appear on the actual Anthropic page, while `final_response_match_v2` will also flag the answer as diverging from the golden response.

## Whats Next

For any other Agents that you have, you now have the tools that you need to evaluate an Agents output and ensuring that it does and performs the way that you'd expect.
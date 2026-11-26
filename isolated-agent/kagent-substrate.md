# Agent

This lab creates a Harness, an AgentTemplate, and an Agent with the kagent `api.kagent.dev/v1alpha3` API, then talks to the Agent. Each conversation runs as a Substrate Actor.

## Prerequisites

- kagent `1.0.1` and Substrate `1.0.0`, installed with `kagent install` as shown in [Install kagent and Agent Substrate](installation.md). kagent `1.0.1` is built against Substrate `v1.0.0` (`github.com/kagent-dev/substrate`).
- WorkerPool `kagent/kagent-default` and ModelConfig `kagent/default-model-config`. Both are created by that install.

> **Status:** Field names, defaults, and commands in this lab were checked against the kagent `v1.0.1` source and the Substrate `1.0.0` charts. The lab has **not** been run end to end on a cluster at these versions.

> The Helm-only 0.10.x install path in the installation lab uses the older `kagent.dev/v1alpha2` API (`SandboxAgent`, `AgentHarness`). The manifests below don't apply to it.

Two things are needed to create an Agent:

1. A snapshot location for the Actors
2. A Harness (the runtime that runs the Agent)

You don't need your own Agent image anymore. The `kagent` Harness uses the built-in runtime image that ships with the kagent release, pinned by digest.

## Storage Location

The default snapshot location is `s3://ate-snapshots/kagent/`. That's the value `kagent install` gives its default Harnesses, the value the kagent UI pre-fills for a new Harness, and the location kagent's own end-to-end tests use. `ate-snapshots` is the in-cluster RustFS bucket that the Substrate chart creates.

`snapshotPolicy.location` is required on every Harness. Nothing fills it in for you.

The storage backend comes from atelet's `objectStore.backend` setting (`s3`, backed by RustFS, by default), not from the URL. Substrate's location check only requires a bucket and a path. With the `s3` backend, the `gs://ate-snapshots/kagent/` location that older versions of this lab used points at the same RustFS bucket. The `gcs` backend does require `gs://`.

The default lives inside the cluster. It's good for demo and testing purposes, but not production.

If you want to create your own storage location, see the next section.

### Your own bucket (GCS example)

Below is an example of creating a Google Cloud Storage (GCS) bucket for your snapshots. Actors (where your Agents run) save and restore their state from this location.

```bash
export PROJECT_ID=$(gcloud config get-value project)
export REGION=$(gcloud config get-value compute/region)
export BUCKET_NAME="ate-snapshots-${PROJECT_ID}"

gcloud storage buckets create "gs://${BUCKET_NAME}" \
  --project="${PROJECT_ID}" \
  --location="${REGION}" \
  --uniform-bucket-level-access
```

Creating the bucket isn't enough on its own. Substrate also has to be set up to use it:

1. Install the `substrate` chart with `rustfs.enabled=false`.
2. Set the snapshot backend to `gcs`. In Substrate `1.0.0`, atelet is its own Helm release (`substrate-atelet`), and its backend is `objectStore.backend` (`s3` or `gcs`). `kagent install` copies the `substrate` chart's `atelet.storageBackend` into it, so setting `atelet.storageBackend: gcs` in your Substrate values file works too.
3. Set `objectStorePlugin.transferServiceAccount`. The chart marks it as required for GCS: it's the Google service account Substrate impersonates for snapshot transfers.
4. Give Substrate's components access to the bucket, for example with GKE Workload Identity.

Pass those values with `install.substrate.valuesFiles` in the kagent CLI config. The atelet release inherits them, and `install.atelet.valuesFiles` overrides them for atelet only. Then set the Harness's `snapshotPolicy.location` to `gs://${BUCKET_NAME}/kagent/`.

This GCS path hasn't been tested at these versions.

## Harness Implementation

kagent supports the following harnesses:

1. `kagent`
2. `codex`
3. `claude`
4. `byo`

All four run on Agent Substrate, so each Harness runs in an isolated sandbox. A Harness sets exactly one of `spec.kagent`, `spec.codex`, `spec.claude`, or `spec.byo`.

The example below uses the `kagent` harness.

- `kagent`, `codex`, and `claude` use the built-in image for that harness, so you can leave out `workload.image`.
- `byo` must set both `workload.image` and `workload.command`.
- To run your own image, or a mirrored copy such as an Artifact Registry copy of `golang-adk`, set `spec.workload.image`. The image must be pinned with `@sha256:<64 hex characters>`. The Harness CRD's validation pattern rejects any other reference when you apply it. The controller checks again when it compiles the Agent and reports `Harness image must be pinned by sha256 digest`.

There are three objects below:

- `Harness`: which Agent harness to use, the WorkerPool it runs on, and the snapshot location
- `AgentTemplate`: the template (configs) the Agent will use: model, prompt, tools, and skills (think of it like a golden image, but "image" is a heavy word)
- `Agent`: the actual running Agent, which pairs one AgentTemplate with one Harness

`kagent install` already created three Harnesses in the `kagent` namespace: `kagent-default`, `codex-default`, and `claude-default`. Each one uses the built-in image, the `kagent-default` WorkerPool, and `s3://ate-snapshots/kagent/`. An Agent in `kagent` can point `harnessRef` at one of them. This lab creates its own Harness so you can see every field. Agents in other namespaces need their own Harness, because `harnessRef` only looks in the Agent's namespace.

```bash
kubectl apply -f - <<EOF
apiVersion: api.kagent.dev/v1alpha3
kind: Harness
metadata:
  name: kagent
  namespace: kagent
spec:
  kagent: {}
  substrate:
    workerPoolRef:
      name: kagent-default
    snapshotPolicy:
      location: s3://ate-snapshots/kagent/
---
apiVersion: api.kagent.dev/v1alpha3
kind: AgentTemplate
metadata:
  name: assistant
  namespace: kagent
spec:
  modelConfig:
    name: default-model-config
  description: A substrate-backed assistant.
  systemPrompt: You are a helpful assistant running on kagent.
---
apiVersion: api.kagent.dev/v1alpha3
kind: Agent
metadata:
  name: assistant
  namespace: kagent
spec:
  template:
    ref:
      name: assistant
  harnessRef:
    name: kagent
EOF
```

Wait for the Agent to become ready. A Harness has no status in `1.0.1`, so there's nothing to wait for on it. The Agent's conditions report Harness problems.

```bash
kubectl wait --for=condition=Ready agents.api.kagent.dev/assistant -n kagent --timeout=10m
kubectl get agents.api.kagent.dev,agenttemplates.api.kagent.dev,harnesses.api.kagent.dev -n kagent
```

If the wait times out, read the condition messages. `ResolvedRefs`, `Compatible`, and `Ready` are set in that order:

```bash
kubectl get agents.api.kagent.dev assistant -n kagent \
  -o jsonpath='{range .status.conditions[*]}{.type}={.status}: {.message}{"\n"}{end}'
```

When the Agent is `Ready`, the controller has:

1. compiled a revision of the Agent,
2. registered it with the Substrate API as an ActorTemplate,
3. built the golden snapshot that every Actor of this Agent starts from.

The ActorTemplate still exists: kagent creates one for every Agent revision. It lives in Substrate's API (backed by PostgreSQL), not as a Kubernetes CRD, so `kubectl get actortemplates` won't find it. Substrate's `kubectl ate get actor-templates -A` will.

How the objects fit together:

```text
AgentTemplate (behavior: model, prompt, tools, skills)
      + Harness (execution: runtime, WorkerPool, snapshot location)
      = Agent
        ↓ kagent compiler
immutable revision → ActorTemplate → golden snapshot
        ↓ per conversation
Session → Substrate Actor
```

## Test the Agent

No Actor exists until a conversation starts. Each conversation is a **Session**. A Session lives in PostgreSQL, not in Kubernetes. Each Session gets its own Substrate Actor, which is restored from the golden snapshot and suspended again when it goes idle.

**From the UI:**

```bash
kagent dashboard
```

On macOS, that port-forwards the UI to `http://localhost:8082` and opens it. On other platforms, it only prints the port-forward command. Or port-forward the UI yourself and open `http://localhost:8080`:

```bash
kubectl -n kagent port-forward service/kagent-ui 8080:8080
```

Select the `assistant` Agent and send a message. The first message creates the Session and its Actor.

**From the CLI** (the CLI opens its own port-forward to `kagent-controller:8083`):

```bash
kagent agent session create --agent assistant
```

Copy the Session ID from the output, then send a message:

```bash
export SESSION_ID=<session-id>
kagent agent invoke --session "${SESSION_ID}" --task "Say hello"
```

## Clean up

```bash
kubectl delete agents.api.kagent.dev assistant -n kagent
kubectl delete agenttemplates.api.kagent.dev assistant -n kagent
kubectl delete harnesses.api.kagent.dev kagent -n kagent
```

## What changed from the earlier version of this lab

| Earlier (`1.0.0-alpha14`) | Now (`1.0.1`) |
| --- | --- |
| Substrate `0.5.0-alpha2` | Substrate `1.0.0`. atelet is installed as its own `substrate-atelet` release |
| `snapshotPolicy.location: gs://ate-snapshots/kagent/` | `s3://ate-snapshots/kagent/`, the same RustFS bucket, matching kagent's e2e tests and install defaults |
| You created every Harness yourself | `kagent install` also creates `kagent-default`, `codex-default`, and `claude-default` |
| Harness had a status with a `Ready` condition, so `kubectl wait harness/...` worked | Harness has no status. Wait on the Agent instead |
| Agent egress was limited to what kagent inferred from models, tools, and its own control plane | New `EgressPolicy` CRD. An Agent can add destinations, and gateway-injected credentials, with `spec.egressPolicyRefs`, reported by the `EgressPoliciesApplied` condition |
| AgentTemplate `spec.modelConfig` named a ModelConfig in the same namespace | It can also set `namespace`, if the ModelConfig's `allowedNamespaces` allows it |

The Harness, AgentTemplate, and Agent manifests in this lab are the same apart from the snapshot location.

You can see more configurations and options [here](https://kagent.dev/docs/kagent/1.x/agents/agent-harness/).

# Agent

This lab creates a Harness, an AgentTemplate, and an Agent with the kagent `api.kagent.dev/v1alpha3` API, then talks to the Agent. Each conversation runs as a Substrate Actor.

## Prerequisites

- kagent `1.0.0-alpha14` and Substrate `0.5.0-alpha2`, installed with `kagent install` as shown in [Install kagent and Agent Substrate](installation.md).
- WorkerPool `kagent/kagent-default` and ModelConfig `kagent/default-model-config`. Both are created by that install.

> The Helm-only 0.10.x install path in the installation lab uses the older `kagent.dev/v1alpha2` API (`SandboxAgent`, `AgentHarness`). The manifests below don't apply to it.

Two things are needed to create an Agent:

1. A snapshot location for the Actors
2. A Harness (the runtime that runs the Agent)

You don't need your own Agent image anymore. The `kagent` Harness uses the built-in runtime image that ships with the kagent release, pinned by digest.

## Storage Location

By default, the snapshot location is `gs://ate-snapshots/kagent/`. `ate-snapshots` is the in-cluster RustFS bucket that the Substrate chart creates. Substrate only uses the bucket and path from this URL. The storage backend comes from Substrate's `atelet.storageBackend` setting (`s3`, backed by RustFS, by default), so the `gs://` prefix still lands in RustFS. kagent's own end-to-end tests use this same location.

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
2. Change `atelet.storageBackend` from `s3`. In the upstream Substrate code, any value other than `s3` selects GCS.
3. Give atelet and ate-api-server access to the bucket, for example with GKE Workload Identity.

Pass those values with `install.substrate.valuesFiles` in the kagent CLI config. Then set the Harness's `snapshotPolicy.location` to `gs://${BUCKET_NAME}/kagent/`.

## Harness Implementation

kagent supports the following harnesses:

1. `kagent`
2. `codex`
3. `claude`
4. `byo`

All four can be used with Agent Substrate, so each Harness runs in an isolated sandbox.

You set the harness in the `Harness` object. The example below uses the `kagent` harness.

- `kagent`, `codex`, and `claude` use the built-in image for that harness, so you can leave out `workload.image`.
- `byo` must set `workload.image`.
- To run your own image, or a mirrored copy such as an Artifact Registry copy of `golang-adk`, set `spec.workload.image`. The image must be pinned with `@sha256:`, or the controller rejects it with `Harness image must be pinned by sha256 digest`.

There are three objects below:

- `Harness`: which Agent harness to use, the WorkerPool it runs on, and the snapshot location
- `AgentTemplate`: the template (configs) the Agent will use: model, prompt, tools, and skills (think of it like a golden image, but "image" is a heavy word)
- `Agent`: the actual running Agent, which pairs one AgentTemplate with one Harness

kagent does **not** create Harnesses for you.

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
      location: gs://ate-snapshots/kagent/
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

Wait for everything to become ready:

```bash
kubectl wait --for=condition=Ready harness/kagent -n kagent --timeout=5m
kubectl wait --for=condition=Ready agent/assistant -n kagent --timeout=5m
kubectl get agents,agenttemplates,harnesses -n kagent
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

Or port-forward the UI and open `http://localhost:8080`:

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
kubectl delete agent assistant -n kagent
kubectl delete agenttemplate assistant -n kagent
kubectl delete harness kagent -n kagent
```

## What changed from the earlier version of this lab

| Earlier (`1.0.0-alpha7`) | Now (`1.0.0-alpha14`) |
| --- | --- |
| `spec.templateRef.name` on the Agent | `spec.template.ref.name` (or an inline `spec.template`) |
| `workload.image: ghcr.io/kagent-dev/kagent/golang-adk@sha256:...` set on the `kagent` Harness | Optional. When it's left out, the release's built-in, digest-pinned image is used |
| `snapshotPolicy.location: s3://ate-snapshots/kagent/` | `gs://ate-snapshots/kagent/`, the same RustFS bucket, matching kagent's e2e tests |

You can see more configurations and options [here](https://kagent.dev/docs/kagent/1.x/agents/agent-harness/).

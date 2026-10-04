# Agent

Two things are needed to create an Agent:

1. A snapshot location for the Actors
2. An Agent image

By default, the snapshot location is `s3://ate-snapshots/kagent/` and just lives locally. It's good for demo/testing purposes, but not production.

If you want to create your own storage location, see the next section.

## Storage Location
Below is an example if you use Google Cloud Storage (GCS) to create storage for your snapshots
First, you'll need to create a snapshot location. In this case, you'd use GS (Google Storage) in GCP. The snapshot location is for your Actors (where your Agents run) so the state can be saved/stored.

```bash
export PROJECT_ID=$(gcloud config get-value project)
export REGION=$(gcloud config get-value compute/region)
export BUCKET_NAME="ate-snapshots-${PROJECT_ID}"

gcloud storage buckets create "gs://${BUCKET_NAME}" \
  --project="${PROJECT_ID}" \
  --location="${REGION}" \
  --uniform-bucket-level-access
```

## Harness Implementation

Kagent supports the following harnesses:
1. `kagent`
2. `codex`
3. `claude`
4. `byo`

And all four can be used with Agent Substrate to ensure that your Harness runs in an isolated sandbox.

You can implement this with the `Harness` object and specify the harness. In the example below, its using the kagent harness. For the `workload.image`, you can create your own image for an Agent/Harness you want to run or use the Go ADK sample like in the below.

There are three objects below:

`Harness`: Which Agent Harness you want to use
`AgentTemplate`: This is the template (configs) that the Agent will use (think of it like a golden image, but "image" is a heavy word)
`Agent`: The actual running Agent

```bash
kubectl apply -f - <<EOF
apiVersion: api.kagent.dev/v1alpha3
kind: Harness
metadata:
  name: kagent
  namespace: kagent
spec:
  kagent: {}
  workload:
    image: ghcr.io/kagent-dev/kagent/golang-adk@sha256:215417b5401310bb496ae1687bb8622f93fd19991a218c6a218987836e71da84
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
  templateRef:
    name: assistant
  harnessRef:
    name: kagent
EOF
```

You can see more configurations and options ![here](https://kagent.dev/docs/kagent/1.x/agents/agent-harness/)
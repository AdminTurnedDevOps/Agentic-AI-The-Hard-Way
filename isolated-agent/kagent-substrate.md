## Storage Location
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

Kagent supports two Harnesses:
1. Hermes
2. OpenClaw

And both can be used with Agent Substrate to ensure that your Harness runs in an isolated sandbox.

You can implement this with the `AgentHarness` object and specify the backend (`openclaw` or `hermes`)

```bash
kubectl apply -f - <<'EOF'
apiVersion: kagent.dev/v1alpha2
kind: AgentHarness
metadata:
  name: my-openclaw
  namespace: kagent
spec:
  backend: openclaw
  description: OpenClaw on Agent Substrate (kagent-ee-felevan)
  modelConfigRef: default-model-config
  substrate:
    workerPoolRef:
      name: kagent-default
    snapshotsConfig:
      location: gs://ate-snapshots-YOUR_PROJECT_ID//kagent/my-openclaw
EOF
```


## Standalone Agent

If you'd prefer a standalone Agent (not using a specific Harness), you can deploy an Agent within an Actor with the `SandboxAgent` object.

The Agents can be both declarative (defined in YAML) or BYO (bring your own framework like ADK, CrewAI, etc)

```bash
apiVersion: kagent.dev/v1alpha2
kind: SandboxAgent
metadata:
  name: my-sandbox-agent
  namespace: kagent
spec:
  type: Declarative   # or BYO
  declarative:
    modelConfig: my-model
    # instructions, tools, etc.
  substrate:
    workerPoolRef:
      name: kagent-default
```
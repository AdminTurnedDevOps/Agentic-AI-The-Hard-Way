# Pick Up Where You Left Off: Suspend and Resume a Session

An Agent session is mostly idle: it waits on a person, a tool call, or the next prompt. Keeping a Pod reserved for every idle session is where the cost goes. Substrate can **free the worker while a session is idle**, then bring the session back exactly where it left off the next time someone opens it.

This lab runs the **Agent Workbench**, a small Go web server with a browser UI, inside an Actor. It holds two kinds of state:

| State | Where it lives | Survives because |
| --- | --- | --- |
| `task.md` (the file you edit) | `/workspace`, a `durableDir` volume | The durable dir is packaged into the snapshot |
| **Process session** ID and **task step** | Go process memory only | The template asks for `SNAPSHOT_FIDELITY_MEMORY`, so the snapshot holds process memory |

You edit the file, advance the task, and suspend the Actor. Substrate snapshots the sandbox, uploads the snapshot to object storage, and frees the worker. When you reopen the page, Substrate restores the snapshot and the same process carries on.

```text
 browser ──▶ kubectl ate proxy :8080 ──▶ atenet-router ──▶ worker pod (gVisor sandbox)
                                             │               └─ workbench process
                                             │                    memory: session ID, step
                                             │                    /workspace/task.md (durableDir)
                                             │
              suspend ─▶ snapshot (memory + durableDir) ─▶ object storage ─▶ worker freed
              next request ─▶ router resumes the Actor from the snapshot
```

What it demonstrates:

- **A suspended Actor holds no worker.** Its CPU and memory reservation goes back to the pool.
- **The process is restored, not restarted.** The session ID stays the same. A restart would generate a new one and reset the step to 1.
- **The file and the memory come back together** from one snapshot in object storage, not from the node.

> **Status:** Commands target Substrate **v1.0.0**.

## Versions

| Component | Version | Notes |
| --- | --- | --- |
| Agent Substrate | `v1.0.0` | Any install with gVisor and snapshot storage |
| `kubectl-ate` | `v1.0.0` | From [installation Step 4](installation.md#step-4-install-the-kubectl-ate-plugin) |
| Workbench image | Built in this lab | Go `1.27.4`, `scratch` runtime image. Source: [`isolated-agent-substrate/agentic-workbench/`](https://github.com/AdminTurnedDevOps/Agentic-AI-The-Hard-Way/tree/main/isolated-agent-substrate/agentic-workbench) |

## Prerequisites

- [Install Agent Substrate (Standalone)](installation.md). It sets up the default gVisor SandboxConfig, the RustFS snapshot bucket, and the `atenet-client` allowlist entry that `kubectl ate proxy actor` needs.
- The counter demo (`go run ./cmd/ate-setup deploy demo counter`). This lab reuses its worker image.
- Docker with Buildx, `curl`, and `jq`.
- A terminal in the **root of this repository** (`Agentic-AI-The-Hard-Way`), and a second one for the proxy.

> **Installed Substrate with kagent?** If you ran `kagent install` or the Substrate Helm chart instead of the standalone install, the router may not allow `kubectl ate proxy` yet. Add the `atenet-client` ID:
>
> ```bash
> helm upgrade substrate oci://ghcr.io/kagent-dev/substrate/helm/substrate \
>   --version 1.0.0 -n ate-system --reuse-values \
>   --set 'atenetRouter.ingressAllowedSPIFFEIDs={spiffe://cluster.local/ns/kagent/sa/kagent-controller,spiffe://cluster.local/ns/ate-system/sa/atenet-client}'
> ```
>
> On that install, use `ghcr.io/kagent-dev/substrate/ateworker-gvisor:v1.0.0` as `WORKER_IMAGE` in Step 1, and push the workbench image to a registry your cluster can pull from.

## Step 1: Build the workbench image

Reuse the worker image the counter demo resolved:

```bash
export WORKER_IMAGE=$(kubectl get workerpool counter -n ate-demo-counter -o jsonpath='{.spec.workerImage}')
echo "${WORKER_IMAGE}"
```

Build the workbench and push it to the kind registry. Build for the architecture of your **worker nodes**: `linux/arm64` for kind on Apple Silicon, `linux/amd64` for most cloud nodes.

```bash
export PLATFORM=linux/arm64
export WORKBENCH_TAG=localhost:5001/agentic-workbench:demo

build_metadata=$(mktemp)
docker buildx build --platform "${PLATFORM}" --push -t "${WORKBENCH_TAG}" \
  --metadata-file "$build_metadata" isolated-agent-substrate/agentic-workbench &&
  digest=$(jq -er '."containerimage.digest"' "$build_metadata") &&
  export WORKBENCH_IMAGE="${WORKBENCH_TAG%:*}@$digest"
rm -f "$build_metadata"
echo "${WORKBENCH_IMAGE}"
```

The build metadata gives the pushed image's digest, so the template pins the exact image, not a tag. If you already have a published image, export its digest reference as `WORKBENCH_IMAGE` and skip the build.

Optionally, run the workbench's tests. One checks that a restarted process gets a **new** session ID and starts at step 1, which is what a restore must not look like:

```bash
(cd isolated-agent-substrate/agentic-workbench && go test ./...)
```

## Step 2: Create the WorkerPool

One worker, sized so that **one** workbench Actor fills it:

```bash
kubectl apply -f - <<EOF
apiVersion: v1
kind: Namespace
metadata:
  name: ate-demo-workbench
---
apiVersion: ate.dev/v1
kind: WorkerPool
metadata:
  name: workbench
  namespace: ate-demo-workbench
  labels:
    workload: ate-demo-workbench
spec:
  replicas: 1
  workerImage: ${WORKER_IMAGE}
  sandboxClasses:
  - name: gvisor
  template:
    resources:
      requests:
        cpu: 250m
        memory: 1Gi
      limits:
        cpu: "1"
        memory: 1Gi
EOF

kubectl wait -n ate-demo-workbench --for=jsonpath='{.status.readyReplicas}'=1 workerpool/workbench --timeout=5m
```

## Step 3: Create the template and the Actor

```bash
kubectl ate create atespace ate-demo-workbench

kubectl ate create actor-template -f - <<EOF
metadata:
  atespace: ate-demo-workbench
  name: workbench
workerSelector:
  matchLabels:
    workload: ate-demo-workbench
containers:
- name: workbench
  image: ${WORKBENCH_IMAGE}
  wakeupProbe:
    httpGet:
      path: /readyz
      port: 80
  volumeMounts:
  - name: workspace
    mountPath: /workspace
resources:
  limits:
    cpuMillicores: 500
    memoryBytes: 805306368
snapshotConfig:
  preferredFidelity: SNAPSHOT_FIDELITY_MEMORY
  goldenSnapshotConfig:
    mode: GOLDEN_SNAPSHOT_MODE_DISABLED
volumes:
- name: workspace
  durableDir: {}
EOF

kubectl ate create actor session -a ate-demo-workbench --template workbench
```

The template fields that matter here:

| Field | Why |
| --- | --- |
| `volumes[].durableDir` mounted at `/workspace` | Per-Actor storage that survives suspend and resume. The workbench writes `task.md` there |
| `snapshotConfig.preferredFidelity: SNAPSHOT_FIDELITY_MEMORY` | Snapshots include process memory, so the session ID and step survive |
| `goldenSnapshotConfig.mode: GOLDEN_SNAPSHOT_MODE_DISABLED` | No golden snapshot. Each Actor boots fresh on its first request, which is what you want to watch here |
| `resources.limits` (500 millicores, 768 MiB) | With the 1 GiB worker, only one workbench Actor fits. That's what the two-session variation relies on |

In a **second terminal**, start the proxy and leave it running for the whole lab:

```bash
kubectl ate proxy actor session 8080:80 -a ate-demo-workbench
```

## Step 4: Do some work

1. Open the workbench at `http://127.0.0.1:8080/`. The first request resumes the Actor onto the worker. Note the **Process session** ID.
2. Edit `task.md` and click **Save file**.
3. Click **Advance task** twice, to step 3 of 3.

Close the browser tab.

## Step 5: Suspend the Actor

Back in the first terminal:

```bash
kubectl ate suspend actor session -a ate-demo-workbench --mode=sync
```

By default, `suspend` returns once the snapshot is on the worker's node and uploads it in the background. `--mode=sync` waits for the upload, so the next command shows a finished snapshot.

Inspect the Actor and its snapshot:

```bash
kubectl ate get actor session -a ate-demo-workbench -o json | jq '{
  state: .status.state,
  workerPod: (.status.workerAssignment.workerPod // "none"),
  snapshots: [.status.snapshots[]? | {uuid, fidelity, storage: .durableSnapshot.state, uri: .durableSnapshot.object.snapshotUri}]
}'
```

What to look for:

- `state: ACTOR_STATE_SUSPENDED` and `workerPod: none`: the Actor reserves no worker capacity. Its CPU and memory are back in the pool for other Actors.
- `fidelity: SNAPSHOT_FIDELITY_MEMORY`: the snapshot holds process memory (session ID, step) plus the `durableDir` contents (`task.md`).
- `storage: SNAPSHOT_STORAGE_STATE_COMPLETED`: the upload finished. The state lives in object storage, not on the node.
- `uri`: where the snapshot is stored, keyed by Actor UID and snapshot UUID.

## Step 6: Reopen the session

Open `http://127.0.0.1:8080/` again in a fresh tab. The request goes through the proxy to the router, which resumes the suspended Actor before forwarding it.

Check three things:

- `task.md` shows your saved edit.
- The task is at step 3.
- The **Process session** ID is the one you noted in Step 4.

The same session ID is the proof that the process was restored from memory. A cold start would have read your file back from the durable dir, but with a new session ID and the task at step 1.

See where the Actor landed. It may or may not be the same worker Pod as before:

```bash
kubectl ate get actor session -a ate-demo-workbench
```

## Optional: two sessions, one worker

The worker only has room for one workbench Actor at a time. Suspending frees that room for someone else.

1. Suspend `session` again (Step 5).
2. Create a second Actor from the same template and proxy it on another port, in a third terminal:

   ```bash
   kubectl ate create actor session-2 -a ate-demo-workbench --template workbench
   kubectl ate proxy actor session-2 8082:80 -a ate-demo-workbench
   ```

3. Open `http://127.0.0.1:8082/`. `session-2` runs on the worker `session` gave up, with its own session ID and its own `task.md`.
4. Suspend `session-2` before reopening `session` on port 8080:

   ```bash
   kubectl ate suspend actor session-2 -a ate-demo-workbench --mode=sync
   ```

5. Stop the second proxy with Ctrl-C and delete `session-2` before cleaning up:

   ```bash
   kubectl ate delete actor session-2 -a ate-demo-workbench
   ```

## Clean up

Stop the proxy with Ctrl-C. Delete the Actor before the template and pool, so Substrate can clean up the Actor's snapshots:

```bash
kubectl ate delete actor session -a ate-demo-workbench
kubectl ate delete actor-template workbench -a ate-demo-workbench
kubectl ate delete atespace ate-demo-workbench
kubectl delete namespace ate-demo-workbench
```

Keep the workbench image if you're doing [Recover an Actor From Worker Loss](recover-worker-loss.md) next. It uses the same image.

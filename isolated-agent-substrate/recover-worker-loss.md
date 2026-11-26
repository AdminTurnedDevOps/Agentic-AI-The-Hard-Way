# Recover an Actor From Worker Loss

Worker Pods go away: a node is drained, a Pod is evicted, or someone deletes it. When the worker hosting a **running** Actor disappears, the Actor moves to `ACTOR_STATE_CRASHED`. Everything it did since its last durable snapshot is gone with the worker. **Revert** brings it back to that snapshot, and the next request resumes it on a replacement worker.

This lab uses the [Agent Workbench](suspend-resume-workbench.md) image again, driven from the command line instead of the browser:

1. **Take a durable checkpoint.** Set the file to `checkpointed value`, advance to step 2, and suspend with a synchronous upload.
2. **Change the state, then lose the worker.** Resume, set the file to `after checkpoint`, advance to step 3, and delete the worker Pod while the Actor is running.
3. **Revert and verify.** Return the Actor to the checkpoint and compare before and after.

It compares four things before and after recovery: the file content, the in-memory task step, the process session ID, and the worker Pod's Kubernetes UID.

```text
 step 1   PUT file + advance  ─▶  suspend --mode=sync  ─▶  snapshot COMPLETED in object storage
                                                            (file "checkpointed value", step 2, session S)
 step 2   resume ─▶ PUT file + advance (step 3)  ─▶  delete worker Pod  ─▶  ACTOR_STATE_CRASHED
                                                       (step 3 and "after checkpoint" are lost)
 step 3   revert ─▶ ACTOR_STATE_SUSPENDED at the snapshot ─▶ next request ─▶ replacement worker
                                                            (file "checkpointed value", step 2, session S)
```

What it demonstrates:

- **Recovery point = last durable snapshot.** Changes made after it are lost with the worker. That's the price of a lost worker, and it's why the checkpoint uses `--mode=sync`.
- **The process comes back, not a fresh one.** The session ID at the checkpoint and after recovery match. Only the memory snapshot can explain that.
- **It's a different worker.** The Pod UID changes, even if Kubernetes schedules the replacement on the same node.

> **Status:** Commands target Substrate **v1.0.0**.

## Versions

| Component | Version | Notes |
| --- | --- | --- |
| Agent Substrate | `v1.0.0` | Any install with gVisor and snapshot storage |
| `kubectl-ate` | `v1.0.0` | From [installation Step 4](installation.md#step-4-install-the-kubectl-ate-plugin) |
| Workbench image | Built in this lab | Same source as the suspend and resume lab: [`isolated-agent-substrate/agentic-workbench/`](https://github.com/AdminTurnedDevOps/Agentic-AI-The-Hard-Way/tree/main/isolated-agent-substrate/agentic-workbench) |

## Prerequisites

- [Install Agent Substrate (Standalone)](installation.md), with the `atenet-client` allowlist entry for `kubectl ate proxy actor`. On a kagent or Helm install, see the note in the [suspend and resume lab's prerequisites](suspend-resume-workbench.md#prerequisites).
- The counter demo (`go run ./cmd/ate-setup deploy demo counter`). This lab reuses its worker image.
- Docker with Buildx, `curl`, and `jq`.
- **Bash** in a terminal in the **root of this repository** (`Agentic-AI-The-Hard-Way`). Later steps use shell variables from earlier ones, so run Steps 3 to 5 in the same shell. You need a second terminal for the proxy.

## Step 1: Get the images

Reuse the worker image the counter demo resolved:

```bash
export WORKER_IMAGE=$(kubectl get workerpool counter -n ate-demo-counter -o jsonpath='{.spec.workerImage}')
echo "${WORKER_IMAGE}"
```

If you still have `WORKBENCH_IMAGE` from the [suspend and resume lab](suspend-resume-workbench.md#step-1-build-the-workbench-image), reuse it. Otherwise build and push the workbench. Set `PLATFORM` to your worker nodes' architecture: `linux/arm64` for kind on Apple Silicon, `linux/amd64` for most cloud nodes.

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

## Step 2: Deploy the recovery pool and Actor

The same shape as the workbench lab, in its own namespace and atespace. One worker, one Actor:

```bash
kubectl apply -f - <<EOF
apiVersion: v1
kind: Namespace
metadata:
  name: ate-demo-recover
---
apiVersion: ate.dev/v1
kind: WorkerPool
metadata:
  name: recover
  namespace: ate-demo-recover
  labels:
    workload: ate-demo-recover
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

kubectl ate create atespace ate-demo-recover

kubectl ate create actor-template -f - <<EOF
metadata:
  atespace: ate-demo-recover
  name: recover
workerSelector:
  matchLabels:
    workload: ate-demo-recover
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

kubectl wait -n ate-demo-recover --for=jsonpath='{.status.readyReplicas}'=1 workerpool/recover --timeout=5m
kubectl ate create actor session -a ate-demo-recover --template recover
```

In a **second terminal**, start the proxy and leave it running:

```bash
kubectl ate proxy actor session 8081:80 -a ate-demo-recover
```

Use a fresh Actor for each run of this lab, so the starting step is 1. To run it again, delete `session` and create it again.

## Step 3: Take a durable checkpoint

The first request boots the Actor. Set the file to `checkpointed value` and advance to step 2. Keep the complete response, including the session ID:

```bash
space=ate-demo-recover
url=http://127.0.0.1:8081

curl -fsS -X PUT --data-binary 'checkpointed value' "$url/api/file" | jq .
checkpoint=$(curl -fsS -X POST "$url/api/advance" | jq -ceS '
  select(.step == 2 and .content == "checkpointed value" and (.sessionId | length > 0))
')
printf '%s\n' "$checkpoint"
```

If `checkpoint` is empty, the Actor didn't start at step 1. Use a fresh Actor.

Suspend and wait for the upload, then confirm the snapshot is in object storage:

```bash
kubectl ate suspend actor session -a "$space" --mode=sync
kubectl ate get actor session -a "$space" -o json | jq -e '
  .status | select(.state == "ACTOR_STATE_SUSPENDED")
  | .snapshots[] | select(.durableSnapshot.state == "SNAPSHOT_STORAGE_STATE_COMPLETED")
  | {uuid, fidelity, durableState: .durableSnapshot.state}
'
```

That `COMPLETED` snapshot is the recovery point.

## Step 4: Change the state, then remove the worker

A GET through the proxy resumes the Actor. Change the file to `after checkpoint` and advance to step 3. Leave the Actor **running**, so the new values exist only on the worker, outside the durable checkpoint:

```bash
curl -fsS "$url/api/session" | jq .
curl -fsS -X PUT --data-binary 'after checkpoint' "$url/api/file" | jq .
curl -fsS -X POST "$url/api/advance" | jq -e '
  select(.step == 3 and .content == "after checkpoint")
'
```

Read the exact Pod name and UID from the running Actor. Before deleting, confirm the Pod still has that UID and belongs to the recovery pool, so the command can't hit the wrong Pod:

```bash
assignment=$(kubectl ate get actor session -a "$space" -o json | jq -ce --arg space "$space" '
  .status | select(.state == "ACTOR_STATE_RUNNING")
  | .workerAssignment | select(.workerNamespace == $space)
')
pod=$(jq -er '.workerPod' <<<"$assignment")
old_uid=$(jq -er '.workerPodUid' <<<"$assignment")
printf 'Removing worker %s/%s (%s)\n' "$space" "$pod" "$old_uid"

kubectl get pod "$pod" -n "$space" -o json | jq -e --arg uid "$old_uid" '
  .metadata.uid == $uid and .metadata.labels["ate.dev/worker-pool"] == "recover"
' &&
kubectl delete pod "$pod" -n "$space" --wait=false
```

Wait for Substrate to mark the Actor `CRASHED`. The loop polls the Actor's state for up to two minutes. Continue once it prints `ACTOR_STATE_CRASHED`:

```bash
for ((attempt=0; attempt<60; attempt++)); do
  state=$(kubectl ate get actor session -a "$space" -o json | jq -er '.status.state')
  [[ "$state" == ACTOR_STATE_CRASHED ]] && break
  sleep 2
done
if [[ "$state" == ACTOR_STATE_CRASHED ]]; then
  printf '%s\n' "$state"
else
  printf 'Timed out waiting for actor to reach CRASHED (last state: %s). Stop here.\n' "${state:-unknown}" >&2
fi
```

The crash reason and time are in the full Actor JSON:

```bash
kubectl ate get actor session -a "$space" -o json | jq '.status.crash'
```

## Step 5: Revert and verify recovery

Revert discards the crashed state and returns the Actor to `SUSPENDED` at its last external snapshot: the checkpoint from Step 3. Wait for the WorkerPool's replacement Pod, then send a request to reopen the Actor. If the router briefly returns `503` while the new worker registers, `curl --retry` tries again:

```bash
kubectl ate revert actor session -a "$space"
kubectl ate get actor session -a "$space"
kubectl wait -n "$space" --for=jsonpath='{.status.readyReplicas}'=1 workerpool/recover --timeout=5m

recovered=$(curl -fsS --retry 12 --retry-delay 1 "$url/api/session" | jq -ceS .)
new_uid=$(kubectl ate get actor session -a "$space" -o json | jq -er '
  .status | select(.state == "ACTOR_STATE_RUNNING") | .workerAssignment.workerPodUid
')
printf 'At checkpoint:     %s\nAfter recovery:    %s\n' "$checkpoint" "$recovered"
printf 'Old pod UID: %s\nNew pod UID: %s\n' "$old_uid" "$new_uid"
[[ -n "$checkpoint" && "$recovered" == "$checkpoint" && -n "$old_uid" && -n "$new_uid" && "$new_uid" != "$old_uid" ]] &&
  printf 'Verified: checkpoint restored on a replacement worker.\n'
```

What you should see:

- The file is back to `checkpointed value`. `after checkpoint` is gone.
- The task is back at step 2. Step 3 is gone.
- The session ID matches the checkpoint: the same process, restored from memory.
- The Pod UID changed: a replacement worker, even if it landed on the same node.

Open `http://127.0.0.1:8081/` to see the restored state in the browser.

## What changes in production

- **Your recovery point is your last durable snapshot.** Work after it is lost with the worker. Suspend at the points you can't afford to redo, and use `--mode=sync` when you need the upload finished before you move on.
- **Side effects aren't rolled back.** Revert restores the Actor, not the outside world. Calls the Actor made after the checkpoint (tickets, messages, writes to other systems) still happened, so make them idempotent.
- **Losing a whole cluster is a different problem.** Revert recovers within one Substrate install. For a cluster outage, see [Multi-Cluster Placement and Failover](multi-cluster-failover.md).

## Clean up

Stop the proxy with Ctrl-C. Delete the Actor before the template, so Substrate can clean up its snapshots:

```bash
kubectl ate delete actor session -a ate-demo-recover
kubectl ate delete actor-template recover -a ate-demo-recover
kubectl ate delete atespace ate-demo-recover
kubectl delete namespace ate-demo-recover
```

# Recover a kagent Session From Worker Loss

This is the kagent version of [Recover an Actor From Worker Loss](../isolated-agent-substrate/recover-worker-loss.md). The scenario is the same: the worker under a running Actor disappears, and the Actor comes back from its last durable snapshot on a replacement worker.

In the standalone lab you take the checkpoint and run the revert yourself. Here kagent does both. It takes a durable snapshot of the session's Actor at the end of every turn. After a crash, kagent's `RevertSession` API returns the Actor to that snapshot and marks the interrupted turn failed. The next message resumes the Actor on a replacement worker.

```text
 turn 1    invoke "remember cobalt-lantern-71" ─▶ end of turn ─▶ suspend ─▶ durable snapshot S (COMPLETED)
 turn 2    invoke (long, streaming) ─▶ Actor RUNNING on worker W ─▶ force-delete W ─▶ ACTOR_STATE_CRASHED
 recover   RevertSession ─▶ turn 2 marked FAILED, Actor SUSPENDED at S ─▶ turn 3 ─▶ replacement worker W'
```

What it demonstrates:

- **Recovery point = the end of the last completed turn.** kagent snapshots after every turn, so a lost worker costs at most the turn in flight.
- **The interrupted turn fails. It doesn't resume partway.** `RevertSession` marks it failed. The conversation continues from the turn before it.
- **Same Session, same Actor, different worker.** The lab checks the Session ID, Actor UID, durable snapshot UUID, and worker Pod UID before and after recovery.

The agent's recall of an earlier marker is a visible conversation check, and it comes from the chat history in kagent's PostgreSQL. The Actor and snapshot records show what Substrate restored.

> **Status:** Commands target kagent **1.0.1** and Agent Substrate **v1.0.0**.

## Versions

| Component | Version | Notes |
| --- | --- | --- |
| kagent | `1.0.1` | Installed with `kagent install` |
| kagent CLI | `1.0.1` | Same version as the cluster. Older CLIs have no `kagent agent` command |
| Agent Substrate | `v1.0.0` | Installed by `kagent install` |
| `kubectl-ate` | `v1.0.0` or newer | For inspecting the session's Actor |
| kagent API | `api.kagent.dev/v1alpha3` | `Harness`, `AgentTemplate`, `Agent` |
| `grpcurl` | `1.9.4` | Calls `RevertSession` |
| `jq` | `1.8.1` | |

## Prerequisites

- A **disposable cluster** with kagent `1.0.1` and Agent Substrate `v1.0.0`, installed with `kagent install` as shown in [Install kagent and Agent Substrate](installation.md). This lab force-deletes a worker Pod in a dedicated WorkerPool.
- In namespace `kagent`: WorkerPool `kagent-default`, the `kagent-controller` Service, and ModelConfig `default-model-config`. These are the defaults `kagent install` creates. The ModelConfig must be able to answer a prompt.
- The bundled S3-compatible snapshot store (`s3://ate-snapshots/`). For an external store, change `spec.substrate.snapshotPolicy.location` in Step 1 to a writable prefix.
- The `kubectl ate` plugin, with permission to read Actors in the `kagent` atespace. See [Optional: install the `kubectl ate` plugin](installation.md#optional-install-the-kubectl-ate-plugin).
- The `kagent` CLI at the same version as the cluster. Check with `kagent version`.
- `jq` and `grpcurl`.
- **Bash** in a terminal in the **root of this repository** (`Agentic-AI-The-Hard-Way`). Later steps use shell variables from earlier ones, so run Steps 1 to 4 and Clean up in the same shell. You need a second terminal for a port-forward in Step 4. The interrupt script is in [`isolated-agent/session-recovery/`](https://github.com/AdminTurnedDevOps/Agentic-AI-The-Hard-Way/tree/main/isolated-agent/session-recovery).

Confirm the WorkerPool and ModelConfig exist. Each command exits non-zero if its object is missing:

```bash
kubectl -n kagent get workerpools.ate.dev kagent-default
kubectl -n kagent get modelconfigs.api.kagent.dev default-model-config
```

### gRPC reflection

The `RevertSession` call in Step 4 uses gRPC reflection on the kagent controller. The chart turns it off by default, but `kagent install` turns it on (`config.server.grpcReflection: true`). Confirm it's on:

```bash
helm get values kagent -n kagent -a -o json | jq -e '.config.server.grpcReflection == true'
```

If that prints `false`, for example on a Helm-only install, turn it on. The controller restarts, so start the Step 4 port-forward after the rollout finishes:

```bash
helm upgrade kagent oci://ghcr.io/kagent-dev/kagent/helm/kagent \
  --version "$(helm get metadata kagent -n kagent -o json | jq -r .version)" \
  -n kagent --reuse-values --set config.server.grpcReflection=true
```

The upgrade also re-applies the chart's `default-model-config`. If you changed its API key in the kagent UI, Helm 4 fails with `conflict with "app" ... .spec.apiKeySecret`. Helm 3 instead points the ModelConfig back at the chart's Secret. Either way, pass the current key to the chart. With Helm 4, also take the field back:

```bash
helm upgrade kagent oci://ghcr.io/kagent-dev/kagent/helm/kagent \
  --version "$(helm get metadata kagent -n kagent -o json | jq -r .version)" \
  -n kagent --reuse-values --set config.server.grpcReflection=true \
  --set providers.openAI.apiKey="$OPENAI_API_KEY" --force-conflicts
```

This assumes the OpenAI provider. Use the `providers.<provider>` key that matches your install. Helm 3 has no `--force-conflicts` flag, so drop it there.

> **PLEASE NOTE:** gRPC reflection doesn't create a vulnerability on its own, but it hands anyone who can reach the server a full map of its API. In production, turn it off on publicly reachable endpoints, or restrict it to authenticated callers or an internal-only port.

## Step 1: Set up an isolated Agent

Create the lab pool from the default pool's gVisor image, sandbox config, and Pod settings. It has **one replica**, so after the worker is deleted, the next turn can only run on its replacement. kagent uses the pool name and namespace labels to place the lab's Actors:

```bash
kubectl -n kagent get workerpool kagent-default -o json |
  jq -e '
    select(any(.spec.sandboxClasses[]?; .name == "gvisor")) |
    {
      apiVersion: "ate.dev/v1", kind: "WorkerPool",
      metadata: {
        name: "worker-loss-lab", namespace: "kagent",
        labels: {
          "kagent.dev/worker-pool-name": "worker-loss-lab",
          "kagent.dev/worker-pool-namespace": "kagent"
        }
      },
      spec: (.spec | .replicas = 1 | .sandboxClasses |= map(select(.name == "gvisor")))
    }
  ' | kubectl create -f -
```

Create the agent. The Harness points at the lab pool and gives the lab its own snapshot prefix. The AgentTemplate tells the agent to answer questions about earlier turns from the conversation:

```bash
kubectl apply -f - <<'YAML'
apiVersion: api.kagent.dev/v1alpha3
kind: Harness
metadata:
  name: worker-loss-lab
  namespace: kagent
spec:
  kagent: {}
  substrate:
    workerPoolRef:
      name: worker-loss-lab
    snapshotPolicy:
      location: s3://ate-snapshots/kagent/worker-loss-lab/
---
apiVersion: api.kagent.dev/v1alpha3
kind: AgentTemplate
metadata:
  name: worker-loss-lab
  namespace: kagent
spec:
  description: Demonstrate recovery of a kagent Session after worker loss.
  modelConfig:
    name: default-model-config
  systemPrompt: Follow the user's instructions. Use the current conversation to answer questions about earlier turns.
---
apiVersion: api.kagent.dev/v1alpha3
kind: Agent
metadata:
  name: worker-loss-lab
  namespace: kagent
spec:
  template:
    ref:
      name: worker-loss-lab
  harnessRef:
    name: worker-loss-lab
YAML
```

## Step 2: Complete a turn and record its durable snapshot

Use the kagent CLI to create the Session and send a turn, and `kubectl ate` to inspect the Session's backing Actor. The CLI opens its own connection to the controller.

```bash
session_id=$(kagent --user-id admin@kagent.dev -n kagent agent session create \
  --agent worker-loss-lab -o json | jq -er '.session.id')
get_actor() {
  kubectl ate get actor "session-$session_id" -a kagent -o json
}

durable_snapshot() {
  jq -er '[.status.snapshots[]? |
    select(.owner == "SNAPSHOT_OWNER_ACTOR" and
           .durableSnapshot.state == "SNAPSHOT_STORAGE_STATE_COMPLETED")]
    | max_by(.generation | tonumber) | .uuid'
}

kagent --user-id admin@kagent.dev -n kagent agent invoke --session "$session_id" \
  --task 'Remember this recovery marker for a later question: cobalt-lantern-71. Reply with the marker.'
```

Wait for the Actor to show `ACTOR_STATE_SUSPENDED` with a completed Actor-owned snapshot. If the next command fails, the post-turn suspend is still in progress, so run it again. Record the snapshot before starting another turn:

```bash
baseline=$(get_actor | jq -ce 'select(.status.state == "ACTOR_STATE_SUSPENDED")')
actor_uid=$(jq -er '.metadata.uid' <<<"$baseline")
snapshot_uuid=$(durable_snapshot <<<"$baseline")
printf 'Session %s\nActor %s\nDurable snapshot %s\n' "$session_id" "$actor_uid" "$snapshot_uuid"
```

That snapshot is the recovery point.

## Step 3: Interrupt a running turn

The worker has to disappear **while a turn is running**, which is a narrow window to hit by hand. [`interrupt-turn.sh`](https://github.com/AdminTurnedDevOps/Agentic-AI-The-Hard-Way/blob/main/isolated-agent/session-recovery/interrupt-turn.sh) handles the timing:

1. Confirms the Actor is still suspended at the snapshot from Step 2.
2. Starts a long streaming turn in the background.
3. Waits for the Actor to get a worker, then prints the Pod name.
4. Confirms the Pod UID and that the Pod belongs to the `worker-loss-lab` pool, so it can't hit the wrong Pod.
5. Runs `kubectl delete pod --grace-period=0 --force` to simulate abrupt worker loss.
6. Waits for `ACTOR_STATE_CRASHED` and confirms the durable snapshot didn't change.

It prints the deleted Pod's UID, which you keep for Step 4:

```bash
old_pod_uid=$(bash isolated-agent/session-recovery/interrupt-turn.sh "$session_id" "$actor_uid" "$snapshot_uuid")
```

Continue when the script reports `CRASHED` and confirms the snapshot UUID from Step 2. If the turn ends before the fault, the script reports that outcome instead. Start a fresh Session and repeat from Step 2 to establish a new baseline.

## Step 4: Revert the Session and continue

In a **second terminal**, start a loopback port-forward for the `grpcurl` call and leave it running:

```bash
kubectl -n kagent port-forward svc/kagent-controller 8083:8083
```

Back in the first terminal, call `RevertSession` with the same lab identity, so kagent recovers the Actor and marks the interrupted turn failed. Then check that the same Actor is suspended at the baseline snapshot:

```bash
session_request=$(jq -nc --arg id "$session_id" '{sessionId:$id}')
grpcurl -plaintext -max-time 120 -H 'X-User-Id: admin@kagent.dev' \
  -d "$session_request" localhost:8083 kagent.api.v1.SessionService/RevertSession |
  jq -e --arg id "$session_id" '.session | select(.id == $id) | {id, state}'
restored=$(get_actor | jq -ce --arg uid "$actor_uid" '
  select(.metadata.uid == $uid and .status.state == "ACTOR_STATE_SUSPENDED")
')
test "$(durable_snapshot <<<"$restored")" = "$snapshot_uuid" &&
  printf 'Same Session and Actor, reverted to the baseline snapshot.\n'
```

Once the recovery is verified, stop the port-forward with Ctrl-C.

Wait for a ready lab Pod with a different UID. The lab pool has one replica, so the next turn can only run on the replacement. If Kubernetes reports it ready before it registers with Substrate, wait for registration before retrying the invocation:

```bash
replacement=''
for ((attempt = 0; attempt < 60; attempt++)); do
  replacement=$(kubectl -n kagent get pods -l ate.dev/worker-pool=worker-loss-lab -o json |
    jq -c --arg uid "$old_pod_uid" '
      .items[] | select(.metadata.uid != $uid and .metadata.deletionTimestamp == null) |
      select(any(.status.conditions[]?; .type == "Ready" and .status == "True")) |
      {name: .metadata.name, uid: .metadata.uid}
    ')
  [[ -n "$replacement" ]] && break
  sleep 5
done
test -n "$old_pod_uid" && test -n "$replacement" && printf 'Replacement: %s\n' "$replacement"
```

Send a message to the original Session:

```bash
kagent --user-id admin@kagent.dev -n kagent agent invoke --session "$session_id" \
  --task 'What recovery marker did I ask you to remember in the first turn?'
```

What you should see:

- The reply includes `cobalt-lantern-71`. The Session continues from turn 1.
- The interrupted turn is failed, not resumed partway through.
- The Actor UID and durable snapshot UUID match Step 2: the same Actor, reverted to the baseline.
- The worker Pod UID changed: the turn ran on a replacement worker.

See [kagent worker-loss behavior](https://kagent.dev/docs/kagent/latest/operations/operational-considerations/#node-operations) for how kagent handles node operations.

Compare this with the [standalone recover lab](../isolated-agent-substrate/recover-worker-loss.md). There the template asks for `SNAPSHOT_FIDELITY_MEMORY`, so the process itself comes back with the same session ID. kagent's Actors take `VOLUMES` snapshots (see [Session and Storage Persistence With kagent](session-storage-persistence.md)), so the runtime starts fresh on the replacement worker. The state that survives is the files on the Actor's `durableDir` and the conversation in kagent's PostgreSQL.

## What changes in production

- **A lost worker costs the turn in flight.** kagent snapshots at the end of every turn, so completed turns are safe. The interrupted turn is failed, so your client has to detect that and resend it.
- **Side effects aren't rolled back.** `RevertSession` restores the Actor, not the outside world. Tool calls the interrupted turn already made (tickets, messages, writes to other systems) still happened, so make them idempotent.
- **Pools have spare workers.** The lab uses a one-replica pool to force the replacement. In production, the resumed Actor lands on any ready worker in its pool.
- **Lock down the controller API.** The lab calls `RevertSession` over a loopback port-forward with the default lab identity. Keep the controller's gRPC port internal, and turn off reflection where it's reachable by untrusted callers.
- **Losing a whole cluster is a different problem.** Revert recovers within one install. For a cluster outage, see [Multi-Cluster Placement and Failover](../isolated-agent-substrate/multi-cluster-failover.md).

## Clean up

Delete the Session first, so kagent deletes its Actor and Substrate cleans up its snapshots. Then delete the agent resources and the lab pool:

```bash
kagent --user-id admin@kagent.dev -n kagent agent session delete "$session_id"
kubectl -n kagent delete agents.api.kagent.dev worker-loss-lab
kubectl -n kagent delete agenttemplates.api.kagent.dev worker-loss-lab
kubectl -n kagent delete harnesses.api.kagent.dev worker-loss-lab
kubectl -n kagent delete workerpool worker-loss-lab
```

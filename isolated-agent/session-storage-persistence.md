# Session and Storage Persistence With kagent

This is the kagent version of [Pick Up Where You Left Off: Suspend and Resume a Session](../isolated-agent-substrate/suspend-resume-workbench.md). It tells the same story: a session frees its compute while idle, then comes back with its work intact.

Every kagent chat is its own Agent Substrate Actor, the kagent UI is the client, and kagent suspends the Actor on its own after every turn.

```text
 kagent UI (:8081) ──▶ kagent controller ──▶ Substrate Actor "session-<id>" (kagent-default pool)
       │                                        └─ Go ADK runtime
       │                                             /data/workspace/task.md (durableDir)
       │
       └─ chat history ──▶ kagent PostgreSQL

 end of every turn ─▶ suspend ─▶ VOLUMES snapshot ─▶ s3://ate-snapshots/kagent/ ─▶ worker freed
 next message      ─▶ resume from the snapshot
```

What it demonstrates:

- **An idle chat holds no worker.** kagent suspends the session's Actor after each turn, so its CPU and memory go back to the pool.
- **Two kinds of state, two places.** The conversation lives in kagent's PostgreSQL. The agent's files live on the Actor's `durableDir` volume and come back from the snapshot.
- **Proof comes from the disk, not the reply.** The `read_file` result after resume shows what the restored Actor actually read from its volume.

> **Status:** Commands target kagent **1.0.1** and Agent Substrate **v1.0.0**.

## Versions

| Component | Version | Notes |
| --- | --- | --- |
| kagent | `1.0.1` | Installed with `kagent install` |
| Agent Substrate | `v1.0.0` | Installed by `kagent install` |
| `kubectl-ate` | `v1.0.0` or newer | For inspecting the session's Actor |
| kagent API | `api.kagent.dev/v1alpha3` | `Harness`, `AgentTemplate`, `Agent` |
| Go ADK runtime | `ghcr.io/kagent-dev/kagent/golang-adk@sha256:f62e9f28…` | The image `kagent install` used for the default agent |

## Prerequisites

- kagent `1.0.1` and Agent Substrate `v1.0.0`, installed with `kagent install` as shown in [Install kagent and Agent Substrate](installation.md).
- The `kubectl ate` plugin, `v1.0.0` or newer.
- `jq`.
- In namespace `kagent`: WorkerPool `kagent-default`, ModelConfig `default-model-config`, and the snapshot location `s3://ate-snapshots/kagent/`. These are the defaults `kagent install` creates.

Confirm the WorkerPool and ModelConfig exist. Each command exits non-zero if its object is missing:

```bash
kubectl -n kagent get workerpools.ate.dev kagent-default
kubectl -n kagent get modelconfigs.api.kagent.dev default-model-config
```

## Step 1: Create the agent

kagent splits an agent into three resources:

- **Harness**: how the agent runs. It pins the Go ADK runtime image and names the WorkerPool and snapshot location.
- **AgentTemplate**: what the agent is. Model, prompt, tools.
- **Agent**: pairs the two.

The Go ADK runtime gives every agent built-in `read_file`, `write_file`, `edit_file`, and `bash` tools. Their working directory is `/data/workspace`, on the Actor's `durableDir` volume, so files written there are part of each snapshot. The system prompt keeps the review's state in `task.md` and makes the agent read the file on every turn. The kagent UI shows each tool call and its result as a card, so you can see the file's actual contents rather than trusting the agent's summary.

The Harness image is the digest `kagent install` used for the default agent. Find yours, and replace it below if it differs:

```bash
kubectl -n kagent get harnesses.api.kagent.dev -o yaml | grep image:
```

```bash
kubectl apply -f - <<'YAML'
apiVersion: api.kagent.dev/v1alpha3
kind: Harness
metadata:
  name: release-review-harness
  namespace: kagent
spec:
  kagent: {}
  substrate:
    workerPoolRef:
      name: kagent-default
    snapshotPolicy:
      location: s3://ate-snapshots/kagent/
  workload:
    image: ghcr.io/kagent-dev/kagent/golang-adk@sha256:f62e9f2820d3325ca147a5d39802dc3e9c914bee97b3e021bd38f6f5df10e3bf
---
apiVersion: api.kagent.dev/v1alpha3
kind: AgentTemplate
metadata:
  name: release-review-template
  namespace: kagent
spec:
  description: Three-step release review that keeps its state in task.md
  modelConfig:
    name: default-model-config
  systemPrompt: |
    You run a three-step release review. The steps are:
    1. Collect changes
    2. Review risks
    3. Approve release

    The review's only state is the file task.md in your working directory.
    Never rely on earlier messages for the current step or the notes.
    Always read task.md with read_file before you answer, and write every
    change back to it.

    task.md has this shape:

    # Release review
    Current step: <1, 2, or 3>
    ## Notes
    - <one line per note>

    Commands:
    - "start": create task.md at step 1 with an empty Notes section.
    - "note: <text>": append "- <text>" under Notes.
    - "advance": increase Current step by one, to at most 3.
    - "status": reply with the full contents of task.md, verbatim.

    After each command, reply in one line with the current step and the
    number of notes.
---
apiVersion: api.kagent.dev/v1alpha3
kind: Agent
metadata:
  name: release-review
  namespace: kagent
spec:
  harnessRef:
    name: release-review-harness
  template:
    ref:
      name: release-review-template
YAML
```

Wait for the agent to become ready. kagent prepares an ActorTemplate for it on Substrate first, so this can take a few minutes:

```bash
kubectl -n kagent wait --for=condition=Ready agents.api.kagent.dev/release-review --timeout=10m
```

If it times out, read the `ResolvedRefs`, `Compatible`, and `Ready` condition messages:

```bash
kubectl -n kagent get agents.api.kagent.dev release-review -o jsonpath='{range .status.conditions[*]}{.type}={.status}: {.message}{"\n"}{end}'
```

## Step 2: Open the kagent UI

Forward the UI in its own terminal and leave it running. Port `8081` avoids a clash with the workbench lab's proxy on `8080`:

```bash
kubectl -n kagent port-forward svc/kagent-ui 8081:8080
```

## Step 3: Start a session

Open `http://localhost:8081/agents`, select **release-review**, and select **New chat**. Send:

```text
start
```

The address changes to `http://localhost:8081/agents/<session-id>/chat`. Copy the session ID. The session's Actor is named `session-` followed by that ID in lowercase. Save both in a second terminal:

```bash
SESSION_ID=<session-id>
ACTOR="session-$(printf '%s' "$SESSION_ID" | tr '[:upper:]' '[:lower:]')"
```

## Step 4: Edit the file and advance the task

Send these as separate messages, waiting for each reply:

```text
note: rollback plan reviewed
```

```text
advance
```

```text
advance
```

The last reply reports step 3 and one note. Each message is one turn, and kagent suspends the Actor after every turn and resumes it for the next.

## Step 5: Close the tab and inspect the Actor

You don't suspend anything yourself: the Actor was suspended when the last turn ended. `2>/dev/null` hides the harmless `--token-file` warning:

```bash
kubectl ate get actor "$ACTOR" -a kagent -o json 2>/dev/null | jq '{state: .status.state, workerPod: (.status.workerAssignment.workerPod // "none"), snapshots: [.status.snapshots[]? | {uuid, fidelity, storage: .durableSnapshot.state, uri: .durableSnapshot.object.snapshotUri}]}'
```

If `state` still reads `ACTOR_STATE_RUNNING`, the post-turn suspend is still in progress. Run the command again.

What to look for:

- `state: ACTOR_STATE_SUSPENDED` and `workerPod: none`: the session reserves no worker capacity while idle. Its CPU and memory return to the `kagent-default` pool for other Actors.
- `SNAPSHOT_FIDELITY_VOLUMES`: the snapshot holds the `durableDir` contents, including `/data/workspace/task.md`, but no process memory.
- `SNAPSHOT_STORAGE_STATE_COMPLETED`: the upload finished, so the file lives in object storage, not on the node.

The kagent UI shows the same thing: open `http://localhost:8081/substrate` and find the Actor in the **Actors** list, marked suspended.

## Step 6: Come back

Reopen `http://localhost:8081/agents/<session-id>/chat` in a fresh tab. The conversation is all there, served from kagent's PostgreSQL. Send:

```text
status
```

The message resumes the Actor. Look at the `read_file` result card in this turn, not the agent's reply. The chat history already mentions step 3 and the note, so the reply alone proves nothing. The result card is the file as the restored Actor read it from disk: `Current step: 3` and `- rollback plan reviewed`. That content came back from the `VOLUMES` snapshot.

Run the Step 5 command again while the turn is running, and the Actor shows `ACTOR_STATE_RUNNING` on a worker. Run it after the turn ends, and it's back to `ACTOR_STATE_SUSPENDED`.

Compare this with the [standalone workbench lab](../isolated-agent-substrate/suspend-resume-workbench.md): there the template asks for `SNAPSHOT_FIDELITY_MEMORY`, so the process itself is restored. Here the snapshot is `VOLUMES` only, so the runtime starts fresh on resume and the state that matters lives on disk and in kagent's database.

## Clean up

In the kagent UI, open the chat's menu in the agent's chat list and select **Delete chat**. Deleting the session deletes its Actor, and Substrate cleans up its snapshots. Stop the port-forward with Ctrl-C, then delete the resources:

```bash
kubectl -n kagent delete agents.api.kagent.dev release-review
kubectl -n kagent delete agenttemplates.api.kagent.dev release-review-template
kubectl -n kagent delete harnesses.api.kagent.dev release-review-harness
```

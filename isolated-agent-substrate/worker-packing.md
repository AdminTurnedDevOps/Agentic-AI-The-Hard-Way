# Workers Hosting Several Actors

A worker Pod isn't limited to one Actor. It hosts **several Actors at once**, each in its own gVisor sandbox with its own network namespace, until it runs out of room. This lab builds a WorkerPool sized by **memory**, packs it with Actors, mixes Actor sizes, and shows exactly what's reserved on each worker.

> **Status:** Commands checked against the Substrate **v1.0.0** source. Not yet run end to end on a cluster.

## How much fits on a worker

Two numbers decide it.

**The worker's capacity** comes from the CPU and memory **limits** you set on the WorkerPool (`spec.template.resources.limits`). The WorkerPool controller passes those limits to the worker's `ateworker` container through the Kubernetes downward API. The worker reads them **once, at startup**, keeps **64 MiB** of the memory for itself (its own process, plus page cache for up to two checkpoints writing at once), and reports the rest to ate-api-server.

**The Actor's size** is the `resources.limits` on its ActorTemplate: `cpuMillicores` and `memoryBytes`. It does two jobs:

- **Sizes the sandbox.** In gVisor, `memoryBytes` caps the sandbox's memory, gVisor's own kernel (the Sentry) included, and `cpuMillicores` becomes its cgroup CPU quota.
- **Reserves capacity.** When the Actor is placed on a worker, its limits are subtracted from that worker's remaining capacity.

An Actor is placed only on a worker where **every** dimension it declares still fits:

```text
Actors per worker = min( worker memory capacity / Actor memory,
                         worker CPU capacity    / Actor CPU,
                         --max-actors  (default 1000) )
```

In this lab:

| | CPU | Memory |
| --- | --- | --- |
| WorkerPool limits | `2` | `1088Mi` |
| Worker capacity (memory less the 64 MiB the worker keeps) | `2000` millicores | `1Gi` |
| `mem-256` Actor (template limits) | `250` millicores | `256Mi` |
| Fits per worker | 8 | **4** |

Memory is the tighter limit, so **four** `mem-256` Actors fit on each worker, and two `mem-512` Actors.

Three rules to size by:

- **Set both CPU and memory limits on the WorkerPool.** If you leave one out, the worker reports zero capacity for it, and the scheduler treats zero as **unconstrained**: that dimension never stops placement.
- **Set `resources.limits` on every template.** Both `cpuMillicores` and `memoryBytes` are required, and they're the only thing placement adds up.
- **Size the pool for the Actors, plus 64 MiB.** A WorkerPool memory limit of *N × Actor memory + 64 MiB* fits exactly *N* Actors. Measure real usage with `kubectl ate top workers -n <namespace>`.

## Prerequisites

- [Install Agent Substrate (Standalone)](installation.md).
- The counter demo (`go run ./cmd/ate-setup deploy demo counter`). This lab reuses its counter image and its worker image.
- The lab router client and the `ate_curl` function from [installation Step 5](installation.md#step-5-create-the-lab-router-client), defined in this shell.
- About 2.2 GiB of free memory on the kind node for the two workers.

## Step 1: Get the images

Reuse the images the installer built and resolved:

```bash
export WORKER_IMAGE=$(kubectl get workerpool counter -n ate-demo-counter -o jsonpath='{.spec.workerImage}')
export COUNTER_IMAGE=$(kubectl ate get actor-template counter -a ate-demo-counter -o json \
  | jq -r '.containers[0].image')

echo "${WORKER_IMAGE}"
echo "${COUNTER_IMAGE}"
```

## Step 2: Create a WorkerPool sized by memory

Two workers, each with **2 CPUs and 1 GiB of memory** of capacity:

```bash
kubectl apply -f - <<EOF
apiVersion: v1
kind: Namespace
metadata:
  name: ate-packing
---
apiVersion: ate.dev/v1
kind: WorkerPool
metadata:
  name: packing
  namespace: ate-packing
  labels:
    workload: packing
spec:
  replicas: 2
  workerImage: ${WORKER_IMAGE}
  sandboxClasses:
  - name: gvisor
  template:
    resources:
      limits:
        cpu: "2"
        memory: 1088Mi
      requests:
        cpu: 250m
        memory: 1088Mi
EOF

kubectl rollout status deployment/packing -n ate-packing
```

**Capacity comes from `limits`.** The `requests` only tell the Kubernetes scheduler what to reserve on the node. The CPU request is set low so two workers fit on one kind node; memory can't be compressed, so its request matches the limit.

Look at the workers through Substrate:

```bash
kubectl ate get workers -n ate-packing
```

```text
NAME   POOL      STATE                 ACTORS   CPU(MILLICORES)   MEMORY   POD                       AGE
...    packing   WORKER_STATE_ACTIVE   0/1000   0/2000            0/1Gi    ate-packing/packing-...   ...
```

`ACTORS`, `CPU(MILLICORES)`, and `MEMORY` are **allocated/capacity**. Each worker has 2000 millicores and 1 GiB to give, and nothing is placed yet.

## Step 3: Create two Actor sizes

Two templates from the same counter image. They differ only in their memory limit: **256 Mi** and **512 Mi**. Both pick the `packing` pool through `workerSelector`:

```bash
kubectl ate create atespace packing

for size in 256 512; do
  kubectl ate create actor-template -f - <<EOF
metadata:
  atespace: packing
  name: mem-${size}
workerSelector:
  matchLabels:
    workload: packing
containers:
- name: counter
  image: ${COUNTER_IMAGE}
  command:
  - /ko-app/counter
  wakeupProbe:
    httpGet:
      path: /readyz
      port: 80
resources:
  limits:
    cpuMillicores: 250
    memoryBytes: $((size * 1024 * 1024))
snapshotConfig:
  preferredFidelity: SNAPSHOT_FIDELITY_MEMORY
EOF
done
```

Each template builds a golden snapshot by booting one Actor, which briefly takes room on a worker. Run this until both have a `GOLDEN TAG`:

```bash
kubectl ate get actor-templates -a packing
```

## Step 4: Pack the pool with 256 Mi Actors

Two workers × four Actors = **8**. Create **9** and wake eight of them, one at a time:

```bash
for i in $(seq 1 9); do
  kubectl ate create actor "a$i" -a packing --template mem-256
done

for i in $(seq 1 8); do
  ate_curl "packing/a$i" -X POST
done
```

```bash
kubectl ate get workers -n ate-packing
```

```text
ACTORS   CPU(MILLICORES)   MEMORY
4/1000   1000/2000         1Gi/1Gi
4/1000   1000/2000         1Gi/1Gi
```

Both workers are **full on memory** (4 × 256 Mi = 1 GiB) while half their CPU is still free (4 × 250 = 1000 millicores). Memory decided it.

See which Actors share which Pod:

```bash
kubectl ate get actors -a packing -o json | jq -r '
  .actors[] | select(.status.state == "ACTOR_STATE_RUNNING")
  | "\(.status.workerAssignment.workerPod)  \(.metadata.name)"' | sort
```

Four Actor names per worker Pod. Each one is a separate gVisor sandbox with its own memory limit, network namespace, and state: send a few more requests to `a1` and `a2`, and only their own counters move.

Now request the ninth:

```bash
ate_curl packing/a9 -X POST -w '\n-> HTTP %{http_code} in %{time_total}s\n'
```

No worker has 256 Mi free. The router **parks** the request for its 5-second budget, as in the [parking lab](parking-autoscaling.md), and then returns `503`. Nothing frees up, because packed Actors don't leave until they're suspended.

## Step 5: Mix sizes on one worker

Pick a worker and free **512 Mi** on it by suspending two of its Actors:

```bash
kubectl ate get actors -a packing -o json | jq -r '
  .actors[] | select(.status.state == "ACTOR_STATE_RUNNING")
  | "\(.status.workerAssignment.workerPod)  \(.metadata.name)"' | sort
```

Suspend two names listed under the **same** Pod, for example:

```bash
kubectl ate suspend actor a1 -a packing
kubectl ate suspend actor a2 -a packing
kubectl ate get workers -n ate-packing
```

That worker now shows `MEMORY 512Mi/1Gi` and `ACTORS 2/1000`. Wake one **512 Mi** Actor:

```bash
kubectl ate create actor b1 -a packing --template mem-512
ate_curl packing/b1 -X POST
kubectl ate get workers -n ate-packing
```

`b1` can only fit where 512 Mi is free, so it lands on the worker you just freed. That worker is full again with **three** Actors of mixed sizes:

```text
2 × 256Mi + 1 × 512Mi = 1Gi
```

Now wake `a9` again. There's still no 256 Mi gap anywhere, so it parks and fails like before. Suspend any one 256 Mi Actor, and `a9` fits in its place:

```bash
kubectl ate suspend actor a3 -a packing
ate_curl packing/a9 -X POST
```

## Step 6: Read capacity and allocation from the API

The table columns come from each Worker record's status:

```bash
kubectl ate get workers -n ate-packing -o yaml
```

For the worker that holds `b1`, the status looks like this (other fields trimmed):

```yaml
workers:
- ...
  status:
    allocated:
      actors: 3
      cpuMillicores: "750"
      memoryBytes: "1073741824"
    capacity:
      actors: 1000
      cpuMillicores: "2000"
      memoryBytes: "1073741824"
    state: WORKER_STATE_ACTIVE
```

`capacity` is what the worker reported at startup: the WorkerPool's limits less the 64 MiB it keeps, plus the actor limit. `allocated` is the sum of the limits of the Actors placed on it right now. The API serializes 64-bit integers as strings, so the CPU and memory values are quoted.

Compare that with what the Pod actually uses:

```bash
kubectl ate top workers -n ate-packing
```

Real usage is far below `allocated`, because a counter barely uses memory. Placement is decided by the **declared limits**, not by usage. That's what makes it predictable.

## Step 7: Resize the workers

Capacity is read once, when a worker starts. To change it, change the WorkerPool's limits, and the controller rolls out new worker Pods with the new capacity. Suspend the Actors first so none are running on the workers being replaced:

```bash
for a in $(kubectl ate get actors -a packing -o json | jq -r \
    '.actors[] | select(.status.state == "ACTOR_STATE_RUNNING") | .metadata.name'); do
  kubectl ate suspend actor "$a" -a packing
done

kubectl patch workerpool packing -n ate-packing --type merge \
  -p '{"spec":{"template":{"resources":{"limits":{"cpu":"2","memory":"2112Mi"},"requests":{"cpu":"250m","memory":"2112Mi"}}}}}'
kubectl rollout status deployment/packing -n ate-packing
kubectl ate get workers -n ate-packing
```

`2112Mi` is 2 GiB plus the 64 MiB the worker keeps. Each new worker reports `MEMORY 0/2Gi`, which is room for eight `mem-256` Actors. Your kind node needs about 4.2 GiB of free memory for the two larger workers.

## Clean up

```bash
for a in $(kubectl ate get actors -a packing -o json | jq -r \
    '.actors[].metadata.name | select(test("^[ab][0-9]+$"))'); do
  kubectl ate delete actor "$a" -a packing
done
kubectl ate delete actor-template mem-256 -a packing
kubectl ate delete actor-template mem-512 -a packing
kubectl ate delete atespace packing
kubectl delete namespace ate-packing
```

`delete actor` works from any state, so the loop also removes Actors that are still running. The filter skips the templates' golden Actors, which have UUID names; deleting a template deletes its golden Actor. Deleting the namespace deletes the WorkerPool and its worker Pods.

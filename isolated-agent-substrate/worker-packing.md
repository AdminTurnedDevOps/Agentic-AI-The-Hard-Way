# Workers Hosting Several Actors

Since Substrate v0.5.0, a worker Pod isn't limited to one Actor. It hosts **several Actors at once**, each in its own gVisor sandbox with its own network namespace, until it runs out of room. This lab builds a WorkerPool sized by **memory**, packs it with Actors, mixes Actor sizes, and shows exactly what's reserved on each worker.

> **Status:** Commands checked against the Substrate **v0.5.0** source. Not yet run end to end on a cluster.

## How much fits on a worker

Two numbers decide it.

**The worker's capacity** is the CPU and memory **limits** you set on the WorkerPool (`spec.template.resources.limits`). The WorkerPool controller passes those limits to the worker's `ateom` container through the Kubernetes downward API. The worker reads them **once, at startup**, and reports them to ate-api-server.

**The Actor's size** is the `resources.limits` on its ActorTemplate. It does two jobs:

- **Sizes the sandbox.** In gVisor, `limits.memory` becomes the sandbox's cgroup `memory.max`, and `limits.cpu` becomes its CPU quota.
- **Reserves capacity.** When the Actor is placed on a worker, its limits are subtracted from that worker's remaining capacity.

An Actor is placed only on a worker where **every** dimension it declares still fits:

```text
Actors per worker = min( worker memory / Actor memory,
                         worker CPU    / Actor CPU,
                         --max-actors  (default 1000) )
```

In this lab:

| | CPU | Memory |
| --- | --- | --- |
| Worker capacity (WorkerPool limits) | `2` | `1Gi` |
| `mem-256` Actor (template limits) | `250m` | `256Mi` |
| Fits per worker | 8 | **4** |

Memory is the tighter limit, so **four** `mem-256` Actors fit on each worker, and two `mem-512` Actors.

Three rules to size by:

- **Set both CPU and memory limits on the WorkerPool.** If you leave one out, the downward API reports the **node's allocatable** amount for it, so the worker advertises capacity it doesn't own.
- **Set `resources.limits` on every template.** An Actor with no limits reserves nothing, so only the actor count (`--max-actors`, 1000) stops placement.
- **Leave headroom.** The scheduler only adds up the Actors' limits. It reserves nothing for `ateom` or gVisor's own overhead, which run inside the same worker Pod, under the same Pod memory limit. Measure the real usage with `kubectl ate top worker -n <namespace>` and size the WorkerPool above *N × Actor memory*.

## Prerequisites

- [Install Agent Substrate (Standalone)](installation.md).
- The counter demo (`hack/install-ate-kind.sh --deploy-demo-counter`). This lab reuses its counter image and its worker image.
- The router port-forward running in a separate terminal:

```bash
kubectl port-forward -n ate-system svc/atenet-router 8000:80
```

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
apiVersion: ate.dev/v1alpha1
kind: WorkerPool
metadata:
  name: packing
  namespace: ate-packing
  labels:
    workload: packing
spec:
  replicas: 1
  workerImage: ${WORKER_IMAGE}
  sandboxClasses:
  - name: gvisor
  template:
    resources:
      limits:
        cpu: "10"
        memory: 10Gi
      requests:
        cpu: 1000m
        memory: 6Gi
EOF

kubectl rollout status deployment/packing -n ate-packing
```

**Capacity comes from `limits`.** The `requests` only tell the Kubernetes scheduler what to reserve on the node. The CPU request is set low so two workers fit on one kind node; memory can't be compressed, so its request matches the limit.

Look at the workers through Substrate:

```bash
kubectl ate get workers -n ate-packing
```

```text
NAME   POOL      STATE                 ACTORS   CPU   MEMORY   POD                          AGE
...    packing   WORKER_STATE_ACTIVE   0/1000   0/2   0/1Gi    ate-packing/packing-...      ...
```

`ACTORS`, `CPU`, and `MEMORY` are **allocated/capacity**. Each worker has 2 CPUs and 1 GiB to give, and nothing is placed yet.

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
  - name: cpu
    quantity: 250m
  - name: memory
    quantity: ${size}Mi
snapshotConfig:
  preferredFidelity: SNAPSHOT_FIDELITY_MEMORY
  storageLocation: gs://ate-snapshots/packing/
sandboxConfig:
  sandboxClass: gvisor
  configName: gvisor-default
EOF
done
```

Each template builds a golden snapshot by booting one Actor, which briefly takes room on a worker. Run this until both have a `GOLDEN TAG`:

```bash
kubectl ate get actor-templates -a packing
```

## Step 4: Pack the pool with 256 Mi Actors

Two workers × four Actors = **8**. Create **9** and wake them one at a time:

```bash
for i in $(seq 1 9); do
  kubectl ate create actor "a$i" -a packing --template mem-256
done

for i in $(seq 1 8); do
  curl -s -X POST -H "ate-target-actor: packing/a$i" http://localhost:8000
done
```

```bash
kubectl ate get workers -n ate-packing
```

```text
ACTORS   CPU   MEMORY
4/1000   1/2   1Gi/1Gi
4/1000   1/2   1Gi/1Gi
```

Both workers are **full on memory** (4 × 256 Mi = 1 GiB) while half their CPU is still free (4 × 250m = 1 CPU). Memory decided it.

See which Actors share which Pod:

```bash
kubectl ate get actors -a packing -o json | jq -r '
  .actors[] | select(.status.state == "ACTOR_STATE_RUNNING")
  | "\(.status.workerAssignment.workerPod)  \(.metadata.name)"' | sort
```

Four Actor names per worker Pod. Each one is a separate gVisor sandbox with its own memory limit, network namespace, and state: send a few more requests to `a1` and `a2`, and only their own counters move.

Now request the ninth:

```bash
curl -s -w '\n-> HTTP %{http_code} in %{time_total}s\n' \
  -X POST -H "ate-target-actor: packing/a9" http://localhost:8000
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
curl -s -X POST -H "ate-target-actor: packing/b1" http://localhost:8000
kubectl ate get workers -n ate-packing
```

`b1` can only fit where 512 Mi is free, so it lands on the worker you just freed. That worker is full again with **three** Actors of mixed sizes:

```text
2 × 256Mi + 1 × 512Mi = 1Gi
```

Now wake `a9` again. There's still no 256 Mi gap anywhere, so it parks and fails like before. Suspend any one 256 Mi Actor, and `a9` fits in its place:

```bash
kubectl ate suspend actor a3 -a packing
curl -s -X POST -H "ate-target-actor: packing/a9" http://localhost:8000
```

## Step 6: Read capacity and allocation from the API

The table columns come from each Worker record's status:

```bash
kubectl ate get workers -n ate-packing -o yaml
```

```yaml
status:
  capacity:
    actors: 1000
    resources:
      limits:
      - name: cpu
        quantity: "2"
      - name: memory
        quantity: 1Gi
  allocated:
    actors: 3
    resources:
      limits:
      - name: cpu
        quantity: 750m
      - name: memory
        quantity: 1Gi
```

`capacity` is what the worker reported at startup (the WorkerPool's limits, plus the actor limit). `allocated` is the sum of the limits of the Actors placed on it right now.

Compare that with what the Pod actually uses:

```bash
kubectl ate top worker -n ate-packing
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
  -p '{"spec":{"template":{"resources":{"limits":{"cpu":"2","memory":"2Gi"},"requests":{"cpu":"250m","memory":"2Gi"}}}}}'
kubectl rollout status deployment/packing -n ate-packing
kubectl ate get workers -n ate-packing
```

Each new worker reports `MEMORY 0/2Gi`, which is room for eight `mem-256` Actors. Your kind node needs about 4 GiB of free memory for the two larger workers.

## Clean up

```bash
for a in $(kubectl ate get actors -a packing -o json | jq -r '.actors[].metadata.name'); do
  kubectl ate delete actor "$a" -a packing --any-state
done
kubectl ate delete actor-template mem-256 -a packing
kubectl ate delete actor-template mem-512 -a packing
kubectl ate delete atespace packing
kubectl delete namespace ate-packing
```

Deleting the namespace deletes the WorkerPool and its worker Pods.

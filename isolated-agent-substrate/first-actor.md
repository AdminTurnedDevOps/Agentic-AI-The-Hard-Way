# Your First Actor

This lab walks the core Substrate objects by hand, with nothing but `kubectl` and `kubectl ate`:

| Object | Where it lives | Tool |
| --- | --- | --- |
| `WorkerPool` | Kubernetes CRD, in a **namespace** | `kubectl apply` / `kubectl get workerpool` |
| `SandboxConfig` | Kubernetes CRD, cluster-scoped | `kubectl get sandboxconfig` |
| Atespace | Substrate API (PostgreSQL), global | `kubectl ate … atespace` |
| `ActorTemplate` | Substrate API, in an **atespace** | `kubectl ate … actor-template` |
| Actor | Substrate API, in an atespace | `kubectl ate … actor` |
| Worker | Substrate API record, one per worker Pod | `kubectl ate get workers` |

Capacity (WorkerPools) is Kubernetes. Everything that changes often (templates, Actors, which Actor sits on which worker) lives in Substrate's own API, because it changes too fast for etcd.

> **Status:** Commands checked against the Substrate **v0.5.0** source. Not yet run end to end on a cluster.

## Prerequisites

- [Install Agent Substrate (Standalone)](installation.md).
- A terminal in the root of the Substrate `v0.5.0` clone.

## Step 1: Deploy the counter demo

The counter is a small Go HTTP server. Every request increments three counters:

- one in **process memory**
- one in a file on a **durable volume**
- one on the **root filesystem**

It replies with all three, plus the IP address it answered from. That makes it ideal for watching state survive a suspend and resume.

```bash
hack/install-ate-kind.sh --deploy-demo-counter
```

The installer:

1. Builds the counter image with `ko` and pushes it to the local registry.
2. Applies the `ate-demo-counter` namespace and the `counter` WorkerPool (3 workers).
3. Creates the `ate-demo-counter` atespace.
4. Creates the `counter` ActorTemplate with `kubectl ate create actor-template`.
5. Waits for the template's **golden snapshot**.

## Step 2: Look at the capacity (Kubernetes)

```bash
kubectl get workerpool counter -n ate-demo-counter -o yaml
kubectl get pods -n ate-demo-counter
```

The WorkerPool becomes a Deployment of three warm worker Pods. Each Pod runs `ateom`, the in-Pod coordinator that drives the gVisor sandbox. The pool's `spec.template.resources.limits` (1 CPU, 1 GiB) is each worker's **capacity**: the budget the Actors placed on it share.

Substrate's view of the same Pods:

```bash
kubectl ate get workers
```

The `ACTORS` column shows `0/1000` for each: no Actors placed, against the default limit of 1000 Actors per worker. The `CPU` and `MEMORY` columns show **allocated/capacity**, for example `0/1` and `0/1Gi`.

## Step 3: Look at the template (Substrate API)

```bash
kubectl get crd actortemplates.ate.dev
```

```text
Error from server (NotFound): customresourcedefinitions.apiextensions.k8s.io "actortemplates.ate.dev" not found
```

That's expected. **The ActorTemplate still exists. Only its Kubernetes CRD was removed.** Substrate moved ActorTemplates (along with atespaces, Actors, and Workers) out of etcd and into its own API, backed by PostgreSQL, because they change faster than the Kubernetes API is built for. Same object, different home, different CLI. Ask Substrate for it:

```bash
kubectl ate get actor-templates -a ate-demo-counter
kubectl ate get actor-template counter -a ate-demo-counter -o yaml
```

The table shows `GOLDEN TAG`. It's empty while the golden snapshot is still building, then holds the name of the snapshot tag that every new Actor of this template restores from.

The parts of the manifest that matter:

| Field | Meaning |
| --- | --- |
| `metadata.atespace` / `metadata.name` | The template's identity. Templates live in an atespace |
| `workerSelector.matchLabels` | Which WorkerPools may run it, matched against the **WorkerPool's** labels (`workload: counter`) |
| `containers[].wakeupProbe` | `GET /readyz` on port 80. Substrate waits for it before it snapshots or hands the Actor traffic |
| `resources.limits` | The sandbox size (1 CPU, 512 Mi). Also used to place the Actor on a worker with enough capacity |
| `snapshotConfig.preferredFidelity` | `SNAPSHOT_FIDELITY_MEMORY`: snapshots hold process memory, rootfs changes, and volumes |
| `snapshotConfig.storageLocation` | Where snapshots go (`gs://ate-snapshots/…`, the in-cluster RustFS bucket on kind) |
| `sandboxConfig` | `sandboxClass: gvisor` plus `configName: gvisor-default`, the SandboxConfig that supplies `runsc` |
| `volumes[].durableDir` | A per-Actor directory that survives suspend and resume |

Templates are **immutable**. There's no update: a new version is a new template.

> **Newer than v0.5.0:** on Substrate's `main` branch (PR #2780, after v0.5.0), the template's `sandboxConfig` field is removed. The WorkerPool decides the sandbox class, and a template pins one through its `workerSelector`. These labs target v0.5.0, where `sandboxConfig` is still required. On a newer build, drop that block from the manifests.

## Step 4: Write your own template

Create your own atespace and a template in it, reusing the counter image the installer built. First grab the resolved image reference:

```bash
export COUNTER_IMAGE=$(kubectl ate get actor-template counter -a ate-demo-counter -o json \
  | jq -r '.actorTemplates[0].containers[0].image')
echo "${COUNTER_IMAGE}"
```

```bash
kubectl ate create atespace first-actor
```

The manifest is the **protojson** form of `ateapipb.ActorTemplate` (the same shape `-o yaml` prints), not a Kubernetes object. Unknown fields are rejected.

```bash
kubectl ate create actor-template -f - <<EOF
metadata:
  atespace: first-actor
  name: my-counter
workerSelector:
  matchLabels:
    workload: counter
containers:
- name: counter
  image: ${COUNTER_IMAGE}
  command:
  - /ko-app/counter
  wakeupProbe:
    httpGet:
      path: /readyz
      port: 80
  volumeMounts:
  - name: data
    mountPath: /home/counter
resources:
  limits:
  - name: cpu
    quantity: "1"
  - name: memory
    quantity: 512Mi
snapshotConfig:
  preferredFidelity: SNAPSHOT_FIDELITY_MEMORY
  storageLocation: gs://ate-snapshots/first-actor/
sandboxConfig:
  sandboxClass: gvisor
  configName: gvisor-default
volumes:
- name: data
  durableDir: {}
EOF
```

Creating the template triggers a **golden snapshot**. Substrate boots the workload once, waits for its wakeup probe, and checkpoints it. Every Actor of this template then starts by restoring that snapshot instead of cold-booting.

Run this until `GOLDEN TAG` has a value:

```bash
kubectl ate get actor-template my-counter -a first-actor
```

If `ERROR` shows `ERROR`, read the message with `-o yaml`.

## Step 5: Create an Actor

```bash
kubectl ate create actor counter-1 -a first-actor --template my-counter
kubectl ate get actor counter-1 -a first-actor
```

The Actor is `ACTOR_STATE_SUSPENDED` with no `WORKER POD`. It's only a record in PostgreSQL and uses no compute yet.

`kubectl get actor counter-1` doesn't work. Actors have never been Kubernetes objects.

## Step 6: Wake it with traffic

In a separate terminal, port-forward the router:

```bash
kubectl port-forward -n ate-system svc/atenet-router 8000:80
```

Send a request. The `ate-target-actor` header is the routing key: `<atespace>/<actor>`.

```bash
curl -X POST -H "ate-target-actor: first-actor/counter-1" http://localhost:8000
```

```text
hello from: 10.x.x.x | preserved memory count: 1 | preserved file counter: 1 | preserved rootfs counter: 1
```

The router saw a suspended Actor, asked ate-api-server to **resume** it onto a free worker, waited for it to be ready, and then forwarded the request.

```bash
kubectl ate get actor counter-1 -a first-actor
kubectl ate get workers
```

The Actor is now `ACTOR_STATE_RUNNING`, with a `WORKER POD` and `WORKER IPS`. In `get workers`, one worker now shows `ACTORS` `1/1000`, `CPU` `1/1`, and `MEMORY` `512Mi/1Gi`: the template's limits are now reserved on that worker.

Send a few more requests and watch all three counters climb.

## Step 7: Suspend and resume

```bash
kubectl ate suspend actor counter-1 -a first-actor
kubectl ate get actor counter-1 -a first-actor
kubectl ate get workers
```

Substrate checkpointed the sandbox (memory, rootfs changes, and the durable volume) to snapshot storage and freed the worker. Now send another request:

```bash
curl -X POST -H "ate-target-actor: first-actor/counter-1" http://localhost:8000
```

All three counters continue from where they stopped. The **memory** count surviving is the interesting part: the process wasn't restarted, it was restored. Check which worker it landed on. It may be a different Pod than before:

```bash
kubectl ate get actor counter-1 -a first-actor
```

## Step 8: Read the Actor's logs

Actor logs follow the Actor across workers:

```bash
kubectl ate logs actor counter-1 -a first-actor
kubectl ate logs actor counter-1 -a first-actor --source=lifecycle
```

`--source=lifecycle` shows only the lifecycle events (resume, suspend, and so on).

## Clean up

An Actor is deleted from `SUSPENDED` (or `CRASHED`) by default:

```bash
kubectl ate suspend actor counter-1 -a first-actor
kubectl ate delete actor counter-1 -a first-actor
kubectl ate delete actor-template my-counter -a first-actor
kubectl ate delete atespace first-actor
```

Deleting the template also deletes its golden Actor and golden snapshot. An atespace can only be deleted once it's empty.

Keep the counter demo for the next labs. To remove it later:

```bash
hack/install-ate-kind.sh --delete-demo-counter
```

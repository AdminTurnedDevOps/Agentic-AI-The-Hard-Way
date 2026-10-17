# Atespaces and the Teleporting Actor

This lab tests two isolation claims directly:

1. **Atespaces keep tenants apart.** An Actor is identified by `(atespace, name)`, so `tenant-a/agent-1` and `tenant-b/agent-1` are two completely separate Actors, with separate state and separate snapshot storage.
2. **State isn't tied to a Pod.** A suspended Actor's state lives in snapshot storage, not on the worker. It resumes onto **any** free worker, even one that didn't exist when it was suspended.

> **Status:** Commands checked against the Substrate **v0.5.0** source. Not yet run end to end on a cluster.

## Prerequisites

- [Install Agent Substrate (Standalone)](installation.md).
- The counter demo from [Your First Actor](first-actor.md) (`hack/install-ate-kind.sh --deploy-demo-counter`).
- The router port-forward running in a separate terminal:

```bash
kubectl port-forward -n ate-system svc/atenet-router 8000:80
```

## What an atespace is, and what it isn't yet

Per Substrate's own security model (`docs/security.md` at v0.5.0), an atespace today:

| Guarantee | Status in v0.5.0 |
| --- | --- |
| Separate identity: the same Actor name can exist in two atespaces | Yes |
| Separate snapshot paths: storage is partitioned by atespace | Yes |
| Per-Actor network isolation: each Actor gets a private network namespace, and Actors can't reach each other directly | Yes (applies to **every** Actor, not just across atespaces) |
| Per-Actor storage segregation: an Actor can't read another Actor's volumes or snapshots | Yes |
| API authorization per atespace (who may manage which atespace) | **In progress** (embedded OpenFGA) |
| Resource quotas per atespace | Not yet |

So an atespace is an identity and storage boundary today, not yet an access-control boundary. Plan multi-tenant designs accordingly.

## Part 1: Two tenants, one name

Create two atespaces:

```bash
kubectl ate create atespace tenant-a
kubectl ate create atespace tenant-b
kubectl ate get atespaces
```

Create an Actor called `agent-1` in **each** one. Both use the counter template. `--template` takes `<atespace>/<template-name>`, so a template in one atespace can be shared:

```bash
kubectl ate create actor agent-1 -a tenant-a --template ate-demo-counter/counter
kubectl ate create actor agent-1 -a tenant-b --template ate-demo-counter/counter
kubectl ate get actors -A
```

Two rows, same name, different `ATESPACE`.

Send **three** requests to tenant A and **one** to tenant B:

```bash
for i in 1 2 3; do
  curl -s -X POST -H "ate-target-actor: tenant-a/agent-1" http://localhost:8000
done
curl -s -X POST -H "ate-target-actor: tenant-b/agent-1" http://localhost:8000
```

Tenant A's last reply shows `preserved memory count: 3`, and tenant B's shows `preserved memory count: 1`. Same name, same template, independent state. Each one is on its own worker, in its own gVisor sandbox:

```bash
kubectl ate get actors -A
kubectl ate get workers
```

### Separate snapshot storage

Suspend both and look at where their state went:

```bash
kubectl ate suspend actor agent-1 -a tenant-a
kubectl ate suspend actor agent-1 -a tenant-b

for t in tenant-a tenant-b; do
  kubectl ate get actor agent-1 -a "$t" -o json \
    | jq -r '.. | .snapshotUri? // empty'
done
```

Each Actor's snapshot (`status.snapshots[].durableSnapshot.object.snapshotUri`) sits below its own atespace in the template's storage location:

```text
gs://ate-snapshots/ate-demo-counter/atespaces/tenant-a/actors/<uid>/snapshots/<snapshot>
gs://ate-snapshots/ate-demo-counter/atespaces/tenant-b/actors/<uid>/snapshots/<snapshot>
```

The template's golden snapshot is separate again: it's a tag in the reserved `ate-golden` atespace.

## Part 2: The teleporting Actor

Resume tenant A's Actor with a request and note which worker it's on:

```bash
curl -s -X POST -H "ate-target-actor: tenant-a/agent-1" http://localhost:8000
kubectl ate get actor agent-1 -a tenant-a
```

Note the `WORKER POD`, for example `ate-demo-counter/counter-6b9f…-abcde`:

```bash
export OLD_WORKER=<pod name from WORKER POD, without the namespace>
```

Suspend the Actor. Its memory, rootfs changes, and durable volume go to snapshot storage, and the worker is freed:

```bash
kubectl ate suspend actor agent-1 -a tenant-a
```

Now **delete that worker Pod**. It's free, so nothing is running on it. Its Deployment replaces it with a new Pod with a new name:

```bash
kubectl delete pod "${OLD_WORKER}" -n ate-demo-counter
kubectl rollout status deployment/counter -n ate-demo-counter
kubectl get pods -n ate-demo-counter
```

The Pod that last ran the Actor no longer exists. Send another request:

```bash
curl -s -X POST -H "ate-target-actor: tenant-a/agent-1" http://localhost:8000
```

The memory count continues at `5`: it was 4 before the suspend (three requests, then one more in Part 2), and this is the next one. The `hello from:` IP has changed. The Actor was restored on a different worker, from snapshot storage, with its process memory intact:

```bash
kubectl ate get actor agent-1 -a tenant-a
kubectl ate logs actor agent-1 -a tenant-a --source=lifecycle
```

The lifecycle log follows the Actor across workers, so you see the suspend on the old Pod and the resume on the new one in one stream.

### Pause vs suspend

`kubectl ate pause actor` is the short-term version. The snapshot stays on the node instead of going to snapshot storage, and the next resume prefers that node. Suspend is what makes teleporting possible: only a suspended Actor's state is off the node entirely.

## Clean up

```bash
kubectl ate suspend actor agent-1 -a tenant-a
kubectl ate suspend actor agent-1 -a tenant-b
kubectl ate delete actor agent-1 -a tenant-a
kubectl ate delete actor agent-1 -a tenant-b
kubectl ate delete atespace tenant-a
kubectl ate delete atespace tenant-b
```

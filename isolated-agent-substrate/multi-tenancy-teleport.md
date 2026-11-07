# Atespaces and the Teleporting Actor

This lab tests two isolation claims directly:

1. **Atespaces keep tenants apart.** An Actor is identified by `(atespace, name)`, so `tenant-a/agent-1` and `tenant-b/agent-1` are two completely separate Actors, with separate state, separate identities, and separate snapshot storage. An access policy per atespace decides who may manage it.
2. **State isn't tied to a Pod.** A suspended Actor's state lives in its snapshot, not on the worker. It resumes onto **any** free worker, even one that didn't exist when it was suspended.

> **Status:** Commands checked against the Substrate **v1.0.0** source. Not yet run end to end on a cluster.

## Prerequisites

- [Install Agent Substrate (Standalone)](installation.md).
- The counter demo from [Your First Actor](first-actor.md) (`go run ./cmd/ate-setup deploy demo counter`), with all 3 workers free.
- The lab router client and the `ate_curl` function from [installation Step 5](installation.md#step-5-create-the-lab-router-client), defined in this shell.

## What an atespace is, and what it isn't yet

Per Substrate's own security model (`docs/security/security.md` at v1.0.0), an atespace today gives you:

| Guarantee | Status in v1.0.0 |
| --- | --- |
| Separate identity: the same Actor name can exist in two atespaces | Yes. Actor JWTs carry `sub: actor/<atespace>/<name>` |
| Separate snapshot paths: storage is partitioned by atespace | Yes |
| Per-Actor network isolation: each Actor gets a private network namespace, and Actors can't reach each other directly | Yes (applies to **every** Actor, not just across atespaces) |
| Per-Actor storage segregation: an Actor can't read another Actor's volumes or snapshots | Yes |
| API authorization per atespace (who may manage which atespace) | **Yes.** Every API call is checked against access policies by an OpenFGA model embedded in ate-api-server |
| Ingress separation: only a tenant's clients can reach its Actors | No. The router is shared, and any client it admits can reach any Actor |
| Network policy and resource quotas per atespace | Not yet |

So an atespace is an identity, storage, and **API** access boundary. It isn't a data-plane boundary yet. Plan multi-tenant designs accordingly.

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

Two rows, same name, different `ATESPACE`. There's no default atespace, so listing always takes `-a` or `-A`.

Send **three** requests to tenant A and **one** to tenant B:

```bash
for i in 1 2 3; do
  ate_curl tenant-a/agent-1 -X POST
done
ate_curl tenant-b/agent-1 -X POST
```

```text
preserved memory count: 3 | preserved file counter: 3 | preserved rootfs counter: 3
preserved memory count: 1 | preserved file counter: 1 | preserved rootfs counter: 1
```

Same name, same template, independent state. Each one is on its own worker, in its own gVisor sandbox:

```bash
kubectl ate get actors -A
kubectl ate get workers -n ate-demo-counter
```

### Separate snapshot storage

Suspend both and look at where their state went. `--mode=sync` returns only once the snapshot is in object storage; the default, `async`, returns as soon as it's captured on the node and uploads in the background:

```bash
kubectl ate suspend actor agent-1 -a tenant-a --mode=sync
kubectl ate suspend actor agent-1 -a tenant-b --mode=sync

for t in tenant-a tenant-b; do
  kubectl ate get actor agent-1 -a "$t" -o json \
    | jq -r '.. | .snapshotUri? // empty'
done
```

Each Actor's snapshot (`status.snapshots[].durableSnapshot.object.snapshotUri`) sits below its own atespace in the cluster's snapshot location. On kind that's the RustFS bucket `ate-snapshots`:

```text
gs://ate-snapshots/atespaces/tenant-a/actors/<uid>/snapshots/<snapshot>
gs://ate-snapshots/atespaces/tenant-b/actors/<uid>/snapshots/<snapshot>
```

The template's golden snapshot is separate again: it's a tag in the template's own atespace, under `gs://ate-snapshots/atespaces/ate-demo-counter/tags/<tag uid>`.

### Who can manage which tenant: access policies

Separate state is half of tenancy. The other half is that tenant A's people can't touch tenant B. Every API call is checked against the **access policies**: one per atespace, plus one global, each binding principals to `owner`, `editor`, or `viewer`.

So far you've been acting as the shared `ate-client` ServiceAccount, which `ate-setup` makes a **bootstrap owner**, a global owner. That's fine for a lab and wrong for a shared install (see `docs/guides/authorization.md`). Create a ServiceAccount for a tenant A user, make it an `editor` of `tenant-a`, and act as it:

```bash
kubectl create namespace ate-users
kubectl -n ate-users create serviceaccount tenant-a-dev

kubectl ate create access-policy -a tenant-a -f - <<'EOF'
bindings:
- role: editor
  members:
  - user:system:serviceaccount:ate-users:tenant-a-dev
EOF

kubectl create token -n ate-users tenant-a-dev --audience api.ate-system.svc > tenant-a-dev.token
```

```bash
kubectl ate --token-file tenant-a-dev.token get actors -a tenant-a                # allowed
kubectl ate --token-file tenant-a-dev.token get actors -a tenant-b                # PermissionDenied
kubectl ate --token-file tenant-a-dev.token resume actor agent-1 -a tenant-b      # PermissionDenied
```

The denied calls name the principal in the error. An editor can create, suspend, resume, and delete Actors in its atespace, but can't change the access policy (that's `owner`) or list workers (that's a global role).

> **Where the boundary ends.** Access policies govern the **API**. The router is one shared ingress: any client on `--ingress-allowed-spiffe-ids` can reach any Actor in any atespace. That's how your one `router-client` Pod reached both tenants. If tenants must not reach each other's Actors, put your own authorizing gateway in front of the router, as in [Permissions in Front of Actors with OpenFGA](openfga-permissions.md).

Put tenant B's Actor back to work for Part 2:

```bash
ate_curl tenant-b/agent-1 -X POST
```

## Part 2: The teleporting Actor

Resume tenant A's Actor with a request and note which worker it's on:

```bash
ate_curl tenant-a/agent-1 -X POST
kubectl ate get actor agent-1 -a tenant-a
```

The count is `4`. Note the `WORKER POD`, for example `ate-demo-counter/counter-6b9f…-abcde`:

```bash
export OLD_WORKER=<pod name from WORKER POD, without the namespace>
```

Suspend the Actor. Its memory, rootfs changes, and durable volume go into a snapshot, and the worker is freed:

```bash
kubectl ate suspend actor agent-1 -a tenant-a --mode=sync
kubectl ate get actor agent-1 -a tenant-a
```

`STATE` is `ACTOR_STATE_SUSPENDED` and `WORKER POD` is empty.

Now **delete that worker Pod**. It's free, so nothing is running on it. The pool's Deployment replaces it with a new Pod with a new name:

```bash
kubectl delete pod "${OLD_WORKER}" -n ate-demo-counter
kubectl rollout status deployment/counter -n ate-demo-counter
kubectl get pods -n ate-demo-counter
```

The Pod that last ran the Actor no longer exists. Send another request:

```bash
ate_curl tenant-a/agent-1 -X POST
kubectl ate get actor agent-1 -a tenant-a
```

```text
preserved memory count: 5 | preserved file counter: 5 | preserved rootfs counter: 5
```

The `WORKER POD` is a different Pod, and all three counters continue at `5`. The Actor was restored onto a new worker from its snapshot, with its process memory, rootfs changes, and durable volume intact.

Where the snapshot came from depends on the node. A suspended Actor's snapshot stays on its node as well as in object storage, and a resume first tries a worker on that node, restoring the local copy. On a one-node kind cluster that's always the case. If the node were gone, or had no room, the resume would restore from object storage on another node instead, which is what `--mode=sync` guaranteed was there.

The lifecycle log shows the restore on the new worker:

```bash
kubectl ate logs actor agent-1 -a tenant-a --source=lifecycle
```

It covers the current worker only, so you see `Actor restoring` and `Actor restored`, not the checkpoint on the deleted Pod.

How much state survives is the template's choice. `snapshotConfig.preferredFidelity` is a ceiling: `SNAPSHOT_FIDELITY_VOLUMES` keeps only durable volumes, `SNAPSHOT_FIDELITY_ROOTFS` adds root-filesystem writes, and `SNAPSHOT_FIDELITY_MEMORY` (the default, and what the counter uses) adds process memory. With `VOLUMES`, only the file counter would have continued.

## Clean up

```bash
kubectl ate delete actor agent-1 -a tenant-a
kubectl ate delete actor agent-1 -a tenant-b
kubectl ate delete atespace tenant-a
kubectl ate delete atespace tenant-b

kubectl delete namespace ate-users
rm -f tenant-a-dev.token
```

`delete actor` works from any state. Deleting an atespace also deletes its access policy. Grants are keyed by atespace name, and upstream says not to reuse a deleted atespace's name: a request authorized against the old one can land on the new one. If you run the lab again, use new atespace names (see "Known limitations" in `docs/guides/authorization.md`).

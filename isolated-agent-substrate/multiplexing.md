# More Actors than Pods

A Deployment needs one Pod per agent, all the time. Substrate doesn't: Actors are records, workers are warm Pods, and Actors are placed onto workers only while they're active. This lab shows the two ways Substrate puts more agents on fewer Pods:

1. **Suspend frees capacity.** An idle Actor is snapshotted and its worker goes to someone else.
2. **Packing.** Since v0.5.0, a worker hosts **several** Actors at once, each in its own sandbox, up to the worker's capacity. This lab introduces it; [Workers Hosting Several Actors](worker-packing.md) covers it in depth.

Then it runs real Claude Code agents as Actors.

> **Status:** Commands checked against the Substrate **v0.5.0** source. Not yet run end to end on a cluster.

## Prerequisites

- [Install Agent Substrate (Standalone)](installation.md).
- The counter demo (`hack/install-ate-kind.sh --deploy-demo-counter`).
- The router port-forward running in a separate terminal:

```bash
kubectl port-forward -n ate-system svc/atenet-router 8000:80
```

- For Part 3: an **Anthropic API key**.

## How placement works

When an Actor resumes, ate-api-server looks for a worker that:

1. Has the Actor's **sandbox class** (`gvisor` or `microvm`). This is a hard gate, because snapshots can't move between runtimes.
2. Matches the template's `workerSelector` (and the Actor's own, if set), against the **WorkerPool's** labels.
3. Has **room**, by two limits, whichever runs out first:
   - **Actor count:** the worker's `--max-actors` (default `1000`).
   - **Resources:** the WorkerPool's `spec.template.resources.limits` are the worker's capacity. Each placed Actor subtracts its template's `resources.limits`. Always set both CPU and memory limits on the pool. The capacity is read from the worker container's limits through the Kubernetes downward API, which reports the **node's allocatable** resources for a limit you didn't set.

So whether Actors share a worker is a **sizing** decision. The counter demo is sized so that they don't: each worker has 1 CPU of capacity, and each counter Actor declares a 1 CPU limit.

## Part 1: Suspend frees capacity

The counter pool has **3** workers. Create **5** Actors from the counter template:

```bash
kubectl ate create atespace multiplex

for i in 1 2 3 4 5; do
  kubectl ate create actor "c$i" -a multiplex --template ate-demo-counter/counter
done

kubectl ate get actors -a multiplex
```

Five Actors, all `SUSPENDED`, and no Pods used yet. Wake three of them:

```bash
for i in 1 2 3; do
  curl -s -X POST -H "ate-target-actor: multiplex/c$i" http://localhost:8000
done

kubectl ate get actors -a multiplex
kubectl ate get workers
```

`c1` to `c3` are `RUNNING` on three different workers, and the pool is full. Now free a worker by suspending `c1`, and wake `c4`:

```bash
kubectl ate suspend actor c1 -a multiplex
curl -s -X POST -H "ate-target-actor: multiplex/c4" http://localhost:8000
kubectl ate get actors -a multiplex
```

`c4` took the worker `c1` released. `c1`'s state is in snapshot storage, and it resumes, on whichever worker is free, the next time it gets a request. Five agents, three Pods, and nobody lost state.

If you request a fifth Actor while all three workers are busy, the router **parks** the request for a few seconds, waiting for a worker to free up, as you saw in the [parking and autoscaling lab](parking-autoscaling.md).

## Part 2: Packing several Actors onto one worker

Since v0.5.0, a worker isn't limited to one Actor. It hosts as many as its CPU and memory capacity (and its actor limit) allow, each in its own sandbox. [Workers Hosting Several Actors](worker-packing.md) builds a pool sized by memory and packs it step by step.

## Part 3: Real agents (Claude Code)

The Substrate repo ships a demo with three Claude Code agents (`agent-luna`, `agent-mars`, `agent-orion`) and a two-worker pool. Each agent's container runs `claude --print "$TASK"` on a timer, then idles.

> **Security note:** this upstream demo puts `ANTHROPIC_API_KEY` into each template as a **literal environment value**. That means the key is visible to anyone who can run `kubectl ate get actor-template -o yaml`, and it's baked into every golden snapshot. Use a throwaway key with a low spending limit. The safe pattern is **egress credential injection**, where the Actor only holds a placeholder (see `docs/egress-credential-injection.md` in the Substrate repo).

### Deploy the agents

The installer builds the agent image with `docker buildx`, pushes it to the local registry, and creates the namespace, a 2-worker WorkerPool, the `claude-multiplex-demo` atespace, and the three templates:

```bash
export ANTHROPIC_API_KEY=<throwaway-anthropic-api-key>
hack/install-ate-kind.sh --deploy-demo-claude-code-multiplex

kubectl ate get actor-templates -a claude-multiplex-demo
```

The installer creates templates, not Actors. Create one Actor per template:

```bash
for agent in luna mars orion; do
  kubectl ate create actor "$agent" -a claude-multiplex-demo --template "agent-$agent"
done
```

### Let the agents reach Anthropic

Actor egress is **denied by default**. An Actor without an egress policy gets `REFUSED` for every DNS lookup and `403` for every HTTP(S) request. The agents need exactly one destination.

These templates don't project the egress gateway's CA, so use a **TLS passthrough** rule: the gateway checks the server name (SNI) and forwards the encrypted connection without decrypting it.

```bash
for agent in luna mars orion; do
  kubectl ate create egress-policy "$agent" -a claude-multiplex-demo -f - <<EOF
rules:
- tlsPassthrough:
    hostnames: ["api.anthropic.com"]
    ports:
      numbers: [443]
EOF
done

kubectl ate get egress-policy luna -a claude-multiplex-demo -o yaml
```

Anything else the agent tries, such as `curl https://example.com` from a tool call, is refused.

### Run them

These agents don't serve HTTP, so wake them directly instead of through the router:

```bash
for agent in luna mars orion; do
  kubectl ate resume actor "$agent" -a claude-multiplex-demo
done

kubectl ate get actors -a claude-multiplex-demo
kubectl ate logs actor luna -a claude-multiplex-demo -f
```

The demo's templates set no resource limits, so in v0.5.0 the scheduler is free to pack all three agents onto the two workers. Check the `WORKER POD` column. To free capacity, suspend an agent between its ticks; it resumes later with its process state intact:

```bash
kubectl ate suspend actor orion -a claude-multiplex-demo
kubectl ate resume actor orion -a claude-multiplex-demo
```

The upstream demo also has a small dashboard in `demos/claude-code-multiplex/ui` that shows workers and Actors. See its README.

## Clean up

```bash
for i in 1 2 3 4 5; do kubectl ate delete actor "c$i" -a multiplex --any-state; done
kubectl ate delete atespace multiplex

hack/install-ate-kind.sh --delete-demo-claude-code-multiplex
```

`--any-state` deletes an Actor from any state (for example `RUNNING`), tearing down its workload. Deleting the Claude demo removes its Actors, templates, atespace, and namespace.

## Next

[Workers Hosting Several Actors](worker-packing.md).

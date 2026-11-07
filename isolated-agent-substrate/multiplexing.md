# More Actors than Pods

A Deployment needs one Pod per agent, all the time. Substrate doesn't: Actors are records, workers are warm Pods, and Actors are placed onto workers only while they're active. This lab shows the two ways Substrate puts more agents on fewer Pods:

1. **Suspend frees capacity.** An idle Actor is snapshotted and its worker goes to someone else.
2. **Packing.** A worker hosts **several** Actors at once, each in its own sandbox, up to the worker's capacity. This lab introduces it; [Workers Hosting Several Actors](worker-packing.md) covers it in depth.

Then it runs real Claude Code agents as Actors.

> **Status:** Commands checked against the Substrate **v1.0.0** source. Not yet run end to end on a cluster.

## Prerequisites

- [Install Agent Substrate (Standalone)](installation.md).
- The counter demo (`go run ./cmd/ate-setup deploy demo counter`).
- The lab router client and the `ate_curl` function from [installation Step 5](installation.md#step-5-create-the-lab-router-client), defined in this shell.
- For Part 3: an **Anthropic API key**.

## How placement works

When an Actor resumes, ate-api-server looks for a worker that:

1. Matches the template's `workerSelector` (and the Actor's own, if set), against the **WorkerPool's** labels.
2. Runs the Actor's **sandbox class** (`gvisor` or `microvm`), if the Actor has one. The WorkerPool sets the class. An Actor restored from a snapshot always lands on a worker of the snapshot's class, because snapshots can't move between runtimes.
3. Has **room**, by two limits, whichever runs out first:
   - **Actor count:** the worker's `--max-actors` (default `1000`).
   - **Resources:** the WorkerPool's `spec.template.resources.limits` are the worker's capacity, less 64 MiB of memory the gVisor worker keeps for itself. Each placed Actor subtracts its template's `resources.limits`. Always set both CPU and memory limits on the pool: a worker with no limit for a resource reports zero capacity for it, and the scheduler treats that as **unconstrained**.

So whether Actors share a worker is a **sizing** decision. The counter demo is sized so that they don't: each worker has 1000 millicores of capacity, and each counter Actor declares `cpuMillicores: 1000`.

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
  ate_curl "multiplex/c$i" -X POST
done

kubectl ate get actors -a multiplex
kubectl ate get workers
```

`c1` to `c3` are `RUNNING` on three different workers, and the pool is full. Now free a worker by suspending `c1`, and wake `c4`:

```bash
kubectl ate suspend actor c1 -a multiplex
ate_curl multiplex/c4 -X POST
kubectl ate get actors -a multiplex
```

`c4` took the worker `c1` released. `c1`'s state is in snapshot storage, and it resumes, on whichever worker is free, the next time it gets a request. Five agents, three Pods, and nobody lost state.

If you request a fifth Actor while all three workers are busy, the router **parks** the request for a few seconds, waiting for a worker to free up, as you see in the [request parking lab](parking-autoscaling.md).

## Part 2: Packing several Actors onto one worker

A worker isn't limited to one Actor. It hosts as many as its CPU and memory capacity (and its actor limit) allow, each in its own sandbox. [Workers Hosting Several Actors](worker-packing.md) builds a pool sized by memory and packs it step by step.

## Part 3: Real agents (Claude Code)

The Substrate repo ships a demo with three Claude Code agents (`luna`, `mars`, `orion`, from the templates `agent-luna`, `agent-mars`, `agent-orion`) and a two-worker pool. Each agent's container runs `claude --print "$TASK"` in a loop.

> **Security note:** this upstream demo puts `ANTHROPIC_API_KEY` into each template as a **literal environment value**. That means the key is visible to anyone who can run `kubectl ate get actor-template -o yaml`, and it's baked into every golden snapshot. Use a throwaway key with a low spending limit. The safe pattern is **egress credential injection**, where the Actor only holds a placeholder (see `docs/guides/egress-credential-injection.md` in the Substrate repo).

### Deploy the agents

The installer builds the agent image with `docker buildx` and pushes it to the local registry. Then it creates:

- the `claude-multiplex-demo` namespace and a 2-worker WorkerPool, each worker 1 CPU and 2560 MiB
- the `claude-multiplex-demo` atespace and the three templates, each sized `cpuMillicores: 1000` and `memoryBytes: 2147483648` (2 GiB), so **one agent fills a worker**
- the three Actors, `SUSPENDED`
- an egress policy for each Actor

```bash
export ANTHROPIC_API_KEY=<throwaway-anthropic-api-key>
go run ./cmd/ate-setup deploy demo claude-code-multiplex

kubectl ate get actor-templates -a claude-multiplex-demo
kubectl ate get actors -a claude-multiplex-demo
```

### How the agents reach Anthropic

Actor egress is **denied by default**. An Actor without an egress policy gets `REFUSED` for every DNS lookup and `403` for every HTTP(S) request. The agents need exactly one destination, and the installer gave each one a policy for it:

```bash
kubectl ate get egress-policy luna -a claude-multiplex-demo -o yaml
```

These templates don't project the egress gateway's CA, so the policy uses **TLS passthrough** for `api.anthropic.com:443`: the gateway checks the server name (SNI) and forwards the encrypted connection without decrypting it. Anything else the agent tries, such as `curl https://example.com` from a tool call, is refused.

### Run them

These agents don't serve HTTP, so wake them directly instead of through the router. Two workers fit two agents:

```bash
kubectl ate resume actor luna -a claude-multiplex-demo
kubectl ate resume actor mars -a claude-multiplex-demo

kubectl ate get actors -a claude-multiplex-demo
kubectl ate logs actor luna -a claude-multiplex-demo -f
```

`luna` and `mars` are `RUNNING`, each on its own worker. Check the `WORKER POD` column. To run `orion`, free a worker: suspend `luna`, which resumes later with its process state intact, and resume `orion` in its place:

```bash
kubectl ate suspend actor luna -a claude-multiplex-demo
kubectl ate resume actor orion -a claude-multiplex-demo
kubectl ate get actors -a claude-multiplex-demo
```

Three agents, two Pods. The upstream demo also has a small dashboard in `demos/claude-code-multiplex/ui` that does this rotation for you: it resumes an agent when it gets a task and suspends it when the task ends. See its README.

## Clean up

```bash
for i in 1 2 3 4 5; do kubectl ate delete actor "c$i" -a multiplex; done
kubectl ate delete atespace multiplex

go run ./cmd/ate-setup delete demo claude-code-multiplex
```

`delete actor` works from any state. On a `RUNNING` Actor, it tears down the workload and frees the worker first. Deleting the Claude demo removes its Actors, templates, atespace, and namespace.

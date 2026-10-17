# Request Parking and WorkerPool Autoscaling

What happens when a request arrives for a suspended Actor and **every worker is busy**? Substrate answers on two time scales:

- **Seconds: the router parks the request.** It holds the request and keeps retrying the resume until a worker frees up, instead of failing straight away with `503`.
- **Minutes: an HPA grows the WorkerPool.** A HorizontalPodAutoscaler watches how many workers are full and adds warm workers when the pool stays saturated.

> **Status:** Commands checked against the Substrate **v0.5.0** source. Not yet run end to end on a cluster.

## Prerequisites

- [Install Agent Substrate (Standalone)](installation.md) on **kind**. The autoscaling demo is kind-only.
- The counter demo (`hack/install-ate-kind.sh --deploy-demo-counter`).
- The router port-forward running in a separate terminal:

```bash
kubectl port-forward -n ate-system svc/atenet-router 8000:80
```

## Part 1: Request parking

Parking is **on by default** in the router:

| Router flag | Default | Meaning |
| --- | --- | --- |
| `--parked-request-budget` | `5s` | How long a request may wait for a worker |
| `--parked-request-max` | `1024` | Maximum requests parked at once; more are shed with `503`. `0` turns parking off |
| `--parked-request-retry-interval` | `100ms` | First retry delay (grows by `--parked-request-retry-factor`, `1.1`) |

### Saturate the pool

The counter pool has 3 workers, and each counter Actor fills a worker (1 CPU of capacity, 1 CPU per Actor; see [More Actors than Pods](multiplexing.md#how-placement-works)). Create four Actors and wake three:

```bash
kubectl ate create atespace parking-lab
for i in 1 2 3 4; do
  kubectl ate create actor "p$i" -a parking-lab --template ate-demo-counter/counter
done

for i in 1 2 3; do
  curl -s -X POST -H "ate-target-actor: parking-lab/p$i" http://localhost:8000
done

kubectl ate get workers
```

All three workers show `CPU` `1/1`: each worker's whole CPU capacity is reserved by one Actor, so no worker has room for a fourth.

### Watch a request park, then get served

Request `p4` with timing. The pool is full, so the request **parks** and `curl` hangs:

```bash
curl -s -w '\n-> HTTP %{http_code} in %{time_total}s\n' \
  -H "ate-target-actor: parking-lab/p4" http://localhost:8000
```

Within **five seconds**, in another terminal, free a worker:

```bash
kubectl ate suspend actor p1 -a parking-lab
```

Back in the first terminal, the parked request completes with **`HTTP 200`**. `time_total` shows how long it waited. If you don't free a worker in time, the request ends with `503` once the 5-second budget runs out. That's the signal that capacity, not a fault, is the bottleneck.

### Look at the parking lot

The router's status page has a Request Parking section:

```bash
kubectl -n ate-system port-forward deployment/atenet-router 4040:4040
```

```bash
curl -s 'http://localhost:4040/statusz?format=json' | jq .parking
```

```json
{ "enabled": true, "active": 0, "max_parked": 1024, "max_wait": "5s" }
```

`active` is the number of requests parked right now. The router also exports metrics on container port `9090`: `atenet.router.parking.active`, `atenet.router.parking.wait.duration` (with an `outcome` label: `served`, `budget_exhausted`, `canceled`, `timeout`, or `error`), and `atenet.router.parking.rejected`.

### Compare with parking off

Turn parking off by adding `--parked-request-max=0` to the router container's arguments:

```bash
kubectl -n ate-system patch deployment atenet-router --type=json \
  -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--parked-request-max=0"}]'
kubectl -n ate-system rollout status deployment/atenet-router
```

Restart the router port-forward, wake `p1`, `p2`, and `p3` again so the pool is full, and request `p4`. Now it fails **immediately** with `503`.

Turn parking back on:

```bash
kubectl -n ate-system rollout undo deployment/atenet-router
kubectl -n ate-system rollout status deployment/atenet-router
```

Clean up Part 1:

```bash
for i in 1 2 3 4; do kubectl ate delete actor "p$i" -a parking-lab --any-state; done
kubectl ate delete atespace parking-lab
```

## Part 2: Autoscale the WorkerPool with an HPA

A WorkerPool has a `scale` subresource, so a standard HorizontalPodAutoscaler can drive `spec.replicas`. The signal is how many of the pool's workers are **full**:

```text
ate-api-server :9090/metrics   ate_workerpool_workers{state="at_capacity"}
        │  scraped by Prometheus (otel-system)
        ▼
prometheus-adapter             serves it on external.metrics.k8s.io
        ▼
HorizontalPodAutoscaler        desiredReplicas = ceil(full_workers / 0.7)
        ▼
WorkerPool.spec.replicas  →  ate-controller  →  Deployment  →  worker Pods
```

`averageValue: "0.7"` means "keep about 30% of workers idle as headroom". With 7 full workers, the HPA asks for `ceil(7 / 0.7) = 10`.

### Deploy the autoscaling demo

```bash
hack/install-ate-kind.sh --deploy-demo-autoscaled-workerpool
```

This creates:

- the `ate-demo-autoscaled-workerpool` namespace and atespace
- a WorkerPool `counter` with 5 replicas and the label `workload: counter-autoscaled`
- an ActorTemplate `counter`
- `prometheus-adapter`
- an HPA `counter`: `minReplicas: 2`, `maxReplicas: 25`, fast scale-up, and a 300-second scale-down stabilization window

Check that the external metric is served:

```bash
kubectl get apiservice v1beta1.external.metrics.k8s.io

kubectl get --raw "/apis/external.metrics.k8s.io/v1beta1/namespaces/ate-demo-autoscaled-workerpool/ate_workerpool_workers?labelSelector=ate_worker_state%3Dat_capacity,ate_workerpool_namespace%3Date-demo-autoscaled-workerpool,ate_workerpool_name%3Dcounter"
```

### Size the pool so "full" means something

The demo's README assumes **one Actor per worker**. Since v0.5.0, workers host several Actors. The demo's pool and template declare no resource limits, so a worker only counts as full at its actor limit (`--max-actors`, default 1000), and the HPA would never see a full worker.

Give each worker a capacity, and make each Actor fill it, the same way the counter demo is sized:

```bash
kubectl patch workerpool counter -n ate-demo-autoscaled-workerpool --type merge -p '
{"spec":{"template":{"resources":{
  "limits":{"cpu":"1","memory":"256Mi"},
  "requests":{"cpu":"100m","memory":"256Mi"}}}}}'

kubectl rollout status deployment/counter -n ate-demo-autoscaled-workerpool
```

The low CPU request keeps the worker Pods schedulable on a single kind node. Capacity comes from the **limits**.

Create a template whose Actors each use a full CPU:

```bash
export COUNTER_IMAGE=$(kubectl ate get actor-template counter -a ate-demo-autoscaled-workerpool -o json \
  | jq -r '.actorTemplates[0].containers[0].image')

kubectl ate create actor-template -f - <<EOF
metadata:
  atespace: ate-demo-autoscaled-workerpool
  name: counter-sized
workerSelector:
  matchLabels:
    workload: counter-autoscaled
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
    quantity: "1"
  - name: memory
    quantity: 128Mi
snapshotConfig:
  preferredFidelity: SNAPSHOT_FIDELITY_MEMORY
  storageLocation: gs://ate-snapshots/ate-demo-autoscaled-workerpool/
sandboxConfig:
  sandboxClass: gvisor
  configName: gvisor-default
EOF
```

Run this until `GOLDEN TAG` is set:

```bash
kubectl ate get actor-template counter-sized -a ate-demo-autoscaled-workerpool
```

### Generate load

Create more Actors than there are workers, and keep them busy:

```bash
for i in $(seq -w 1 8); do
  kubectl ate create actor "c$i" -a ate-demo-autoscaled-workerpool --template counter-sized
done

for round in $(seq 1 10); do
  for i in $(seq -w 1 8); do
    curl -s -o /dev/null -H "ate-target-actor: ate-demo-autoscaled-workerpool/c$i" http://localhost:8000
  done
done
```

Requests that find the pool full park, as in Part 1, and some return `503` once their 5-second budget runs out. That's expected while the pool is too small.

### Watch it scale

In separate terminals:

```bash
kubectl -n ate-demo-autoscaled-workerpool get hpa counter -w
```

```bash
kubectl -n ate-demo-autoscaled-workerpool get workerpool counter -w
```

As full workers climb, the HPA raises the WorkerPool's replicas. The new workers come up warm, and parked requests start landing on them. Re-run the load loop to fill them.

### Scale back down

```bash
for i in $(seq -w 1 8); do
  kubectl ate suspend actor "c$i" -a ate-demo-autoscaled-workerpool
done
```

Full workers drop to zero. After the 300-second stabilization window, the HPA shrinks the pool, two workers at a time, down to `minReplicas: 2`.

## Clean up

Delete what you added first, then the demo:

```bash
for i in $(seq -w 1 8); do
  kubectl ate delete actor "c$i" -a ate-demo-autoscaled-workerpool --any-state
done
kubectl ate delete actor-template counter-sized -a ate-demo-autoscaled-workerpool

hack/install-ate-kind.sh --delete-demo-autoscaled-workerpool
```

The demo's delete step removes its own Actors and template, the atespace, the HPA, `prometheus-adapter`, the pool, and the namespace.

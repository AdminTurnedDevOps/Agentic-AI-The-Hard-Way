# Request Parking

What happens when a request arrives for a suspended Actor and **every worker is busy**? The router **parks** the request: it holds it and keeps retrying the resume until a worker frees up, instead of failing straight away with `503`.

> **Status:** Commands checked against the Substrate **v1.0.0** source. Not yet run end to end on a cluster.

## Prerequisites

- [Install Agent Substrate (Standalone)](installation.md).
- The counter demo (`go run ./cmd/ate-setup deploy demo counter`).
- The lab router client and the `ate_curl` function from [installation Step 5](installation.md#step-5-create-the-lab-router-client), defined in this shell **and** in a second terminal.

## Parking settings

Parking is **on by default** in the router:

| Router flag | Default | Meaning |
| --- | --- | --- |
| `--parked-request-budget` | `5s` | How long a request may wait for a worker |
| `--parked-request-max` | `1024` | Maximum requests parked at once; more are shed with `503`. `0` turns parking off |
| `--parked-request-retry-interval` | `100ms` | First retry delay. Each retry multiplies it by `--parked-request-retry-factor` (`1.1`) |
| `--parked-request-retry-jitter` | `0.1` | Random fraction added to each retry delay, so parked requests don't retry in lockstep |

## Step 1: Saturate the pool

The counter pool has 3 workers, and each counter Actor fills a worker (1000 millicores of capacity, `cpuMillicores: 1000` per Actor; see [More Actors than Pods](multiplexing.md#how-placement-works)). Create four Actors and wake three:

```bash
kubectl ate create atespace parking-lab
for i in 1 2 3 4; do
  kubectl ate create actor "p$i" -a parking-lab --template ate-demo-counter/counter
done

for i in 1 2 3; do
  ate_curl "parking-lab/p$i" -X POST
done

kubectl ate get workers -n ate-demo-counter
```

All three workers show `CPU(MILLICORES)` `1000/1000`: each worker's whole CPU capacity is reserved by one Actor, so no worker has room for a fourth.

## Step 2: Watch a request park, then get served

Request `p4` with timing. The pool is full, so the request **parks** and the command hangs:

```bash
ate_curl parking-lab/p4 -X POST -w '\n-> HTTP %{http_code} in %{time_total}s\n'
```

Within **five seconds**, in the second terminal, free a worker:

```bash
kubectl ate suspend actor p1 -a parking-lab
```

Back in the first terminal, the parked request completes with **`HTTP 200`**. `time_total` shows how long it waited. If you don't free a worker in time, the request ends with `503` once the 5-second budget runs out. That's the signal that capacity, not a fault, is the bottleneck.

## Step 3: Look at the parking lot

The router's status page has a Request Parking section. It listens on port 4040 inside the router Pod, on loopback only, so port-forward to it:

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

## Step 4: Compare with parking off

Turn parking off by adding `--parked-request-max=0` to the router container's arguments:

```bash
kubectl -n ate-system patch deployment atenet-router --type=json \
  -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--parked-request-max=0"}]'
kubectl -n ate-system rollout status deployment/atenet-router
```

The pool is still full: `p4` took the worker `p1` gave up, and `p2` and `p3` are still running. Restarting the router doesn't touch them. Request the suspended `p1`:

```bash
ate_curl parking-lab/p1 -X POST -w '\n-> HTTP %{http_code} in %{time_total}s\n'
```

It fails **immediately** with `503`, instead of waiting.

Turn parking back on:

```bash
kubectl -n ate-system rollout undo deployment/atenet-router
kubectl -n ate-system rollout status deployment/atenet-router
```

## Optional: parking under load

Upstream ships the same scenario as a demo with its own 2-worker pool and a load generator. `load.sh` starts a `kubectl ate proxy` per Actor and runs one request-then-suspend loop for each, so the pool stays oversubscribed:

```bash
go run ./cmd/ate-setup deploy demo parking
for id in p1 p2 p3 p4; do
  kubectl ate create actor "$id" -a ate-demo-parking --template parking
done

./demos/parking/load.sh            # 30 seconds, Actors p1 to p4
```

With parking on, the tally should show no `503`s. Turn parking off as in Step 4 and run it again to see the `503`s come back. See `demos/parking/README.md` in the Substrate repo. Remove it with `go run ./cmd/ate-setup delete demo parking`.

## Clean up

```bash
for i in 1 2 3 4; do kubectl ate delete actor "p$i" -a parking-lab; done
kubectl ate delete atespace parking-lab
```

`delete actor` works from any state, so this also removes the Actors that are still running.

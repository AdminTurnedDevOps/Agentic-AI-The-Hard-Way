# Observe Substrate

An Actor doesn't sit in one Pod. It's suspended, resumed, and moved between workers, so "look at the Pod's logs" doesn't work. Substrate tags its telemetry with Actor identity (`ate.*` attributes) so you can follow an Actor across workers as if it had one machine the whole time.

The kind install already runs the observability stack in `otel-system`: an **OpenTelemetry Collector**, **Prometheus**, and **Jaeger**.

> **Status:** Commands checked against the Substrate **v0.5.0** source (`docs/observability.md`). Not yet run end to end on a cluster.

## Prerequisites

- [Install Agent Substrate (Standalone)](installation.md) on kind.
- The counter demo (`hack/install-ate-kind.sh --deploy-demo-counter`).
- The router port-forward running in a separate terminal:

```bash
kubectl port-forward -n ate-system svc/atenet-router 8000:80
```

Generate some activity to look at:

```bash
kubectl ate create atespace obs-lab
kubectl ate create actor watch-me -a obs-lab --template ate-demo-counter/counter

for i in 1 2 3; do curl -s -X POST -H "ate-target-actor: obs-lab/watch-me" http://localhost:8000; done
kubectl ate suspend actor watch-me -a obs-lab
curl -s -X POST -H "ate-target-actor: obs-lab/watch-me" http://localhost:8000
```

## 1. Logs that follow the Actor

```bash
kubectl ate logs actor watch-me -a obs-lab
kubectl ate logs actor watch-me -a obs-lab -f
```

The stream is put together across worker reassignments: the same command keeps working after the Actor teleports to another Pod. Narrow it down:

```bash
# Only one container
kubectl ate logs actor watch-me -a obs-lab -c counter

# Only container output, or only lifecycle events
kubectl ate logs actor watch-me -a obs-lab --source=containers
kubectl ate logs actor watch-me -a obs-lab --source=lifecycle
```

The lifecycle stream shows resume, suspend, and the rest, with the worker each one happened on.

ate-api-server also writes a structured **lifecycle event** for every state change (`ate.actor.state` with values such as `running` or `suspended`) and a separate event when an Actor crashes. The workers write periodic **usage samples** per Actor. These carry Actor identity, so they live in **logs**, not metrics. On kind they're sent over OTLP to the collector and also printed to stdout:

```bash
kubectl -n ate-system logs deploy/ate-api-server | grep -i 'ate.actor.state' | tail -5
```

## 2. Metrics in Prometheus

```bash
kubectl port-forward -n otel-system svc/prometheus 9090:9090
```

Open <http://localhost:9090>. Run `up` first: one series per scraped component, value `1`.

Then try the worker-pool gauge, the same one that drives the HPA in the [autoscaling lab](parking-autoscaling.md):

```text
ate_workerpool_workers
```

It's split by `state`: `idle`, `partial`, `at_capacity`, or `unschedulable`.

Use the expression browser's autocomplete (type `ate_` or `atenet_`) to explore the rest. Some instruments worth knowing, by their OpenTelemetry names:

| Instrument | From | What it tells you |
| --- | --- | --- |
| `ate.actor.lifecycle.operation.duration` | ate-api-server | How long create, resume, suspend, pause, delete, and revert take, and whether they failed |
| `ate.scheduler.assignment.duration` | ate-api-server | How long it takes to find a worker for a resuming Actor |
| `ate.actor.restore.duration` | atelet | Restore time on the node, broken down by phase. This is where cold-start latency goes |
| `ate.actor.checkpoint.duration` | atelet | The same breakdown for writing a snapshot |
| `atelet.snapshot.size` | atelet | Size of each snapshot written |
| `atenet.router.route.duration` | atenet-router | Router latency from receiving a request to forwarding it |
| `atenet.router.parking.*` | atenet-router | Request parking: active, wait time, rejected |
| `ate.actor.crashes` | ate-api-server | Actors that moved to `CRASHED` |

**No metric carries Actor identity.** Labels are bounded: template, pool, sandbox class, operation, and outcome. Per-Actor detail is in logs and traces. That's deliberate, to keep metric cardinality bounded when you run thousands of Actors.

## 3. Traces in Jaeger

```bash
kubectl port-forward -n otel-system svc/jaeger 16686:16686
```

Open <http://localhost:16686>. On kind, ate-api-server traces every API call. Add `--trace` to any `kubectl ate` command to print the trace ID and force sampling end to end:

```bash
kubectl ate suspend actor watch-me -a obs-lab --trace
```

Paste the printed trace ID into Jaeger's search box. A suspend crosses `ateapi`, `atelet`, and `ateom-gvisor`, so you see the control-plane call, the node checkpoint, and the upload in one trace. You can also pick `ateapi`, `atelet`, or `ateom-gvisor` under **Service** and click **Find Traces**.

## 4. Your Actor's own telemetry needs an egress policy

Substrate's components export through a relay. **Your workload's** OpenTelemetry SDK, inside the Actor, dials the collector like any other outbound connection, and Actor egress is denied by default. Without a policy the Actor can't even resolve the collector's name.

Give the Actor an `http` rule for the collector's OTLP ports. It must be `http`, not `https`: OTLP/gRPC is cleartext HTTP/2 on 4317, and OTLP/HTTP is cleartext HTTP/1.1 on 4318.

```bash
kubectl ate create egress-policy watch-me -a obs-lab -f - <<'EOF'
rules:
- http:
    hostnames: ["opentelemetry-collector.otel-system.svc"]
    ports:
      numbers: [4317, 4318]
EOF
```

The hostname must match the host in the workload's `OTEL_EXPORTER_OTLP_ENDPOINT`, because the rule is matched on the request's authority. The collector sees connections coming from the egress gateway Pod, not the Actor, so set the Actor's identity in `OTEL_RESOURCE_ATTRIBUTES` yourself if you need it on the backend. (The counter demo doesn't export its own telemetry; this is the pattern for workloads that do.)

## Clean up

```bash
kubectl ate delete egress-policy watch-me -a obs-lab
kubectl ate delete actor watch-me -a obs-lab --any-state
kubectl ate delete atespace obs-lab
```

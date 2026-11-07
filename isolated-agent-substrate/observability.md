# Observe Substrate

An Actor doesn't sit in one Pod. It's suspended, resumed, and moved between workers, so "look at the Pod's logs" doesn't work. Substrate tags its telemetry with Actor identity (`ate.*` attributes) so you can follow an Actor across workers as if it had one machine the whole time.

The kind install already runs the observability stack in `otel-system`: an **OpenTelemetry Collector**, **Prometheus**, and **Jaeger**.

> **Status:** Commands checked against the Substrate **v1.0.0** source (`docs/guides/observability.md`). Not yet run end to end on a cluster.

## Prerequisites

- [Install Agent Substrate (Standalone)](installation.md) on kind.
- The counter demo (`go run ./cmd/ate-setup deploy demo counter`).
- The lab router client and the `ate_curl` function from [installation Step 5](installation.md#step-5-create-the-lab-router-client), defined in this shell.

Generate some activity to look at. The last request resumes the Actor, so it's running when you read its logs:

```bash
kubectl ate create atespace obs-lab
kubectl ate create actor watch-me -a obs-lab --template ate-demo-counter/counter

for i in 1 2 3; do ate_curl obs-lab/watch-me -X POST; done
kubectl ate suspend actor watch-me -a obs-lab
ate_curl obs-lab/watch-me -X POST
```

## 1. Logs that follow the Actor

```bash
kubectl ate logs actor watch-me -a obs-lab
```

This reads the worker Pod the Actor is running on **right now**. A suspended Actor has no worker, so you get:

```text
Error: actor obs-lab/watch-me is not currently running on any worker pod
```

Resume it first (any request does that). History from earlier workers and earlier suspend cycles needs a central log backend.

Follow the stream with `-f`. It's put together across worker reassignments, so the same command keeps working when the Actor teleports to another Pod:

```bash
kubectl ate logs actor watch-me -a obs-lab -f
```

Narrow it down:

```bash
# Only one container, or only the sandbox's own output
kubectl ate logs actor watch-me -a obs-lab -c counter
kubectl ate logs actor watch-me -a obs-lab -c _sandbox

# Only container output, or only lifecycle events
kubectl ate logs actor watch-me -a obs-lab --source=containers
kubectl ate logs actor watch-me -a obs-lab --source=lifecycle
```

`-c` can't be combined with `--source=lifecycle`. The lifecycle stream shows `Actor starting`, `Actor started`, `Actor checkpointing`, `Actor checkpointed`, `Actor restoring`, `Actor restored`, and `Actor terminated`, for the current worker only.

ate-api-server also writes a structured log record for every state change (`Actor state changed`, with `ate.actor.state` such as `suspended` and the `ate.actor.operation.name` that caused it), one when an Actor crashes (`Actor crashed`), and periodic per-Actor usage samples (`Actor usage sampled`). These carry Actor identity, so they live in **logs**, not metrics. On kind they're sent over OTLP to the collector and also printed to stdout. ate-api-server runs two replicas, so read both:

```bash
kubectl -n ate-system logs -l app=ate-api-server --tail=-1 | grep 'Actor state changed' | tail -5
```

## 2. Metrics in Prometheus

```bash
kubectl port-forward -n otel-system svc/prometheus 9090:9090
```

Open <http://localhost:9090>. Run `up` first: one series per scraped component Pod, value `1`.

Then try the worker-pool gauge:

```text
ate_workerpool_workers
```

It's labeled by pool (`ate_workerpool_namespace`, `ate_workerpool_name`), `ate_sandbox_class`, and `ate_worker_state`: `idle`, `partial`, `at_capacity`, or `unschedulable`. Both ate-api-server replicas report the whole fleet, so every value appears twice. Average the replicas away before you add anything up:

```text
sum by (ate_worker_state) (
  avg by (ate_workerpool_namespace, ate_workerpool_name, ate_worker_state) (ate_workerpool_workers)
)
```

Use the expression browser's autocomplete (type `ate_`, `atelet_`, or `atenet_`) to explore the rest. Some instruments worth knowing, by their OpenTelemetry names:

| Instrument | From | What it tells you |
| --- | --- | --- |
| `ate.actor.lifecycle.operation.duration` | ate-api-server | How long create, resume, suspend, delete, and revert take, and whether they failed |
| `ate.scheduler.assignment.duration` | ate-api-server | How long it takes to find a worker for a resuming Actor |
| `ate.actor.restore.duration` | atelet | Restore time on the node, broken down by phase. This is where cold-start latency goes |
| `ate.actor.checkpoint.duration` | atelet | The same breakdown for writing a snapshot |
| `atelet.snapshot.size` | atelet | Size of each snapshot written |
| `atelet.snapshot.upload.duration` | atelet | How long a snapshot takes to reach object storage |
| `ate.actor.stats.*` | atelet | CPU and memory use of the running Actors on a node, summed per template |
| `atenet.router.route.duration` | atenet-router | Router latency from receiving a request to forwarding it. `ate.router.outcome` says how it ended: `ok`, `no_capacity`, `denied`, `resume_error`, and so on |
| `atenet.router.parking.*` | atenet-router | [Request parking](parking-autoscaling.md): active, wait time, rejected |
| `ate.actor.crashes` | ate-api-server | Actors that moved to `CRASHED` |

**No metric carries Actor identity.** Labels are bounded: template, pool, sandbox class, operation, and outcome. Per-Actor detail is in logs and traces. That's deliberate, to keep metric cardinality bounded when you run thousands of Actors.

## 3. Traces in Jaeger

```bash
kubectl port-forward -n otel-system svc/jaeger 16686:16686
```

Open <http://localhost:16686>. On kind, ate-api-server samples every API call. The other components sample a fraction (10% for the control plane, 1% for the router). Add the global `--trace` flag to any `kubectl ate` command to print the trace ID and force sampling end to end:

```bash
kubectl ate suspend actor watch-me -a obs-lab --trace
```

Paste the printed trace ID into Jaeger's search box. A suspend crosses `ateapi`, `atelet`, and `ateworker-gvisor`, so you see the control-plane call, the node checkpoint, and the upload in one trace. You can also pick `ateapi`, `atelet`, or `ateworker-gvisor` under **Service** and click **Find Traces**.

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

The counter demo doesn't export its own telemetry; this is the pattern for workloads that do. Three things to know:

- **Substrate puts no OTLP settings into the Actor.** Set `OTEL_EXPORTER_OTLP_ENDPOINT` (for example `http://opentelemetry-collector.otel-system.svc:4317`) in the template's container `env`. The rule's hostname must match that host, because the rule is matched on the request's authority. Without the variable, the SDK sends to `localhost:4317` and the data is dropped silently.
- **Create the policy before the Actor first runs.** The policy is per Actor. If you add it while the Actor is already running and failing to export, expect the first successful export 45 seconds to two minutes later, while the SDK backs off and the gateway's policy cache expires.
- **The collector sees the egress gateway, not the Actor.** Anything the collector adds from the source IP describes the gateway Pod. The Actor's `service.name` and `OTEL_RESOURCE_ATTRIBUTES` survive, but the template's env is the same for every Actor and is frozen into the golden snapshot, so it can't carry a per-Actor name. To tag telemetry with the Actor's identity, mount a `systemInfo` volume with an `actorMetadata` source and have the workload read the files when it exports (for example `/run/ate/actor-name`):

```yaml
volumes:
- name: system-info
  systemInfo:
    dataSources:
    - actorMetadata:
        items:
        - field: ACTOR_METADATA_FIELD_NAME
          path: actor-name
        - field: ACTOR_METADATA_FIELD_ATESPACE
          path: atespace
containers:
- name: main
  # ...
  volumeMounts:
  - name: system-info
    mountPath: /run/ate
```

Those files are written per Actor on every resume, so they're correct even for Actors restored from a shared snapshot. See "SystemInfo Volumes" in `docs/reference/api-guide.md`.

## Clean up

```bash
kubectl ate delete egress-policy watch-me -a obs-lab
kubectl ate delete actor watch-me -a obs-lab
kubectl ate delete atespace obs-lab
```

# Cost: Actors vs Always-On Deployments

Most agents are idle most of the time. On plain Kubernetes, an idle agent still holds a Pod. On Substrate, an idle agent is a suspended record, and only **active** agents use a worker. This lab measures both models with the same workload, the counter:

| Model | What runs |
| --- | --- |
| Always-on Kubernetes | One `Deployment` + `Service` per agent, all running all the time |
| Substrate | One Actor per agent, all sharing the 3-worker `counter` WorkerPool |

You measure the Pod count, the resources reserved, and request latency (cold wake vs warm) for each.

> **Status:** Commands checked against the Substrate **v0.5.0** source. Not yet run end to end on a cluster. Latency numbers depend heavily on your machine; on a single kind node, treat them as relative, not absolute.

## Prerequisites

- [Install Agent Substrate (Standalone)](installation.md).
- The counter demo (`hack/install-ate-kind.sh --deploy-demo-counter`): 3 workers, each 1 CPU and 1 GiB.

## Step 1: Configure

```bash
export AGENT_COUNT=20
export BENCH_NS=cost-bench
export ATESPACE=cost-bench

export COUNTER_IMAGE=$(kubectl ate get actor-template counter -a ate-demo-counter -o json \
  | jq -r '.containers[0].image')
echo "${COUNTER_IMAGE}"
```

Both models run the same image.

## Step 2: Deploy the always-on baseline

One Deployment and Service per agent. The small requests keep 20 Pods schedulable on one kind node:

```bash
kubectl create namespace "${BENCH_NS}"

for i in $(seq -w 1 "${AGENT_COUNT}"); do
  kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: k8s-counter-${i}
  namespace: ${BENCH_NS}
  labels:
    cost-comparison/model: always-on
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/instance: k8s-counter-${i}
  template:
    metadata:
      labels:
        app.kubernetes.io/instance: k8s-counter-${i}
        cost-comparison/model: always-on
    spec:
      containers:
      - name: counter
        image: ${COUNTER_IMAGE}
        command: ["/ko-app/counter"]
        ports:
        - containerPort: 80
        resources:
          requests:
            cpu: 50m
            memory: 64Mi
---
apiVersion: v1
kind: Service
metadata:
  name: k8s-counter-${i}
  namespace: ${BENCH_NS}
spec:
  selector:
    app.kubernetes.io/instance: k8s-counter-${i}
  ports:
  - port: 80
    targetPort: 80
EOF
done

kubectl wait --for=condition=Available deployment -n "${BENCH_NS}" \
  -l cost-comparison/model=always-on --timeout=10m
```

## Step 3: Create the Substrate Actors

```bash
kubectl ate create atespace "${ATESPACE}"
for i in $(seq -w 1 "${AGENT_COUNT}"); do
  kubectl ate create actor "sub-counter-${i}" -a "${ATESPACE}" --template ate-demo-counter/counter
done

kubectl ate get actors -a "${ATESPACE}"
kubectl ate get workers
```

20 Actors, all `SUSPENDED`, and 3 worker Pods with `ACTORS` `0/1000`. The Actors exist, but use no compute.

## Step 4: An in-cluster benchmark client

Run the client inside the cluster so neither path pays for a local port-forward:

```bash
kubectl run bench-client -n "${BENCH_NS}" --image=curlimages/curl:8.10.1 \
  --restart=Never --command -- sleep 3600
kubectl wait --for=condition=Ready pod/bench-client -n "${BENCH_NS}" --timeout=2m
```

## Step 5: Measure the baseline

Two requests per agent: the first and a second, both to an already-running Pod.

```bash
printf "agent\tfirst_s\tsecond_s\n" > baseline.tsv
for i in $(seq -w 1 "${AGENT_COUNT}"); do
  url="http://k8s-counter-${i}.${BENCH_NS}.svc"
  t=$(kubectl exec -n "${BENCH_NS}" bench-client -- sh -c \
    'a=$(curl -s -o /dev/null -w "%{time_total}" -X POST "$1"); b=$(curl -s -o /dev/null -w "%{time_total}" -X POST "$1"); printf "%s\t%s" "$a" "$b"' sh "$url")
  printf "k8s-counter-%s\t%s\n" "$i" "$t" >> baseline.tsv
done
column -t baseline.tsv
```

## Step 6: Measure Substrate

Two requests per Actor through the router: a **wake** (resume from snapshot, then serve) and a **warm** request. Then suspend the Actor so its worker serves the next one, the way an idle agent would be suspended:

```bash
printf "actor\twake_s\twarm_s\n" > substrate.tsv
for i in $(seq -w 1 "${AGENT_COUNT}"); do
  actor="sub-counter-${i}"
  t=$(kubectl exec -n "${BENCH_NS}" bench-client -- sh -c \
    'h="ate-target-actor: $2"; a=$(curl -s -o /dev/null -w "%{time_total}" -X POST -H "$h" "$1"); b=$(curl -s -o /dev/null -w "%{time_total}" -X POST -H "$h" "$1"); printf "%s\t%s" "$a" "$b"' \
    sh "http://atenet-router.ate-system.svc" "${ATESPACE}/${actor}")
  printf "%s\t%s\n" "${actor}" "$t" >> substrate.tsv
  kubectl ate suspend actor "${actor}" -a "${ATESPACE}" >/dev/null
done
column -t substrate.tsv
```

In another terminal, run `kubectl ate get workers` a few times while it runs: the same three Pods take turns hosting different Actors.

Compare the medians:

```bash
for f in baseline.tsv substrate.tsv; do
  echo "== $f"
  for col in 2 3; do
    tail -n +2 "$f" | cut -f"$col" | sort -n | awk -v c="$col" '{a[NR]=$1} END {print "  column " c " median: " a[int((NR+1)/2)] "s"}'
  done
done
```

The **wake** column is the cost of Substrate's density: a request that finds its Actor suspended pays for a restore. The **warm** column should look like the baseline.

## Step 7: Count Pods and reserved resources

```bash
echo "always-on Pods: $(kubectl get pods -n "${BENCH_NS}" -l cost-comparison/model=always-on --no-headers | wc -l)"
echo "Substrate worker Pods: $(kubectl get pods -n ate-demo-counter --no-headers | wc -l)"
```

Reserved CPU and memory (the requests the scheduler holds for each model):

```bash
kubectl get pods -n "${BENCH_NS}" -l cost-comparison/model=always-on \
  -o jsonpath='{range .items[*]}{.spec.containers[0].resources.requests.cpu}{" "}{.spec.containers[0].resources.requests.memory}{"\n"}{end}' \
  | sort | uniq -c

kubectl get workerpool counter -n ate-demo-counter -o jsonpath='{.spec.template.resources}{"\n"}'
```

## Step 8: Pod-hours

Pod-hours are a simple proxy for infrastructure cost:

```text
always-on: 20 agents × 24 h = 480 Pod-hours/day
Substrate:  3 workers × 24 h =  72 Pod-hours/day   (85% fewer)
```

That's for 20 agents with no more than 3 active at once. The ratio depends on how many agents are **concurrently** active, not how many exist. Size the pool for peak concurrency, and use the [autoscaling lab](parking-autoscaling.md) to follow it. Since v0.5.0, smaller Actors can also share a worker (see [More Actors than Pods](multiplexing.md)), which shrinks the pool further.

Keep the tradeoff in view:

- Every wake from suspend adds restore latency (Step 6).
- Snapshot storage costs money.
- The workers are bigger than the baseline Pods.

## Clean up

```bash
kubectl delete namespace "${BENCH_NS}"
for i in $(seq -w 1 "${AGENT_COUNT}"); do
  kubectl ate delete actor "sub-counter-${i}" -a "${ATESPACE}" --any-state
done
kubectl ate delete atespace "${ATESPACE}"
rm -f baseline.tsv substrate.tsv
```

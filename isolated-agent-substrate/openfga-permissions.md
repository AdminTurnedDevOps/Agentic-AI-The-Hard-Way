# Permissions in Front of Actors with OpenFGA

Substrate decides **where** an Actor runs and **what it can reach** on the way out (egress policies). It doesn't yet decide **who may call** an Actor. This lab adds that: an OSS **agentgateway** in front of the Substrate router asks **OpenFGA** before every request.

```text
client (short-lived Kubernetes ServiceAccount token)
  -> lab agentgateway (:8080)
       -> extAuthz adapter -> Kubernetes TokenReview          (who is calling?)
                           -> Substrate GetActor               (which Actor UID is the target?)
                           -> OpenFGA Check(user, can_invoke, actor:<uid>)
       -> allowed: atenet-router -> resume the Actor -> worker
       -> denied:  403, and the Substrate router never sees the request
```

What it demonstrates:

- **A denied call never wakes the Actor.** The check happens before the router, so a suspended Actor stays suspended and costs nothing.
- **Permissions follow the Actor, not the Pod.** They're keyed on the Actor's UID, so they hold when the Actor moves between workers.
- **Grant and revoke without restarting anything.** It's a tuple write in OpenFGA.

> **Status:** Commands checked against the Substrate **v0.5.0** source. The adapter image builds and its unit tests pass. The full lab has **not** been run end to end on a cluster yet.

## Where Substrate is today

Know the baseline before adding a layer. From the v0.5.0 docs (`docs/authentication.md`, `docs/security.md`):

| Layer | Status in v0.5.0 |
| --- | --- |
| **Control-plane API** (ate-api-server) | Authenticates mTLS certificates and bearer JWTs, but **authorization and RBAC aren't implemented yet**. Any authenticated caller has full control of every atespace, Actor, template, egress policy, snapshot, and worker. An embedded OpenFGA model is being integrated |
| **Network access to the API** | NetworkPolicy admits only Substrate's own components and namespaces labeled `ate.dev/api-access=true` |
| **Calling an Actor** (atenet-router) | No built-in caller authorization. Add an authenticating proxy (this lab) or an `ext_proc` filter |
| **Actor-to-Actor** authorization | Not built in yet |

So this lab's adapter, which only needs `GetActor`, gets a token that can do **everything** on the control plane. Treat it as a privileged component.

## Prerequisites

- [Install Agent Substrate (Standalone)](installation.md) on kind.
- The counter demo (`hack/install-ate-kind.sh --deploy-demo-counter`).
- `helm`, `docker`, `curl`, and `jq`.
- A terminal in the **root of this repository** (`Agentic-AI-The-Hard-Way`). The adapter source and manifests are in [`isolated-agent-substrate/openfga/`](https://github.com/AdminTurnedDevOps/Agentic-AI-The-Hard-Way/tree/main/isolated-agent-substrate/openfga).

## Step 1: Create the Actors

```bash
kubectl ate create atespace openfga-lab
kubectl ate create actor tool-a -a openfga-lab --template ate-demo-counter/counter
kubectl ate create actor tool-b -a openfga-lab --template ate-demo-counter/counter

export TOOL_A_UID=$(kubectl ate get actor tool-a -a openfga-lab -o json | jq -r '.actors[0].metadata.uid')
export TOOL_B_UID=$(kubectl ate get actor tool-b -a openfga-lab -o json | jq -r '.actors[0].metadata.uid')
echo "tool-a=${TOOL_A_UID} tool-b=${TOOL_B_UID}"
```

OpenFGA grants are keyed on the Actor's **UID**, not its name. If you delete `tool-a` and create a new Actor with the same name, it doesn't inherit the old Actor's permissions.

## Step 2: Install OpenFGA

The lab namespace needs the `ate.dev/api-access=true` label so the adapter can reach ate-api-server through Substrate's NetworkPolicy:

```bash
kubectl create namespace openfga-actors
kubectl label namespace openfga-actors ate.dev/api-access=true
```

Install OpenFGA `v1.21.0` (Helm chart `0.3.15`) as a single replica with the **in-memory** datastore:

```bash
helm repo add openfga https://openfga.github.io/helm-charts
helm repo update openfga

helm install openfga openfga/openfga \
  --version 0.3.15 \
  --namespace openfga-actors \
  --set replicaCount=1 \
  --set datastore.engine=memory \
  --set playground.enabled=false \
  --wait

kubectl -n openfga-actors get pods
```

The in-memory store disappears if the OpenFGA Pod restarts. That's fine for a lab; use a persistent datastore otherwise. Don't expose this unauthenticated OpenFGA Service outside the cluster.

## Step 3: Write the model and Alice's grant

Port-forward OpenFGA in a separate terminal:

```bash
kubectl -n openfga-actors port-forward svc/openfga 8082:8080
```

Create a store and load the authorization model. The model has two types: `user`, and `actor` with an `allowed_caller` relation. `can_invoke` is computed from `allowed_caller`:

```bash
export FGA=http://127.0.0.1:8082

export STORE_ID=$(curl -s -X POST "${FGA}/stores" -d '{"name":"openfga-actors-lab"}' | jq -r .id)

export MODEL_ID=$(curl -s -X POST "${FGA}/stores/${STORE_ID}/authorization-models" \
  -d @isolated-agent-substrate/openfga/model.json | jq -r .authorization_model_id)

echo "store=${STORE_ID} model=${MODEL_ID}"
```

Grant Alice access to `tool-a`, and nothing else:

```bash
curl -s -X POST "${FGA}/stores/${STORE_ID}/write" -d @- <<EOF
{"authorization_model_id": "${MODEL_ID}",
 "writes": {"tuple_keys": [
   {"user": "user:alice", "relation": "allowed_caller", "object": "actor:${TOOL_A_UID}"}]}}
EOF
```

Check it:

```bash
for target in "${TOOL_A_UID}" "${TOOL_B_UID}"; do
  curl -s -X POST "${FGA}/stores/${STORE_ID}/check" -d @- <<EOF | jq -c .
{"authorization_model_id": "${MODEL_ID}",
 "tuple_key": {"user": "user:alice", "relation": "can_invoke", "object": "actor:${target}"}}
EOF
done
```

```text
{"allowed":true,...}
{"allowed":false,...}
```

The adapter reads the store and model IDs from a ConfigMap:

```bash
kubectl -n openfga-actors create configmap openfga-actors-ids \
  --from-literal=store="${STORE_ID}" --from-literal=model="${MODEL_ID}"
```

## Step 4: Build and deploy the adapter and the gateway

The adapter is a small Python HTTP service (`isolated-agent-substrate/openfga/adapter/server.py`). On each request it:

1. Sends the caller's bearer token to the Kubernetes **TokenReview** API (audience `openfga-actors`). Only the `openfga-actors/alice` and `openfga-actors/bob` ServiceAccounts count as callers.
2. Calls Substrate **`GetActor`** for the `ate-target-actor` header, to get the Actor's current UID. It authenticates to ate-api-server with a projected ServiceAccount token (audience `api.ate-system.svc`), and trusts it through the `servicedns.podcert.ate.dev` ClusterTrustBundle.
3. Asks OpenFGA: `Check(user:<caller>, can_invoke, actor:<uid>)`.

It **fails closed**: `401` for a missing or invalid token, `403` for an unknown caller or a denied check, and `503` if TokenReview, Substrate, or OpenFGA is unreachable.

Build it and push it to the kind registry:

```bash
export IMAGE=localhost:5001/openfga-actors-auth:v0.1.0

docker build -t "${IMAGE}" isolated-agent-substrate/openfga/adapter
docker push "${IMAGE}"
```

Optionally, run its unit tests:

```bash
docker run --rm "${IMAGE}" python -m unittest -v test_server
```

Deploy the adapter: its ServiceAccount, the `alice` and `bob` ServiceAccounts, TokenReview RBAC, the Deployment, and the Service. The manifest has an image placeholder:

```bash
sed "s#ADAPTER_IMAGE_PLACEHOLDER#${IMAGE}#" isolated-agent-substrate/openfga/auth.yaml | kubectl apply -f -
kubectl -n openfga-actors rollout status deployment/openfga-actors-auth
```

Deploy the gateway, agentgateway `v1.5.0` with a static config:

```bash
kubectl apply -f isolated-agent-substrate/openfga/gateway.yaml
kubectl -n openfga-actors rollout status deployment/openfga-actors-gateway
```

The part of `gateway.yaml` that does the work:

```yaml
policies:
  extAuthz:
    host: openfga-actors-auth.openfga-actors.svc:8080
    failureMode: deny                                  # adapter down = denied
    includeRequestHeaders: [authorization, ate-target-actor]
    protocol:
      http:
        path: '"/authorize"'
backends:
- host: atenet-router.ate-system.svc:80
  policies:
    requestHeaderModifier:
      remove: [authorization]                          # the Actor never sees the caller's token
```

This gateway is separate from Substrate's own router dataplane. A Gateway API `AgentgatewayPolicy` doesn't configure Substrate's internal agentgateway or Envoy.

Port-forward the lab gateway in a separate terminal:

```bash
kubectl -n openfga-actors port-forward svc/openfga-actors-gateway 18080:8080
```

## Step 5: Allow, deny, revoke

Issue short-lived tokens for the two callers:

```bash
ALICE_TOKEN=$(kubectl -n openfga-actors create token alice --audience=openfga-actors)
BOB_TOKEN=$(kubectl -n openfga-actors create token bob --audience=openfga-actors)
```

**Alice calls `tool-a`: allowed.**

```bash
curl -i -X POST -H "Authorization: Bearer ${ALICE_TOKEN}" \
  -H "ate-target-actor: openfga-lab/tool-a" http://127.0.0.1:18080/
kubectl ate get actor tool-a -a openfga-lab
```

`200`, the counter increments, and `tool-a` is `RUNNING`.

**Alice calls `tool-b`, and Bob calls `tool-a`: both denied.**

```bash
curl -i -X POST -H "Authorization: Bearer ${ALICE_TOKEN}" \
  -H "ate-target-actor: openfga-lab/tool-b" http://127.0.0.1:18080/

curl -i -X POST -H "Authorization: Bearer ${BOB_TOKEN}" \
  -H "ate-target-actor: openfga-lab/tool-a" http://127.0.0.1:18080/

kubectl ate get actor tool-b -a openfga-lab
```

Both return `403`, and `tool-b` is still `SUSPENDED`. The denied request never reached the router, so nothing woke it. A request with no token returns `401`.

**Grant Bob access to `tool-b`.** No restart needed:

```bash
curl -s -X POST "${FGA}/stores/${STORE_ID}/write" -d @- <<EOF
{"authorization_model_id": "${MODEL_ID}",
 "writes": {"tuple_keys": [
   {"user": "user:bob", "relation": "allowed_caller", "object": "actor:${TOOL_B_UID}"}]}}
EOF

curl -i -X POST -H "Authorization: Bearer ${BOB_TOKEN}" \
  -H "ate-target-actor: openfga-lab/tool-b" http://127.0.0.1:18080/
```

`200`, and `tool-b` wakes.

**Revoke Alice's access to `tool-a`:**

```bash
kubectl ate suspend actor tool-a -a openfga-lab

curl -s -X POST "${FGA}/stores/${STORE_ID}/write" -d @- <<EOF
{"authorization_model_id": "${MODEL_ID}",
 "deletes": {"tuple_keys": [
   {"user": "user:alice", "relation": "allowed_caller", "object": "actor:${TOOL_A_UID}"}]}}
EOF

curl -i -X POST -H "Authorization: Bearer ${ALICE_TOKEN}" \
  -H "ate-target-actor: openfga-lab/tool-a" http://127.0.0.1:18080/
kubectl ate get actor tool-a -a openfga-lab
```

`403`, and `tool-a` stays `SUSPENDED`.

### Permissions survive the move between workers

Re-grant Alice, call `tool-a`, suspend it, and call it again. It may resume on a different worker, and the same grant still applies, because it's keyed on the Actor's UID. Its counters continue too:

```bash
curl -s -X POST "${FGA}/stores/${STORE_ID}/write" -d @- <<EOF
{"authorization_model_id": "${MODEL_ID}",
 "writes": {"tuple_keys": [
   {"user": "user:alice", "relation": "allowed_caller", "object": "actor:${TOOL_A_UID}"}]}}
EOF

curl -s -X POST -H "Authorization: Bearer ${ALICE_TOKEN}" \
  -H "ate-target-actor: openfga-lab/tool-a" http://127.0.0.1:18080/
kubectl ate suspend actor tool-a -a openfga-lab
curl -s -X POST -H "Authorization: Bearer ${ALICE_TOKEN}" \
  -H "ate-target-actor: openfga-lab/tool-a" http://127.0.0.1:18080/
kubectl ate get actor tool-a -a openfga-lab
```

## What this does and doesn't protect

- It protects the **entry point you publish**: the lab gateway. Substrate's own `atenet-router` still accepts traffic from any namespace in the cluster (that's its v0.5.0 NetworkPolicy), so a Pod inside the cluster can bypass the gateway by calling the router directly. To close that, add your own NetworkPolicy that only admits the lab gateway to `atenet-router`.
- The adapter's ate-api token has full control-plane access, because ate-api-server has no authorization yet.
- Callers are Kubernetes ServiceAccounts here. In production, the gateway would validate tokens from your real identity provider.

## Clean up

```bash
kubectl delete -f isolated-agent-substrate/openfga/gateway.yaml --ignore-not-found
kubectl delete -f isolated-agent-substrate/openfga/auth.yaml --ignore-not-found
helm uninstall openfga -n openfga-actors
kubectl delete namespace openfga-actors

kubectl ate delete actor tool-a -a openfga-lab --any-state
kubectl ate delete actor tool-b -a openfga-lab --any-state
kubectl ate delete atespace openfga-lab
```

`auth.yaml` also creates a cluster-scoped ClusterRole and ClusterRoleBinding (`openfga-actors-token-review`), so delete it with `kubectl delete -f` rather than only deleting the namespace.

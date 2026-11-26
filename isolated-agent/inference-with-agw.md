# Agent Inference Through agentgateway (Substrate Egress)

In the Platform Engineering track, you put agentgateway in front of an LLM yourself: a Gateway, an `AgentgatewayBackend`, and an `HTTPRoute`. With kagent on Agent Substrate, an agentgateway is **already** in the path of every Agent. Every outbound HTTPS connection from an Actor goes through `atenet-egress`, an agentgateway instance that Substrate runs in `ate-system`.

This lab shows what that gateway does with an Agent's inference traffic:

1. Checks **which Actor** is calling before it opens any tunnel.
2. **Terminates TLS** with a CA that Substrate controls, so it can read and change the request.
3. **Injects the real API key.** The Agent itself only ever holds a placeholder.
4. Only lets the Agent reach the **destinations it was compiled with**, plus any you grant with an `EgressPolicy`.

```text
Actor (gVisor sandbox)                         atenet-egress (agentgateway, ate-system)
ANTHROPIC_API_KEY=kagent-credential-injected
        │  CONNECT api.anthropic.com:443           1. authenticate the Actor (actor-id CA) and
        └── mTLS (port 8443) ──────────────────▶      resolve it through ate-api
                                                   2. terminate TLS with egress-mitm-ca-pool
                                                   3. substrateEgress policy: destination allowed?
                                                      fetch credential ──▶ k8s-credential-provider
                                                                             └─▶ Secret kagent/kagent-anthropic
                                                   4. forward with the real x-api-key
                                                                             ──▶ api.anthropic.com
```

> **Status:** Resource names, config, and flags in this lab were checked against the kagent `v1.0.1` source and the published `substrate` `1.0.0` chart (`helm template` with the values `kagent install` passes). The `curl` placeholder check was run against the real Anthropic API when this lab was first written. The full lab has **not** been run end to end on a cluster at these versions. The access-log step describes what to look for rather than an exact log line.

## Prerequisites

- kagent `1.0.1` and Substrate `1.0.0`, installed as shown in [Install kagent and Agent Substrate](installation.md) with `kagent install` and the Anthropic provider.
- The `assistant` Agent from [Using kagent with Substrate](kagent-substrate.md).
- `kubectl`, `jq`, and `curl`.

## Step 1: Find the egress gateway

`kagent install` installed the `substrate` chart, which deploys the egress gateway and the credential provider it uses:

```bash
kubectl get deploy,svc -n ate-system atenet-egress k8s-credential-provider
```

`atenet-egress` runs agentgateway:

```bash
kubectl get deploy atenet-egress -n ate-system \
  -o jsonpath='{.spec.template.spec.containers[0].name}{"  "}{.spec.template.spec.containers[0].image}{"\n"}'
```

```text
agentgateway  cr.agentgateway.dev/agentgateway:v1.7.0@sha256:60216aafb03d37f94e952ff3d51d2f630a65b10ecaebdc0a864882f92610c45b
```

The inbound router, `atenet-router`, is also agentgateway. Traffic **into** an Actor (from the kagent controller) goes through the router, and traffic **out of** an Actor (to the LLM) goes through `atenet-egress`.

## Step 2: Read the gateway config

Unlike the Platform Engineering track, this agentgateway isn't configured with Gateway API resources. It reads a static config file from a ConfigMap, and the per-Actor decisions come from the Substrate API at request time:

```bash
kubectl get configmap atenet-egress-agentgateway-config -n ate-system \
  -o jsonpath='{.data.config\.yaml}'
```

The parts that matter (shortened, with the mTLS settings between Substrate components left out):

```yaml
frontendPolicies:
  connect:
    mode: tunnel                            # Actors open HTTP CONNECT tunnels
  accessLog:
    add:
      substrate.connect.authority: 'destination.address + ":" + string(destination.port)'
  substrateEgressActorResolution:           # who is calling? Ask ate-api; fail closed
    host: api.ate-system.svc:443

gateways:
  egress:
    port: 8443                              # the CONNECT front door
    protocol: HTTPS
    tls:
      root: /run/actor-id-ca-certs/ca.crt   # only clients with an Actor identity cert get in

binds:
- mode: internal                            # where the tunnels land
  protocol: AUTO
  listeners:
  - protocol: HTTPS
    tls:
      mode: dynamicCa                       # mint a cert for each destination, signed by egress-mitm-ca-pool
      cert: /run/egress-mitm/tls.crt
      key: /run/egress-mitm/tls.key
    routes:
    - backends:
      - dynamic: {}                         # forward to whatever host the Actor asked for...
      policies:
        substrateEgress:                    # ...but only if this policy allows it
          host: api.ate-system.svc:443
          credentialProviders:
          - uriAuthority: k8s.io            # resolves ate-secret://k8s.io/... credential URIs
            target:
              host: k8s-credential-provider.ate-system.svc:50051
  - protocol: HTTP                          # plain-HTTP destinations, same substrateEgress policy
    # ...
  - protocol: TLS
    # ...
```

The Actor trusts the `dynamicCa` certificates because kagent mounts the `egress-mitm.ate.dev` trust bundle into every Actor and points `SSL_CERT_FILE`, `REQUESTS_CA_BUNDLE`, `NODE_EXTRA_CA_CERTS`, `AWS_CA_BUNDLE`, `CURL_CA_BUNDLE`, and `GIT_SSL_CAINFO` at it. A Harness can't override those variables.

## Step 3: Who can read which Secrets

The credential provider reads Kubernetes Secrets, and only for the atespaces that the Substrate release allows:

```bash
kubectl get configmap k8s-credential-provider-namespace-policy -n ate-system \
  -o jsonpath='{.data.namespace-policy\.yaml}'
```

```text
policies: [{"allowedNamespaces":["kagent"],"atespace":"kagent"}]
```

`kagent install` set that grant: Actors in atespace `kagent` may use Secrets from namespace `kagent`, and nothing else. An empty list denies everything.

The credential provider also only serves one caller, the egress gateway's own identity:

```bash
kubectl get deploy k8s-credential-provider -n ate-system \
  -o jsonpath='{.spec.template.spec.containers[0].args}' | tr ',' '\n' | grep injector-identity
```

```text
"--injector-identity=spiffe://cluster.local/ns/ate-system/sa/atenet-egress"
```

## Step 4: Follow the API key

The `assistant` Agent uses `default-model-config`. Check which Secret it points at:

```bash
kubectl get modelconfig default-model-config -n kagent \
  -o jsonpath='{.spec.provider}{"  "}{.spec.apiKeySecret}{"/"}{.spec.apiKeySecretKey}{"\n"}'
```

```text
Anthropic  kagent-anthropic/ANTHROPIC_API_KEY
```

When kagent compiles the Agent, it does **not** copy that key anywhere. Instead it:

1. Records an egress credential binding: for origin `https://api.anthropic.com:443`, replace header `x-api-key` with the value from `ate-secret://k8s.io/default/kagent/kagent-anthropic/ANTHROPIC_API_KEY`.
2. Sets `ANTHROPIC_API_KEY=kagent-credential-injected` in the Actor. The SDK needs *some* value.
3. Stores the binding with the Agent's prepared revision. Before a Session's Actor runs (on create, retry, and resume), kagent writes it into the Actor's Substrate egress policy, named `default`, in atespace `kagent`.

The gateway **replaces** a header the request already carries. It doesn't add a missing one, which is why the SDK has to send the placeholder.

The placeholder is worthless outside the gateway. Try it yourself:

```bash
curl -s https://api.anthropic.com/v1/models \
  -H "x-api-key: kagent-credential-injected" \
  -H "anthropic-version: 2023-06-01" | jq -c '.error'
```

```text
{"type":"authentication_error","message":"invalid x-api-key"}
```

So even if a prompt-injected Agent prints its environment or sends it somewhere, there is no key to leak.

## Step 5: Watch the traffic

Open two terminals.

**Terminal 1:** follow the egress gateway. It runs with `RUST_LOG=debug`, so it's chatty:

```bash
kubectl logs -n ate-system deploy/atenet-egress -f
```

**Terminal 2:** talk to the Agent:

```bash
kagent agent session create --agent assistant
```

```bash
export SESSION_ID=<session-id>
kagent agent invoke --session "${SESSION_ID}" --task "Say hello in five words."
```

In terminal 1, look for access-log entries for this request. Each entry names the Actor and where the request went:

| Field | What it shows |
| --- | --- |
| `endpoint`, `http.host` | The provider's hostname, for example `api.anthropic.com:443` and `api.anthropic.com` |
| `http.path`, `http.status` | The request the gateway read after terminating TLS, for example `/v1/messages` and its status code |
| `ate.actor.name`, `ate.actor.uid`, `ate.atespace` | Which Actor made the call. A chat Actor is named `session-<id>` in atespace `kagent` |
| `substrate.connect.authority` | The tunnel's destination, built from `destination.address` and `destination.port`. It's the **resolved IP** and port, not the hostname |

The same log also shows the Actor's calls to the kagent control plane (`endpoint=kagent-controller.kagent.svc.cluster.local:8083`). To see only the provider traffic:

```bash
kubectl logs -n ate-system deploy/atenet-egress --since=5m | grep 'substrate.connect.authority' | grep -v kagent-controller
```

For comparison, the inbound side shows up in the router:

```bash
kubectl logs -n ate-system deploy/atenet-router --since=5m | tail -20
```

## Step 6: What the Agent is allowed to reach

`substrateEgress` only forwards to destinations in the Actor's egress policy. kagent builds that list from:

| Source | Destination |
| --- | --- |
| The Agent's ModelConfig | The provider endpoint (`https://api.anthropic.com:443`), plus its `baseUrl` override if one is set |
| Each RemoteMCPServer the Agent uses | The server's URL |
| kagent's runtime settings | The kagent control plane (`http://kagent-controller.kagent.svc.cluster.local:8083` in a Helm install) and any telemetry exporter endpoints. On requests to the control plane, the gateway puts an Actor JWT in the `authorization` header |
| Each `EgressPolicy` in the Agent's `spec.egressPolicyRefs` | The policy's `destinations` |

Anything else, such as an arbitrary website a tool tries to fetch, isn't on the list, and the gateway refuses it. Rules to know:

- A destination is an **origin**: scheme, DNS name, and port. IP-address destinations aren't supported.
- One origin and header can only carry one credential. Two ModelConfigs with different keys for the same origin and header are rejected. Different ports on the same host can use different credentials.

To let the Agent reach more, grant access with an `EgressPolicy` in the Agent's namespace. This CRD is new since kagent `1.0.0-alpha14`:

```bash
kubectl apply -f - <<EOF
apiVersion: api.kagent.dev/v1alpha3
kind: EgressPolicy
metadata:
  name: github-api
  namespace: kagent
spec:
  destinations:
  - origin: https://api.github.com
  - origin: https://*.githubusercontent.com
EOF

kubectl patch agents.api.kagent.dev assistant -n kagent --type merge \
  -p '{"spec":{"egressPolicyRefs":[{"name":"github-api"}]}}'
```

A wildcard replaces exactly one leftmost DNS label. A destination can also carry a credential: add `authentication` to an exact origin, with a `header`, an optional `prefix` such as `"Bearer "`, and a `secretKeyRef` to a Secret in the same namespace. Code in the Actor then sends `kagent-credential-injected` in that header, and the gateway swaps in the Secret's value.

Grants reach running and suspended Sessions without a restart or a new revision. The Agent reports them in its `EgressPoliciesApplied` condition, which is separate from `Ready`:

```bash
kubectl get agents.api.kagent.dev assistant -n kagent \
  -o jsonpath='{.status.conditions[?(@.type=="EgressPoliciesApplied")]}{"\n"}'
```

Reason `Applied` means every grant was admitted. `EgressPolicyNotFound`, `InvalidEgressPolicy`, and `EgressGrantConflict` mean some grants are held back. To remove the grant:

```bash
kubectl patch agents.api.kagent.dev assistant -n kagent --type json \
  -p '[{"op":"remove","path":"/spec/egressPolicyRefs"}]'
kubectl delete egresspolicies.api.kagent.dev github-api -n kagent
```

## Step 7: Rotate the key without restarting anything

The gateway fetches the credential when it needs it, so rotating the Secret doesn't recompile or restart the Agent. kagent's credential-injection design notes say the gateway's credential cache can take **up to five minutes** to pick up the new value.

```bash
export ANTHROPIC_API_KEY=<new-anthropic-api-key>

kubectl create secret generic kagent-anthropic -n kagent \
  --from-literal=ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY}" \
  --dry-run=client -o yaml | kubectl apply -f -
```

Until the cache refreshes, requests can still go out with the old key, so keep the old key valid for at least five minutes after you rotate.

## How this compares to the Platform Engineering track

| | Platform Engineering track | Substrate egress (this lab) |
| --- | --- | --- |
| Who deploys agentgateway | You (Helm, Gateway API) | Substrate (`atenet-egress` in `ate-system`) |
| Configured with | `Gateway`, `HTTPRoute`, `AgentgatewayBackend`, `AgentgatewayPolicy` | A static config file plus per-Actor decisions from the Substrate API, which kagent `EgressPolicy` objects extend |
| Where the API key lives | A Secret referenced by the gateway backend | A Secret referenced by the ModelConfig, injected per request |
| What can call it | Anything that reaches the Gateway address | Only Substrate Actors with a valid Actor identity |
| Best for | Prompt guards, rate limits, routing, model choice | Sandboxing what an Agent can reach and keeping keys out of it |

The two can be combined. Point a ModelConfig's `baseUrl` at your own agentgateway, **by DNS name** (for example `http://agentgateway-llama.agentgateway-system.svc.cluster.local:8080`), and the Actor's credential binding then targets that origin. For Anthropic and OpenAI, the provider's public endpoint also stays on the allow-list. That gives you `Actor → atenet-egress → your agentgateway → LLM`, with your prompt guards and rate limits in front of the provider. This combination hasn't been tested end to end.

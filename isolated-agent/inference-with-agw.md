# Agent Inference Through agentgateway (Substrate Egress)

In the Platform Engineering track, you put agentgateway in front of an LLM yourself: a Gateway, an `AgentgatewayBackend`, and an `HTTPRoute`. With kagent on Agent Substrate, an agentgateway is **already** in the path of every Agent. Every outbound HTTPS connection from an Actor goes through `atenet-egress`, an agentgateway instance that Substrate runs in `ate-system`.

This lab shows what that gateway does with an Agent's inference traffic:

1. Checks **which Actor** is calling before it opens any tunnel.
2. **Terminates TLS** with a CA that Substrate controls, so it can read and change the request.
3. **Injects the real API key.** The Agent itself only ever holds a placeholder.
4. Only lets the Agent reach the **destinations it was compiled with**.

```text
Actor (gVisor sandbox)                         atenet-egress (agentgateway, ate-system)
ANTHROPIC_API_KEY=kagent-credential-injected
        │  CONNECT api.anthropic.com:443           1. authenticate the Actor (actor-id CA) and
        └── mTLS ──────────────────────────────▶      resolve it through ate-api
                                                   2. terminate TLS with egress-mitm-ca-pool
                                                   3. substrateEgress policy: destination allowed?
                                                      fetch credential ──▶ k8s-credential-provider
                                                                             └─▶ Secret kagent/kagent-anthropic
                                                   4. forward with the real x-api-key
                                                                             ──▶ api.anthropic.com
```

> **Status:** Resource names, config, and flags in this lab come from the published `substrate` `0.5.0-alpha2` chart and the kagent `1.0.0-alpha14` source. The `curl` placeholder checks were run against the real OpenAI and Anthropic APIs. The full lab has **not** been run end to end on a cluster yet. The access-log step describes what to look for rather than an exact log line.

## Prerequisites

- [Install kagent and Agent Substrate](installation.md) with `kagent install` and the Anthropic provider.
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
agentgateway  cr.agentgateway.dev/agentgateway:v0.0.0-alpha.168b05d6@sha256:5e8384d1...
```

The inbound router, `atenet-router`, is also agentgateway. Traffic **into** an Actor (from the kagent controller) goes through the router, and traffic **out of** an Actor (to the LLM) goes through `atenet-egress`.

## Step 2: Read the gateway config

Unlike the Platform Engineering track, this agentgateway isn't configured with Gateway API resources. It reads a static config file from a ConfigMap, and the per-Actor decisions come from the Substrate API at request time:

```bash
kubectl get configmap atenet-egress-agentgateway-config -n ate-system \
  -o jsonpath='{.data.config\.yaml}'
```

The parts that matter (shortened):

```yaml
frontendPolicies:
  accessLog:
    add:
      substrate.connect.authority: source.connectHeaders["host"]   # log the destination host
  substrateEgressActorResolution:           # who is calling? Ask ate-api; fail closed
    host: api.ate-system.svc:443

binds:
- port: 8443
  tunnelProtocol: connect                   # Actors open HTTP CONNECT tunnels here
  listeners:
  - protocol: HTTPS
    tls:
      root: /run/actor-id-ca-certs/ca.crt   # only clients with an Actor identity cert get in
- mode: internal
  listeners:
  - protocol: HTTPS
    tls:
      mode: dynamicCa                       # mint a cert for each destination, signed by egress-mitm-ca-pool
      cert: /run/egress-mitm/tls.crt
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
```

The Actor trusts the `dynamicCa` certificates because kagent mounts the `egress-mitm.ate.dev` trust bundle into every Actor and points `SSL_CERT_FILE`, `REQUESTS_CA_BUNDLE`, `NODE_EXTRA_CA_CERTS`, `AWS_CA_BUNDLE`, `CURL_CA_BUNDLE`, and `GIT_SSL_CAINFO` at it.

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

1. Records an egress credential binding: for host `api.anthropic.com`, set header `x-api-key` from `ate-secret://k8s.io/default/kagent/kagent-anthropic/ANTHROPIC_API_KEY`.
2. Sets `ANTHROPIC_API_KEY=kagent-credential-injected` in the Actor. The SDK needs *some* value.
3. Stores the binding with the Agent's prepared revision. The Substrate API installs it before a Session becomes ready.

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

In terminal 1, look for access-log entries for this request. The gateway adds the CONNECT destination as `substrate.connect.authority`, so the Anthropic request should show `api.anthropic.com`. To cut the noise:

```bash
kubectl logs -n ate-system deploy/atenet-egress --since=5m | grep -i 'api.anthropic.com'
```

For comparison, the inbound side shows up in the router:

```bash
kubectl logs -n ate-system deploy/atenet-router --since=5m | tail -20
```

## Step 6: What the Agent is allowed to reach

`substrateEgress` only forwards to destinations listed in the Agent's compiled revision. kagent builds that list from:

| Source | Destination |
| --- | --- |
| The Agent's ModelConfig | The provider endpoint (`https://api.anthropic.com`), or its `baseUrl` override |
| Each RemoteMCPServer the Agent uses | The server's URL |
| kagent's runtime settings | The kagent control plane (`http://kagent-controller.kagent:8083`) and any telemetry exporter endpoints |

Anything else, such as an arbitrary website a tool tries to fetch, isn't on the list, and the gateway refuses it. Two rules to know:

- Destinations must be **DNS names**. IP-address destinations aren't supported by Substrate egress policies.
- One hostname can only use one credential. Two ModelConfigs with different keys for the same host are rejected at compile time.

## Step 7: Rotate the key without restarting anything

The gateway fetches the credential when it needs it, so rotating the Secret doesn't recompile or restart the Agent. The gateway's credential cache can take **up to five minutes** to pick up the new value.

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
| Configured with | `Gateway`, `HTTPRoute`, `AgentgatewayBackend`, `AgentgatewayPolicy` | A static config file plus per-Actor decisions from the Substrate API |
| Where the API key lives | A Secret referenced by the gateway backend | A Secret referenced by the ModelConfig, injected per request |
| What can call it | Anything that reaches the Gateway address | Only Substrate Actors with a valid Actor identity |
| Best for | Prompt guards, rate limits, routing, model choice | Sandboxing what an Agent can reach and keeping keys out of it |

The two can be combined. Point a ModelConfig's `baseUrl` at your own agentgateway, **by DNS name** (for example `http://agentgateway-llama.agentgateway-system.svc.cluster.local:8080`), and the Actor's egress allow-list and credential binding then target that host. That gives you `Actor → atenet-egress → your agentgateway → LLM`, with your prompt guards and rate limits in front of the provider. This combination hasn't been tested end to end.

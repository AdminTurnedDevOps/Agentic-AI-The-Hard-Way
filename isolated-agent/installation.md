The below installs both kagent and Agent Substrate.

### Substrate

```bash
helm upgrade --install substrate-crds \
  oci://ghcr.io/kagent-dev/substrate/helm/substrate-crds \
  --version 0.0.6 \
  --namespace ate-system --create-namespace --wait
```

```bash
helm upgrade --install substrate \
  oci://ghcr.io/kagent-dev/substrate/helm/substrate \
  --version 0.0.6 \
  --namespace ate-system --wait --timeout 10m
```

### Kagent

There are several providers that are readily available to use with kagent (OpenAI, Anthropic, Gemini, Azure OpenAI, and Ollama)

For the purposes of this install, you can use OpenAI, but feel free to switch (https://kagent.dev/docs/kagent/introduction/installation/#using-helm)

```bash
export OPENAI_API_KEY="your-api-key-here"

```bash
helm upgrade --install kagent-crds \
  oci://ghcr.io/kagent-dev/kagent/helm/kagent-crds \
  --version 0.9.9 \
  --namespace kagent --create-namespace --wait
```

```bash
helm upgrade --install kagent \
  oci://ghcr.io/kagent-dev/kagent/helm/kagent \
  --version 0.9.9 \
  --namespace kagent --timeout 10m --wait \
  --set providers.openAI.apiKey="${OPENAI_API_KEY}" \
  --set providers.default=openAI \
  --set controller.substrate.enabled=true \
  --set controller.substrate.ateApiEndpoint=dns:///api.ate-system.svc:443 \
  --set controller.substrate.ateApiInsecure=true \
  --set substrateWorkerPool.create=true \
  --set substrateWorkerPool.replicas=1 \
  --set substrateWorkerPool.ateomImage=ghcr.io/kagent-dev/substrate/ateom-gvisor:v0.0.6
```

## Worker Pools

Worker Pools are a set of pre-warmed, long-running  Pods managed to host Actors (AI agents or stateful tasks)

By default, there is one Worker Pool readily available. However, if you want to scale that up, you can.

```bash
--set substrateWorkerPool.replicas=3
```

Example:
```bash
helm upgrade kagent oci://ghcr.io/kagent-dev/kagent/helm/kagent \
  --version 0.9.9 --namespace kagent --reuse-values \
  --set substrateWorkerPool.replicas=3
```
The below installs both kagent and Agent Substrate.

### Kagent

There are several providers that are readily available to use with kagent (OpenAI, Anthropic, Gemini, Azure OpenAI, and Ollama)

For the purposes of this install, you can use OpenAI, but feel free to switch (https://kagent.dev/docs/kagent/introduction/installation/#using-helm)

```bash
export OPENAI_API_KEY="your-api-key-here"

helm install kagent-crds oci://ghcr.io/kagent-dev/kagent/helm/kagent-crds \
    --namespace kagent \
    --create-namespace

helm install kagent oci://ghcr.io/kagent-dev/kagent/helm/kagent \
    --namespace kagent \
    --set providers.default=openAI \
    --set providers.openAI.apiKey=$OPENAI_API_KEY
```


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
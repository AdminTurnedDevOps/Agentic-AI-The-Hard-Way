For the purposes of this lab and to switch things up a bit, instead of using a Llama Model, you'll use a GPT Model. If you don't have an OpenAI subscription, you can use another provider on the list [here](https://kagent.dev/docs/kagent/supported-providers) as the key point of switching it up is to see how SaaS based providers work.


```
export OPENAI_API_KEY=""
```

```
helm install kagent-crds oci://ghcr.io/kagent-dev/kagent/helm/kagent-crds \
    --namespace kagent \
    --create-namespace
```

```
helm upgrade --install kagent oci://ghcr.io/kagent-dev/kagent/helm/kagent \
    --namespace kagent \
    --set providers.default=openAI \
    --set ui.service.type=LoadBalancer \
    --set providers.openAI.apiKey=$OPENAI_API_KEY
```
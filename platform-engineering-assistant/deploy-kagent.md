# Installation

Below you will find the installation of kagent for both Anthropic and OpenAI as your first Model used (you can add more after installation)

## CLI

```
curl https://raw.githubusercontent.com/kagent-dev/kagent/refs/heads/main/scripts/get-kagent | bash
```

## Helm

### CRDs

```
helm install kagent-crds oci://ghcr.io/kagent-dev/kagent/helm/kagent-crds \
    --namespace kagent \
    --create-namespace
```

### With Anthropic
```
export ANTHROPIC_API_KEY=
```

The below contains the flag to give the kagent UI a public IP so you can reach it that way instead of doing a `port-forward`. However, if you're running kagent locally or don't want to create a load balancer, you can just remove the `--set ui.service.type=LoadBalancer` part of the installation below.
```
helm upgrade --install kagent oci://ghcr.io/kagent-dev/kagent/helm/kagent \
    --namespace kagent \
    --set providers.default=anthropic \
    --set providers.anthropic.apiKey=$ANTHROPIC_API_KEY \
    --set ui.service.type=LoadBalancer
```

### Dashboard Setup
1. With an LB
```
kubectl get svc -n kagent
```

2. Retrieve the public IP of the `kagent-ui` LB

Without an LB
```
kubectl port-forward svc/kagent-ui -n kagent 8080:8080
```

3. Access the kagent setup and create your own agent via the UI
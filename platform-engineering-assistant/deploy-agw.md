```
export GWAPI_VERSION=1.6.0
kubectl apply --server-side -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v$GWAPI_VERSION/standard-install.yaml
```

```
helm upgrade -i --create-namespace \
  --namespace agentgateway-system \
  --version v1.6.0 agentgateway-crds oci://cr.agentgateway.dev/charts/agentgateway-crds
```

```
helm upgrade -i -n agentgateway-system agentgateway oci://cr.agentgateway.dev/charts/agentgateway \
--version v1.6.0
```

Check the latest version of agw ![here](https://agentgateway.dev/docs/kubernetes/latest/documentation/install/helm/)
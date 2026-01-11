
1. Create env variable for Anthropic key

```
# This is just a placeholder because the OpenAI API spec needs a secret passed in, even if it isn't used

export ANTHROPIC_API_KEY="psuedosecret"
```

2. Create a Gateway for Llama

```
kubectl apply -f- <<EOF
kind: Gateway
apiVersion: gateway.networking.k8s.io/v1
metadata:
  name: agentgateway
  namespace: agentgateway-system
  labels:
    app: agentgateway
spec:
  gatewayClassName: agentgateway
  listeners:
  - protocol: HTTP
    port: 8080
    name: http
    allowedRoutes:
      namespaces:
        from: All
EOF
```

3. Capture the LB IP of the service. This will be used later to send a request to the LLM.
```
export INGRESS_GW_ADDRESS=$(kubectl get svc -n agentgateway-system agentgateway -o jsonpath="{.status.loadBalancer.ingress[0]['hostname','ip']}")
echo $INGRESS_GW_ADDRESS
```

4. Create a secret to store the Claude API key
```
kubectl apply -f- <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: anthropic-secret
  namespace: agentgateway-system
  labels:
    app: agentgateway
type: Opaque
stringData:
  Authorization: $ANTHROPIC_API_KEY
EOF
```

5. Create a `Backend` object 

A Backend resource to define a backing destination that you want kgateway to route to. In this case, it's Claude.
```
kubectl apply -f- <<EOF
apiVersion: agentgateway.dev/v1alpha1
kind: AgentgatewayBackend
metadata:
  labels:
    app: agentgateway
  name: llama-backend
  namespace: agentgateway-system
spec:
  ai:
    llm:
      hostOverride:
        host: http://ollama.ollama.svc.cluster.local
        port: 80
      provider:
        openai:
          model: "llama3.2"  # or whatever Llama model you have pulled in Ollama
  policies:
    auth:
      secretRef:
        # This is just a placeholder because the OpenAI API spec needs a secret passed in, even if it isn't used
        name: anthropic-secret
EOF
```

6. Ensure everything is running as expected
```
kubectl get agentgatewaybackend -n agentgateway-system
```

7. Apply the Route so you can reach the LLM
```
kubectl apply -f- <<EOF
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: llama
  namespace: agentgateway-system
  labels:
    app: agentgateway
spec:
  parentRefs:
    - name: agentgateway
      namespace: agentgateway-system
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: value: /ollama
    filters:
    - type: URLRewrite
      urlRewrite:
        path:
          type: ReplaceFullPath
          replaceFullPath: /v1/models
    backendRefs:
    - name: llama-backend
      namespace: agentgateway-system
      group: agentgateway.dev
      kind: AgentgatewayBackend
EOF
```

8. Test the LLM connectivity
```
curl "$INGRESS_GW_ADDRESS:8080/ollama" -v -H content-type:application/json -H x-api-key:$ANTHROPIC_API_KEY -H "anthropic-version: 2023-06-01" -d '{
  "messages": [
    {
      "role": "system",
      "content": "You are a skilled cloud-native network engineer."
    },
    {
      "role": "user",
      "content": "What is Istio Ambient Mesh??"
    }
  ]
}' | jq
```

## Model Config Update

```
kubectl apply -f - <<EOF
apiVersion: kagent.dev/v1alpha2
kind: ModelConfig
metadata:
  name: llama3-model-config
  namespace: kagent
spec:
  model: llama3
  provider: Ollama
  ollama:
    host: $INGRESS_GW_ADDRESS:8080
EOF
```
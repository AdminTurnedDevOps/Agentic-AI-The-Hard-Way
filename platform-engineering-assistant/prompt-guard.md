```
kubectl apply -f - <<EOF
apiVersion: agentgateway.dev/v1alpha1
kind: AgentgatewayPolicy
metadata:
  name: credit-guard-prompt-guard
  namespace: agentgateway-system
  labels:
    app: agentgateway
spec:
  targetRefs:
  - group: gateway.networking.k8s.io
    kind: HTTPRoute
    name: claude
  backend:
    ai:
      promptGuard:
        request:
        - response:
            message: "Rejected due to inappropriate content"
          regex:
            action: REJECT
            matches:
            - "credit card"
EOF
```

```
curl "$INGRESS_GW_ADDRESS:8080/anthropic" -v -H content-type:application/json -H x-api-key:$ANTHROPIC_API_KEY -H "anthropic-version: 2023-06-01" -d '{
  "messages": [
    {
      "role": "system",
      "content": "You are a skilled cloud-native network engineer."
    },
    {
      "role": "user",
      "content": "What is a credit card?"
    }
  ]
}' | jq
```
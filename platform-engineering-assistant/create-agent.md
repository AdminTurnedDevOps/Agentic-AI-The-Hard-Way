1. Create a Model Config
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
    host: http://ollama.ollama.svc.cluster.local:80
EOF
```


You should be able to see the Model connected
```
kubectl get modelconfig -n kagent
NAME                   PROVIDER    MODEL
default-model-config   Anthropic   claude-3-5-haiku-20241022
llama3-model-config    Ollama      llama3
```

2. Create an Agent with the Model config
```
kubectl apply -f - <<EOF
apiVersion: kagent.dev/v1alpha2
kind: Agent
metadata:
  name: pe-assistant
  namespace: kagent
spec:
  description: This agent can interact with GitHub repositories, issues, pull requests, and more
  type: Declarative
  declarative:
    modelConfig: llama3-model-config
    systemMessage: |-
      You're a friendly and helpful Platform Engineering assistant agent that uses various tools to help with deploying workloads, troubleshooting, and making recommendations for all things Platform Engineering

      # Instructions

      - If user question is unclear, ask for clarification before running any tools
      - Always be helpful and friendly
      - If you don't know how to answer the question DO NOT make things up
        respond with "Sorry, I don't know how to answer that" and ask the user to further clarify the question

      # Response format
      - ALWAYS format your response as Markdown
      - Your response will include a summary of actions you took and an explanation of the result
EOF
```

You can now use the Agent as it is routing through the k8s Ollama Service. However, the problem with this is there is zero security, guard rails, or observability implemented. That's why an AI Gateway is needed. In the upcoming sections, you'll see how to deploy agentgateway and route your Ollama traffic through agentgateway. That way, when you use an Agent in kagent with a Llama configuration, the traffic will be routed through a proper AI gateway.
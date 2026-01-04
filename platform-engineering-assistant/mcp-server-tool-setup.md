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
    tools:
    - mcpServer:
        apiGroup: kagent.dev
        kind: RemoteMCPServer
        name: kagent-tool-server
        toolNames:
        - k8s_check_service_connectivity
        - k8s_describe_resource
        - k8s_get_cluster_configuration
        - k8s_generate_resource
        - k8s_get_resources
        - k8s_scale
        - k8s_get_events
        - k8s_execute_command
        - k8s_delete_resource
        - k8s_create_resource
        - k8s_apply_manifest
EOF
```
The Agent is now deployed, but here's the problem - how does the Agent know to actually check the httpbin app? It needs a way to autonomously check it in an interval-like fashion. That's where something like a cronjob can be set up for Agent to check the applications health status in intervals so if its failing, the Agent can fix it.

Notice how the prompt/system message has the Agent go and check the state of the Pods running. The real goal of this CronJob is essentially to run a prompt every 60 seconds.

Deploy the below:

```
kubectl apply -f - <<EOF
apiVersion: batch/v1
kind: CronJob
metadata:
  name: health-check-trigger
  namespace: kagent
  labels:
    demo: self-healing
spec:
  schedule: "*/1 * * * *"  # Every minute
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
          - name: trigger
            image: curlimages/curl:8.12.1
            command:
            - /bin/sh
            - -c
            - |
              curl -s -X POST http://kagent-controller.kagent:8083/api/a2a/kagent/self-healing-agent/ \
                -H "Content-Type: application/json" \
                -d '{
                  "jsonrpc": "2.0",
                  "method": "message/send",
                  "params": {
                    "message": {
                      "messageId": "health-check-'$(date +%s)'",
                      "role": "user",
                      "parts": [{
                        "kind": "text",
                        "text": "Perform a health check on the demo namespace: 1) Check all httpbin pods are running and ready (should be 3 replicas) 2) Check recent pod events for any warnings or errors 3) If you find any issues like CrashLoopBackOff, OOMKilled, or 0 replicas, diagnose and fix them immediately 4) Report your findings and actions taken"
                      }]
                    }
                  },
                  "id": 1
                }'
EOF
```
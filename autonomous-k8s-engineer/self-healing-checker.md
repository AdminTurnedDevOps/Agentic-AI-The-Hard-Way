
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
            image: curlimages/curl:latest
            command:
            - /bin/sh
            - -c
            - |
              curl -s -X POST http://self-healing-agent:8080/ \
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
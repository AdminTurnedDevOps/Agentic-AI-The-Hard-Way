1. Open a terminal

2. Run the following command, which allows you to watch the logs in real-time

```
kubectl logs -f -n kagent -l app.kubernetes.io/name=self-healing-agent
```

3. Keep the terminal open and visibile as you'll see the autonomous self-healing Agent kick off.
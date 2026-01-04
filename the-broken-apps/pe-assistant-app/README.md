### Deploy the Application

```
kubectl apply -f k8s/
```

### Symptoms You Might Encounter:
- Pods failing to start or in CrashLoopBackOff
- Services unable to connect to pods
- Ingress routing not working
- Configuration mismatches
- Resource constraint violations

### Testing the Application

1. Port-forward to access the apps
```
Port-forward to test services directly
kubectl port-forward -n pe-assistant svc/frontend 8080:80
kubectl port-forward -n pe-assistant svc/backend 8081:3000
```

2. Add entry to `/etc/hosts` (if using local cluster)
```
echo "127.0.0.1 pe-assistant.local" | sudo tee -a /etc/hosts
```

3. Test the frontend
```
curl http://pe-assistant.local
```

4. Test the API through ingress
```
curl http://pe-assistant.local/api
```
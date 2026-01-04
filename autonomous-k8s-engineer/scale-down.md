1. Scale the Pods down to 0 on the `httpbin` app
```
kubectl scale deployment httpbin -n demo --replicas=0
```

The goal here is for the self-healing Agent to see this and fix it. The ReplicaSet Controller won't automatically scale the Pods back up because this command explicitly tells the Deployment object to scale them down, so it's seen as fine by the Controller.
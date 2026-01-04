1. Create a Namespace for a Llama Model config
```
kubectl create ns ollama
```

2. Deploy Ollama on your k8s cluster. This step could take a few minutes as the init container downloads the Llama3 Model.
```
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ollama
  namespace: ollama
spec:
  selector:
    matchLabels:
      name: ollama
  template:
    metadata:
      labels:
        name: ollama
    spec:
      initContainers:
      - name: model-puller
        image: ollama/ollama:latest
        command: ["/bin/sh", "-c"]
        args:
          - |
            ollama serve &
            sleep 10
            ollama pull llama3
            pkill ollama
        volumeMounts:
        - name: ollama-data
          mountPath: /root/.ollama
        resources:
          requests:
            memory: "8Gi"
          limits:
            memory: "12Gi"
      containers:
      - name: ollama
        image: ollama/ollama:latest
        ports:
        - name: http
          containerPort: 11434
          protocol: TCP
        volumeMounts:
        - name: ollama-data
          mountPath: /root/.ollama
        resources:
          requests:
            memory: "8Gi"
          limits:
            memory: "12Gi"
      volumes:
      - name: ollama-data
        emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: ollama
  namespace: ollama
spec:
  type: ClusterIP
  selector:
    name: ollama
  ports:
  - port: 80
    name: http
    targetPort: http
    protocol: TCP
EOF
```

3. Confirm that the Model was downloaded:
```
kubectl exec -n ollama deployment/ollama -- ollama list
```

You should see an output similar to the one below:
```
Defaulted container "ollama" out of: ollama, model-puller (init)
NAME             ID              SIZE      MODIFIED           
llama3:latest    365c0bd3c000    4.7 GB    About a minute ago
```

5. Ensure that everything was deployed as expected
```
kubectl get all -n ollama
```
The demo app below is a simple http-based app used to give you a lite configuration to work with when testing out the autonomous k8s agent workflow. Deploy the below:

```
kubectl apply -f - <<EOF
apiVersion: v1
kind: Namespace
metadata:
  name: demo
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: httpbin
  namespace: demo
  labels:
    app: httpbin
    demo: self-healing
spec:
  replicas: 3
  selector:
    matchLabels:
      app: httpbin
  template:
    metadata:
      labels:
        app: httpbin
        demo: self-healing
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "80"
    spec:
      containers:
        - name: httpbin
          image: kennethreitz/httpbin
          ports:
            - containerPort: 80
              name: http
          resources:
            requests:
              memory: "64Mi"
              cpu: "100m"
            limits:
              memory: "128Mi"
              cpu: "200m"
---
apiVersion: v1
kind: Service
metadata:
  name: httpbin
  namespace: demo
  labels:
    app: httpbin
    demo: self-healing
spec:
  selector:
    app: httpbin
  ports:
    - port: 80
      targetPort: 80
      name: http
  type: ClusterIP
---
apiVersion: v1
kind: Service
metadata:
  name: httpbin-nodeport
  namespace: demo
  labels:
    app: httpbin
    demo: self-healing
spec:
  selector:
    app: httpbin
  ports:
    - port: 80
      targetPort: 80
      nodePort: 30080
      name: http
  type: NodePort
EOF
```
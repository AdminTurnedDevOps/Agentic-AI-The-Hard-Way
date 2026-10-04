The below installs both kagent and Agent Substrate.

**please note**: ![Agent Substrate]() is a fast-moving project. Expect changes, upgrades, and object implementations that are net new.

## Install

For the installation, you'll install Agent Substrate and then kagent.

### Substrate

1. Install the Substrate CRDs
```
helm upgrade --install substrate-crds \
  oci://ghcr.io/kagent-dev/substrate/helm/substrate-crds \
  --version 0.3.0-alpha3 \
  --namespace ate-system --create-namespace
```

2. Install Substrate

```
helm upgrade --install substrate \
  oci://ghcr.io/kagent-dev/substrate/helm/substrate \
  --version 0.3.0-alpha3 \
  --namespace ate-system \
  -f - <<EOF
credentialProvider:
  namespacePolicies:
  - atespace: kagent
    allowedNamespaces: [kagent]
EOF
```

3. Create the CA pools that sign service DNS and Pod ID certs.

```
kubectl ate admin make-ca-pool --ca-id=1 \
  --name=service-dns-ca-pool \
  --secret-namespace=podcertificate-controller-system
kubectl ate admin make-ca-pool --ca-id=1 \
  --name=pod-identity-ca-pool \
  --secret-namespace=podcertificate-controller-system
```

4. Create Actor identity pools for verifying Actor creds.

```
kubectl ate admin make-jwt-pool --key-id=1 \
  --name=actor-id-jwt-pool \
  --secret-namespace=ate-system
kubectl ate admin make-ca-pool --ca-id=1 \
  --name=actor-id-ca-pool \
  --secret-namespace=ate-system
```

5. CA pool for egress Gateway

```
kubectl ate admin make-ca-pool --ca-id=1 \
  --name=egress-mitm-ca-pool \
  --secret-namespace=ate-system \
  --key-type=ECDSAP256
```

6. Capture the Actor identity root cert and store it in a secret for the Substrate API to read.

```
actor_id_ca_root="$(kubectl get secret actor-id-ca-pool -n ate-system \
  -o jsonpath='{.data.pool}' | base64 --decode \
  | jq -r '.CAs[0].RootCertificateDER' | base64 --decode \
  | openssl x509 -inform der -outform pem)"

kubectl create secret generic actor-id-ca-certs -n ate-system \
  --from-literal=ca.crt="${actor_id_ca_root}"
```

7. Create the auth config for the k8s Service Account tokens that are issued for the Substrate API audience.

```
k8s_issuer="$(kubectl get --raw /.well-known/openid-configuration | jq -r .issuer)"

kubectl create configmap ate-api-authentication -n ate-system \
  --from-literal=authentication.yaml="actorIdentityJWTProvider: kubernetes
jwtProviders:
- name: kubernetes
  issuer: ${k8s_issuer}
  audiences: [api.ate-system.svc]
  certificateAuthorityFile: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
  discoveryTokenFile: /var/run/secrets/kubernetes.io/serviceaccount/token
"
```

8. Role Substrate so the Pod mounts the identity.

```
helm upgrade substrate \
  oci://ghcr.io/kagent-dev/substrate/helm/substrate \
  --version 0.3.0-alpha3 \
  --namespace ate-system --reuse-values --wait --timeout 10m
```

### Kagent

1. Install kagent CRDs

```
helm upgrade --install kagent-crds \
  oci://ghcr.io/kagent-dev/kagent/helm/kagent-crds \
  --version 1.0.0-alpha7 \
  --namespace kagent --create-namespace --wait
```

2. Install kagent with Substrate enabled. Notice that the provider here is Anthropic, but you can change it to any of the [supported providers]()

```
helm upgrade --install kagent \
  oci://ghcr.io/kagent-dev/kagent/helm/kagent \
  --version 1.0.0-alpha7 \
  --namespace kagent --create-namespace --timeout 10m \
  -f - <<EOF
providers:
  default: Anthropic
  anthropic:
    apiKey: ${ANTHROPIC_API_KEY}
controller:
  grpc:
    reflection: true
  substrate:
    enabled: true
    ateApiEndpoint: dns:///api.ate-system.svc:443
    atenetRouterURL: http://atenet-router.ate-system.svc:80
substrateWorkerPool:
  create: true
  replicas: 1
  workerImage: "ghcr.io/kagent-dev/substrate/ateom-gvisor:v0.3.0-alpha3"
EOF
```


## Worker Pools

Worker Pools are a set of pre-warmed, long-running  Pods managed to host Actors (AI agents or stateful tasks)

By default, there is one Worker Pool readily available. However, if you want to scale that up, you can.

```bash
--set substrateWorkerPool.replicas=3
```

Example:
```bash
helm upgrade kagent oci://ghcr.io/kagent-dev/kagent/helm/kagent \
  --version 1.0.0-alpha7 --namespace kagent --reuse-values \
  --set substrateWorkerPool.replicas=3
```
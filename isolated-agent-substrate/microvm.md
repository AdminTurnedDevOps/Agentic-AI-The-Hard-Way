# Hardware Isolation with Micro-VMs

Every lab so far ran Actors in **gVisor**: a user-space kernel that intercepts the workload's system calls. That's *software* isolation, and it's a strong boundary. Substrate's second sandbox class, **`microvm`**, goes further: each Actor runs in its own **Kata guest on Cloud Hypervisor**, with its own guest kernel, behind the CPU's hardware virtualization (KVM). That's *hardware* isolation.

| | `gvisor` | `microvm` |
| --- | --- | --- |
| Boundary | User-space kernel (Sentry) intercepting syscalls | Separate guest kernel, enforced by KVM |
| Worker image | `ateom-gvisor` | `ateom-microvm` |
| Sandbox binaries (`SandboxConfig`) | `runsc` (`gvisor-default`, installed by default) | `cloud-hypervisor`, `virtiofsd`, `vmlinux`, `rootfs.img` (`microvm`, installed by this lab) |
| Node requirement | None beyond the install | `/dev/kvm` |
| Snapshot fidelities | `VOLUMES`, `MEMORY` | `VOLUMES`, `ROOTFS`, `MEMORY` |
| Durable volumes per template | 1 | Several |

`sandboxClass` is a **hard scheduling gate**. A snapshot taken in gVisor can't be restored in a micro-VM (or the other way round), so an Actor only ever lands on a WorkerPool of its template's class.

> **Status:** Commands checked against the Substrate **v0.5.0** source. Not yet run end to end on a cluster. **This lab needs a Linux host with KVM**; it won't run on macOS (Docker Desktop and Colima don't expose `/dev/kvm`).

## Prerequisites

- A **Linux** host with KVM. If the host is itself a VM, it needs **nested virtualization** (for example, a GCE VM with nested virtualization enabled, or a bare-metal machine). The host's architecture must match the assets (`amd64` or `arm64`).
- Docker can see the KVM device:

```bash
ls -l /dev/kvm
docker run --rm --device /dev/kvm busybox true && echo "KVM OK"
```

- [Install Agent Substrate (Standalone)](installation.md) **on that host**. `hack/create-kind-cluster.sh` only mounts `/dev/kvm` into the kind node if Docker could see it **when the cluster was created**. Its output says `/dev/kvm found: micro-VM (kata + cloud-hypervisor) support will be enabled`. If you created the cluster without KVM, create it again.

## Step 1: Install the micro-VM dependencies and the demo

`hack/run-microvm-demo-kind.sh` does the whole bring-up in one go:

1. Re-applies the control plane (`--deploy-ate-system`, idempotent).
2. Runs `hack/install-microvm-deps.sh --install`, which assembles the four guest assets for your architecture (Cloud Hypervisor from its release; `virtiofsd`, the kernel, and the guest rootfs from kata-static), uploads them to the RustFS bucket under `kata-assets/`, and applies the cluster-wide **`microvm` SandboxConfig** with every asset pinned by SHA-256.
3. Deploys the `counter-microvm` demo: a 2-worker `microvm` WorkerPool and a `counter-microvm` template.

The control-plane step needs the same credential-provider setting as the original install, so pass it through the environment:

```bash
export KIND_CLUSTER_NAME=substrate
export ATE_CREDENTIAL_PROVIDER='{"name":"k8s.io"}'

hack/run-microvm-demo-kind.sh
```

## Step 2: Look at what was added

The new SandboxConfig holds the micro-VM runtime, as one versioned asset set:

```bash
kubectl get sandboxconfig
kubectl get sandboxconfig microvm -o yaml
```

Look for `sandboxClass: microvm`, `defaultVersion: v1`, and the four assets (`cloud-hypervisor`, `virtiofsd`, `vmlinux`, `rootfs.img`), each with a `sha256`. Workers fetch these at runtime; nothing Kata-specific is baked into the worker image.

The WorkerPool selects the class and that config:

```bash
kubectl get workerpool counter-microvm -n ate-demo-counter-microvm -o yaml
kubectl get pods -n ate-demo-counter-microvm
```

```yaml
spec:
  replicas: 2
  workerImage: <registry>/ateom-microvm…
  sandboxClasses:
  - name: microvm
    configRef:
      name: microvm
```

The template asks for the class explicitly:

```bash
kubectl ate get actor-templates -A
kubectl ate get actor-template counter-microvm -a ate-demo-counter-microvm -o yaml
```

`SANDBOX CLASS` reads `microvm` for `counter-microvm` and `gvisor` for `counter`. The template's `resources.limits` (1 CPU, 512 Mi) size the guest: they become Cloud Hypervisor's vCPU count and the guest's RAM, minus a reserve for the VMM.

## Step 3: Run the counter in a micro-VM

```bash
kubectl ate create actor vm-1 -a ate-demo-counter-microvm --template counter-microvm
```

```bash
kubectl port-forward -n ate-system svc/atenet-router 8000:80
```

```bash
for i in 1 2 3; do
  curl -s -X POST -H "ate-target-actor: ate-demo-counter-microvm/vm-1" http://localhost:8000
done
```

The first request boots a guest by restoring the template's golden snapshot. The template allows the wakeup probe 120 seconds, more than gVisor's default 30, because a guest can take longer under load. After that, the counters climb exactly as in gVisor.

## Step 4: Suspend and resume guest memory

```bash
kubectl ate get actor vm-1 -a ate-demo-counter-microvm
kubectl ate suspend actor vm-1 -a ate-demo-counter-microvm
curl -s -X POST -H "ate-target-actor: ate-demo-counter-microvm/vm-1" http://localhost:8000
kubectl ate get actor vm-1 -a ate-demo-counter-microvm
```

The memory count continues at `4`. With `SNAPSHOT_FIDELITY_MEMORY`, the suspend captured the **guest's RAM**, and the resume restored it, possibly into a different worker Pod. That's the same suspend/resume contract as gVisor, behind a hardware boundary.

The **template**, not the atespace, decides the class. An atespace can hold gVisor and micro-VM Actors side by side, and each one only ever lands on a pool of its own template's class.

## Using micro-VMs on GKE

The same bring-up works on GKE with `hack/run-microvm-demo.sh`, reading `.ate-dev-env.sh` and uploading the assets to GCS. The nodes that run micro-VM workers need nested virtualization. Follow the "Micro-VM variant" section of `demos/counter/README.md` at `v0.5.0`.

## Clean up

```bash
kubectl ate delete actor vm-1 -a ate-demo-counter-microvm --any-state
hack/install-ate-kind.sh --delete-demo-counter-microvm
NO_DEV_ENV=true KUBECTL_CONTEXT=kind-substrate hack/install-microvm-deps.sh --delete
```

`--delete` removes the `microvm` SandboxConfig. It leaves the config in place while any WorkerPool still uses it, and it leaves the assets in the bucket.

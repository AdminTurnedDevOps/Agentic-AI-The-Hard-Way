# Hardware Isolation with Micro-VMs

Every lab so far ran Actors in **gVisor**: a user-space kernel that intercepts the workload's system calls. That's *software* isolation, and it's a strong boundary. Substrate's second sandbox class, **`microvm`**, goes further: each Actor runs in its own **Kata guest on Cloud Hypervisor**, with its own guest kernel, behind the CPU's hardware virtualization (KVM). That's *hardware* isolation.

| | `gvisor` | `microvm` |
| --- | --- | --- |
| Boundary | User-space kernel (Sentry) intercepting syscalls | Separate guest kernel, enforced by KVM |
| Worker image | `ateworker-gvisor` | `ateworker-microvm` |
| Sandbox binaries (`SandboxConfig`) | `runsc` (`gvisor-default`) | `cloud-hypervisor`, `virtiofsd`, `kata-kernel`, `kata-image` (`microvm`) |
| Node requirement | None beyond the install | `/dev/kvm`, requested as the `ate.dev/kvm` device |
| CPUs the Actor sees | `ceil(cpuMillicores / 1000)`, at least 2 | `ceil(cpuMillicores / 1000)` vCPUs, at least 1 |
| Minimum `memoryBytes` | None | 128 MiB |
| Memory booked per Actor | `memoryBytes` | `memoryBytes` + 4 MiB + 8 MiB per GiB of guest RAM (the VMM and `virtiofsd`) |
| Per-container limits | Accepted, ignored | Enforced through guest cgroups |

**The WorkerPool decides the sandbox class** (`spec.sandboxClasses[].name`). An ActorTemplate has no class field: it picks pools through `workerSelector`. An Actor's first snapshot records the class, and every later restore runs on a worker of that class, because a gVisor snapshot can't be restored in a micro-VM (or the other way round).

> **Status:** Commands checked against the Substrate **v1.0.0** source. Not yet run end to end on a cluster. **This lab needs KVM.** Docker Desktop and Colima on macOS don't expose `/dev/kvm`. See the prerequisites for the options.

## Prerequisites

- A Docker environment with KVM, either:
  - a **Linux** host with KVM. If the host is itself a VM, it needs **nested virtualization** (for example, a GCE VM with nested virtualization enabled, or a bare-metal machine).
  - an **Apple Silicon M3 or later** Mac running Lima with nested virtualization. Follow "Option B" in `docs/dev/microvm-local.md` in the Substrate repo. M1 and M2 can't do nested virtualization.
- Docker can see the KVM device:

```bash
docker run --rm --device /dev/kvm busybox true && echo "KVM OK"
```

- [Install Agent Substrate (Standalone)](installation.md) **in that Docker environment**. `hack/create-kind-cluster.sh` only mounts `/dev/kvm` into the kind node if Docker could see it **when the cluster was created**. Its output says `/dev/kvm found: micro-VM (kata + cloud-hypervisor) support will be enabled.` If you created the cluster without KVM, create it again.
- The lab router client and the `ate_curl` function from [installation Step 5](installation.md#step-5-create-the-lab-router-client), defined in this shell.

## Step 1: Check the micro-VM runtime

`deploy ate-system` already set up the micro-VM class, unless you passed `--sandbox-classes=gvisor`. It downloaded the Kata and Cloud Hypervisor release assets for your architecture, staged them in the RustFS bucket under `microvm-assets/<arch>/<sha256>`, and applied the cluster-wide **`microvm` SandboxConfig** with every asset pinned by SHA-256:

```bash
kubectl get sandboxconfig
```

If `microvm` is missing, add it. Keep `ATE_INSTALL_KIND=true` and `KIND_CLUSTER_NAME` exported:

```bash
go run ./cmd/ate-setup deploy sandboxconfig --sandbox-classes=gvisor,microvm
```

Look at what it pins:

```bash
kubectl get sandboxconfig microvm -o yaml
```

Look for `sandboxClass: microvm`, the `sandboxconfig.ate.dev/is-class-default: "true"` annotation, `defaultVersion`, and the four assets per architecture (`cloud-hypervisor`, `virtiofsd`, `kata-kernel`, `kata-image`), each with a `url` and a `sha256`. Workers fetch these at runtime; nothing Kata-specific is baked into the worker image.

Check that the kind node can host micro-VM workers. atelet advertises the `ate.dev/kvm` device only on nodes that have `/dev/kvm`:

```bash
kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.capacity.ate\.dev/kvm}{"\n"}{end}'
```

An empty value means no KVM, and micro-VM worker Pods stay `Pending`.

## Step 2: Deploy the micro-VM counter

```bash
go run ./cmd/ate-setup deploy demo counter-microvm
```

The installer builds the counter image with ko, then creates:

- the `ate-demo-counter-microvm` namespace and a **2-worker** `microvm` WorkerPool, `counter-microvm`
- the `ate-demo-counter-microvm` atespace and the `counter-microvm` template

It waits for the template's golden snapshot, which is a full guest boot plus a checkpoint.

Look at the pool:

```bash
kubectl get workerpool counter-microvm -n ate-demo-counter-microvm -o yaml
kubectl get pods -n ate-demo-counter-microvm
```

```yaml
spec:
  replicas: 2
  workerImage: <registry>/ateworker-microvm…
  sandboxClasses:
  - name: microvm
    configRef:
      name: microvm
  template:
    resources:
      limits:
        cpu: "1"
        memory: 1Gi
```

`configRef` names the `microvm` SandboxConfig explicitly. Without it, the pool would use the class default, which is the same config here. The worker Pods request the `ate.dev/kvm` device, so they only land on KVM nodes.

```bash
kubectl ate get workers --sandbox-class microvm
```

Each worker reports `CPU(MILLICORES)` `0/1000` and `MEMORY` `0/960Mi`: like a gVisor worker, a micro-VM worker keeps 64 MiB of its limit for itself.

Now the template:

```bash
kubectl ate get actor-templates -a ate-demo-counter-microvm
kubectl ate get actor-template counter-microvm -a ate-demo-counter-microvm -o yaml
```

It looks like the gVisor counter template, with three differences:

- `workerSelector` matches `workload: counter-microvm`, the micro-VM pool. That's what makes it a micro-VM template.
- The wakeup probe allows 120 seconds instead of the default 30, because a guest can take longer to come up under load.
- `resources.limits` (`cpuMillicores: 1000`, `memoryBytes: 536870912`) size the **guest**: 1 vCPU and 512 MiB of guest RAM.

## Step 3: Run the counter in a micro-VM

```bash
kubectl ate create actor vm-1 -a ate-demo-counter-microvm --template counter-microvm

for i in 1 2 3; do
  ate_curl ate-demo-counter-microvm/vm-1 -X POST
done
```

The first request boots a guest by restoring the template's golden snapshot. After that, the counters climb exactly as in gVisor:

```text
preserved memory count: 3 | preserved file counter: 3 | preserved rootfs counter: 3
```

```bash
kubectl ate get workers --sandbox-class microvm
```

The worker running `vm-1` shows `MEMORY` `520Mi/960Mi`. The guest's 512 MiB is booked, **plus** 8 MiB for the Actor's Cloud Hypervisor and `virtiofsd` processes (4 MiB, plus 8 MiB per GiB of guest RAM), which run outside the guest but in the worker Pod. gVisor has no such overhead: its Sentry is charged to the Actor's own limit.

## Step 4: Suspend and resume guest memory

```bash
kubectl ate get actor vm-1 -a ate-demo-counter-microvm
kubectl ate suspend actor vm-1 -a ate-demo-counter-microvm
kubectl ate get actor vm-1 -a ate-demo-counter-microvm

ate_curl ate-demo-counter-microvm/vm-1 -X POST
kubectl ate get actor vm-1 -a ate-demo-counter-microvm
```

The memory count continues at `4`. With `SNAPSHOT_FIDELITY_MEMORY`, the suspend captured the **guest's RAM**, and the resume restored it, possibly into the other worker Pod (compare `WORKER POD` before and after). That's the same suspend and resume contract as gVisor, behind a hardware boundary.

The durable volume and the rootfs changes are kept differently: in a micro-VM they live on the host and are shared into the guest over virtio-fs, and the snapshot stores them as tar archives.

An atespace can hold gVisor and micro-VM Actors side by side. Each template's `workerSelector` decides which pools its Actors can use, and each Actor's snapshot keeps it on its class.

## Using micro-VMs on GKE

On GKE, `deploy ate-system` stages the assets for both `amd64` and `arm64` to the `${BUCKET_NAME}-assets` bucket, and the nodes that run micro-VM workers need nested virtualization. See [MicroVM on Agent Substrate (GKE)](https://github.com/AdminTurnedDevOps/agentic-demo-repo/blob/main/substrate/microvm/microvm-substrate-imp.md).

## Clean up

```bash
kubectl ate delete actor vm-1 -a ate-demo-counter-microvm
go run ./cmd/ate-setup delete demo counter-microvm
```

The `microvm` SandboxConfig and its staged assets stay. They're part of the install, and `go run ./cmd/ate-setup delete all` removes them with the rest.

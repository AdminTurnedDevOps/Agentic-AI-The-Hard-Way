The interactive map below shows every component in this list, numbered to match. Press **Play** to watch a request wake an Actor, its state go to a snapshot, and the Actor resume on a different worker. Click any component on the map to read what it does. The map runs on [agenticfieldguide.ai](https://agenticfieldguide.ai/isolated-agent-substrate/components/); GitHub shows only this text.

<link rel="stylesheet" href="/diagrams/substrate/diagram.css">
<div id="substrate-diagram" data-pagefind-ignore></div>
<script type="module" src="/diagrams/substrate/diagram.js"></script>

1. Ate-api-server: The control plane. It owns each Actor's lifecycle (create, suspend, resume), places Actors onto Workers, and coordinates snapshots, all backed by the state store. It checks every request against an OpenFGA authorization model.

2. atenet/atenet-router: atenet is the networking binary. atenet-router is its ingress piece: it reads the ate-target-actor: <atespace>/<actor> header, asks the control plane to resume that Actor if it's suspended, and opens an mTLS tunnel to the right worker pod. It can use agentgateway or Envoy as the proxy you can choose from to carry the actual traffic for both ingress router and egress gateway.

3. atunnel: A networking service built into ateworker inside each Worker Pod. It receives tunneled traffic from the router and passes it to the Actor, and it sends all of the Actor's outbound TCP to the egress gateway, which enforces policy.

4. Workers (Pods): Kubernetes Pods started ahead of time that wait, sandbox ready, to be assigned Actors. A Worker can host several Actors at once, and the control plane tracks each one as a record.
  4a: microVM for hardware-isolation or gVisor for software-isolation. Every Actor runs in one of them.

5. WorkerPools (pool of Workers): A Kubernetes CRD that declares a group of warm worker pods. ate-controller turns each one into a Deployment.

6. Actors: One running instance of an ActorTemplate (an agent, for example), named by (atespace, name). It's the unit that gets suspended and resumed, and it can land on a different Worker each time it resumes.

7. ActorTemplate: The fixed definition of a kind of Actor: its image, config and snapshot settings. It's created through the Substrate API (kubectl ate create actor-template) and stored in Postgres, not in Etcd.

8. atelet (node supervisor): A DaemonSet that runs on every node. It pulls images, prepares the container bundles, drives the sandbox lifecycle through ateworker, and moves snapshots to and from object storage.

9. ate-controller: The Kubernetes controller that reconciles Substrate's CRDs, for example turning a WorkerPool into a Deployment. It handles the slow-changing infrastructure, not per-Actor operations.

10. State Store (Postgres): The database that holds the fast-changing records (Actors, Workers, atespaces, ActorTemplates). These change too often to keep in Etcd and the Kubernetes API, which is why the ate-apiserver was created (far more performant for these objects that change quite quickly).

11. Golden snapshots: A full memory snapshot taken once, when an ActorTemplate is created, by booting the workload temporarily. New Actors from that template start by restoring it instead of cold-booting.

12. CLI (kubectl-ate): A kubectl plugin that talks to ate-api-server to manage Actors, ActorTemplates, atespaces and access policies, and to list Workers.
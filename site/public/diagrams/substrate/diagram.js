/* Agent Substrate components diagram.
 * Renders into <div id="substrate-diagram"></div>. Served as a file so it satisfies the site's
 * CSP (script-src 'self'); it sets styles only through the CSSOM, never inline style attributes. */
(function () {
  "use strict";
  var root = document.getElementById('substrate-diagram');
  if (!root) return;

  root.innerHTML =
    '<div class="sd-head"><span class="t">Agent Substrate components, in motion</span><span class="sd-clock" id="sd-clock"></span></div>' +
    '<div class="controls" role="group" aria-label="Playback">' +
      '<button class="btn" id="sd-prev" type="button" title="Previous scene">Prev</button>' +
      '<button class="btn play" id="sd-play" type="button" title="Play or pause">Play</button>' +
      '<button class="btn" id="sd-next" type="button" title="Next scene">Next</button>' +
      '<div class="seg" id="sd-speed" role="group" aria-label="Speed"><button type="button" data-v="0.5">0.5×</button><button type="button" data-v="1">1×</button><button type="button" data-v="2">2×</button></div>' +
      '<label class="auto" for="sd-autoadv"><input type="checkbox" id="sd-autoadv" checked> auto-advance</label>' +
      '<button class="btn" id="sd-fs" type="button">full screen</button>' +
    '</div>' +
    '<nav class="rail" id="sd-rail" aria-label="Scenes"></nav>' +
    '<div class="legend" aria-label="Legend">' +
      '<span><i></i>runtime path</span><span><i class="dash"></i>provisioning</span><span><i class="snap"></i>snapshot data</span>' +
      '<span><i class="egr"></i>egress</span><span><i class="deny"></i>denied</span><span><i class="num">7</i>number in the list below</span>' +
    '</div>' +
    '<div class="sd-body">' +
      '<div class="sd-main"><div class="stage" id="sd-stage"><div id="sd-canvas">' +
        '<svg id="sd-wires" class="layer" viewBox="0 0 1320 1010"></svg><svg id="sd-packets" class="layer" viewBox="0 0 1320 1010"></svg>' +
      '</div></div></div>' +
      '<aside class="side">' +
        '<section class="card" aria-live="polite"><div class="eyebrow" id="sd-n-eyebrow"></div><h2 id="sd-n-title"></h2><p id="sd-n-text"></p>' +
          '<div class="watch"><span class="eye">watch</span><span id="sd-n-watch"></span></div><pre class="shell" id="sd-n-cmd"></pre>' +
          '<div class="done-banner" id="sd-banner" hidden></div></section>' +
        '<section class="card comp" id="sd-comp" aria-live="polite"></section>' +
        '<section class="card"><div class="eyebrow">• what\'s happening</div><ul class="feed" id="sd-feed"></ul></section>' +
      '</aside>' +
    '</div>';

  var $ = function (s) { return root.querySelector(s); };
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function place(e, o) { e.style.left = o.x + 'px'; e.style.top = o.y + 'px'; e.style.width = o.w + 'px'; e.style.height = o.h + 'px'; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  var I = {
    term: '<path d="M4 17l6-6-6-6"/><path d="M12 19h8"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 010 18a14 14 0 010-18"/>',
    cloud: '<path d="M7 18h10a4 4 0 000-8 6 6 0 00-11.6 1.5A3.5 3.5 0 007 18z"/>',
    route: '<circle cx="5" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="12" r="2"/><path d="M7 6h3a4 4 0 014 4v2h3M7 18h3a4 4 0 004-4"/>',
    server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
    db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    sync: '<path d="M20 11a8 8 0 00-14.9-3"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0014.9 3"/><path d="M20 20v-4h-4"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
    file: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/>',
    cube: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M4 7.5l8 4.5 8-4.5"/><path d="M12 12v9"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
    k8s: '<path d="M12 2l8.5 4.5v11L12 22l-8.5-4.5v-11L12 2z"/><circle cx="12" cy="12" r="3"/>'
  };
  function icon(n) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + I[n] + '</svg>'; }

  /* ================= components (numbers match components.md) ================= */
  var COMP = {
    1: { name: 'ate-api-server', where: 'ate-system · svc/api :443',
      p: 'The control plane. It owns every Actor\'s lifecycle (create, resume, suspend, delete), places Actors onto Workers, and coordinates snapshots, all backed by the state store. In v0.5.0 it authenticates callers with mTLS certificates and JWTs; authorization through an embedded OpenFGA model is still being integrated.',
      kv: [['Talks to', 'Postgres · atelet · router'], ['Clients', 'kubectl ate · atenet-router'], ['Stores', 'nothing in etcd']],
      sh: 'kubectl ate get actors -A\nkubectl ate get workers' },
    2: { name: 'atenet-router and atenet-egress', where: 'ate-system',
      p: 'atenet is the networking stack. The router is the way in: it reads the <code>ate-target-actor: &lt;atespace&gt;/&lt;actor&gt;</code> header, asks the control plane to resume the Actor if it\'s suspended (parking the request while no worker is free), and opens an mTLS tunnel to the right worker. The egress gateway is the way out: every Actor connection arrives through atunnel and is checked against the Actor\'s egress policy. Either dataplane, Envoy (default) or agentgateway, carries the traffic.',
      kv: [['Router', 'svc/atenet-router :80'], ['Parking', '5s budget · 1024 max'], ['Egress', 'deny by default · injects keys']],
      sh: 'kubectl port-forward -n ate-system svc/atenet-router 8000:80\ncurl -X POST -H "ate-target-actor: team-a/counter-1" http://localhost:8000' },
    3: { name: 'atunnel', where: 'inside every worker (ateom)',
      p: 'A networking service built into ateom in every worker Pod. It receives the tunneled traffic from the router and hands it to the right Actor, and it carries all of the Actor\'s outbound TCP to the egress gateway, which enforces policy. Actors get a private network namespace and can\'t reach each other directly.',
      kv: [['Inbound', 'router → atunnel → Actor'], ['Outbound', 'Actor → atunnel → atenet-egress']],
      sh: 'kubectl ate get egress-policy counter-1 -a team-a -o yaml' },
    4: { name: 'Workers (Pods)', where: 'the WorkerPool\'s namespace',
      p: 'Kubernetes Pods started ahead of time that wait, sandbox ready, for Actors. Since v0.5.0 a worker hosts several Actors at once, each in its own sandbox, until its CPU and memory limits (or its actor limit, 1000) run out. ateom drives the sandbox; it was renamed ateworker after v0.5.0.',
      kv: [['Capacity', 'WorkerPool limits (cpu · memory)'], ['Actor limit', '1000 (--max-actors)'], ['Reported by', 'ateom, at startup']],
      sh: 'kubectl ate get workers\nkubectl ate top worker' },
    '4a': { name: 'Sandbox: gVisor or micro-VM', where: 'one per Actor',
      p: 'Every Actor runs in its own sandbox. gVisor gives software isolation: a user-space kernel intercepts the workload\'s system calls. A micro-VM gives hardware isolation: a Kata guest with its own kernel on Cloud Hypervisor, enforced by KVM. The WorkerPool picks the class, and snapshots can\'t move between classes.',
      kv: [['gvisor', 'runsc · default'], ['microvm', 'Kata + Cloud Hypervisor · needs /dev/kvm'], ['Sizing', 'template resources.limits']],
      sh: 'kubectl get sandboxconfig' },
    5: { name: 'WorkerPool', where: 'Kubernetes CRD (ate.dev/v1alpha1)',
      p: 'Declares a group of warm worker Pods. ate-controller turns each WorkerPool into a Deployment. Its <code>spec.template.resources.limits</code> become each worker\'s capacity, and it has a <code>scale</code> subresource, so an HPA can grow it.',
      kv: [['Kind', 'Kubernetes CRD'], ['Becomes', 'a Deployment'], ['Picks', 'sandbox class']],
      sh: 'kubectl get workerpool -A\nkubectl scale workerpool agents -n ate-demo --replicas=3' },
    6: { name: 'Actors', where: 'records in Postgres, addressed (atespace, name)',
      p: 'One running instance of an ActorTemplate (an agent, for example), named by (atespace, name), so the same name can exist in two atespaces. It\'s the unit that gets suspended and resumed, and it can land on a different worker every time it resumes.',
      kv: [['States', 'SUSPENDED · RESUMING · RUNNING · SUSPENDING'], ['Address', 'ate-target-actor header']],
      sh: 'kubectl ate create actor counter-1 -a team-a --template counter\nkubectl ate get actors -a team-a' },
    7: { name: 'ActorTemplate', where: 'Substrate API · stored in Postgres',
      p: 'The fixed definition of a kind of Actor: its image, resource limits, and snapshot settings. It\'s created through the Substrate API, not as a Kubernetes CRD, and stored in Postgres, not etcd. Templates are immutable; a new version is a new template. Creating one builds its golden snapshot.',
      kv: [['Created with', 'kubectl ate create actor-template'], ['Lives in', 'an atespace'], ['Builds', 'a golden snapshot']],
      sh: 'kubectl ate create actor-template -f counter.yaml\nkubectl ate get actor-templates -a team-a' },
    8: { name: 'atelet', where: 'DaemonSet (ate-system) · every node',
      p: 'The node supervisor. It pulls images, prepares the container bundles, drives the sandbox lifecycle through ateom, and moves snapshots to and from object storage.',
      kv: [['Runs', 'one Pod per node'], ['Moves', 'snapshots ⇄ object storage'], ['Drives', 'ateom on each worker']],
      sh: 'kubectl get daemonset atelet -n ate-system' },
    9: { name: 'ate-controller', where: 'ate-system',
      p: 'The Kubernetes controller that reconciles Substrate\'s CRDs, for example turning a WorkerPool into a Deployment. It handles slow-changing infrastructure, never per-Actor operations.',
      kv: [['Watches', 'WorkerPool · SandboxConfig'], ['Creates', 'Deployments']],
      sh: 'kubectl get deployment -n ate-demo' },
    10: { name: 'State store (PostgreSQL)', where: 'ate-system',
      p: 'Holds the fast-changing records: atespaces, ActorTemplates, Actors, and Workers. They change too often for etcd and the Kubernetes API, which is why Substrate has its own API server in front of a database.',
      kv: [['Holds', 'atespaces · templates · actors · workers'], ['Not in', 'etcd']],
      sh: 'kubectl get statefulset postgres -n ate-system' },
    11: { name: 'Golden snapshots (object storage)', where: 'GCS · S3 · RustFS on kind',
      p: 'A full memory snapshot taken once, when an ActorTemplate is created, by booting the workload temporarily. New Actors from that template restore from it instead of cold-booting. Every Actor\'s own snapshots land in the same storage when it\'s suspended, under its atespace.',
      kv: [['Golden', 'once per template'], ['Per Actor', 'on every suspend'], ['Layout', '…/atespaces/<atespace>/actors/<uid>/…']],
      sh: 'kubectl ate get actor-template counter -a team-a -o yaml' },
    12: { name: 'kubectl-ate (CLI)', where: 'your terminal',
      p: 'A kubectl plugin that talks to ate-api-server to manage Actors, ActorTemplates, atespaces, and egress policies, and to list Workers. It port-forwards svc/api for you.',
      kv: [['Install', 'go install ./cmd/kubectl-ate'], ['Talks to', 'ate-api-server']],
      sh: 'kubectl ate --help' },
    client: { name: 'Client', where: 'outside the cluster',
      p: 'Anything that calls an Actor: curl, an app, another agent. It talks HTTP to the router and names the Actor in the <code>ate-target-actor</code> header. It never needs to know which worker the Actor is on, or whether it\'s awake.',
      kv: [['Header', 'ate-target-actor: <atespace>/<actor>']], sh: 'curl -X POST -H "ate-target-actor: team-a/counter-1" http://localhost:8000' },
    internet: { name: 'External API', where: 'the internet',
      p: 'Where an Actor\'s outbound calls go, for example an LLM API. An Actor only reaches the destinations its egress policy allows; everything else is refused at the egress gateway, and its DNS lookups are answered REFUSED.',
      kv: [['Default', 'deny'], ['Allowed by', 'kubectl ate create egress-policy']], sh: 'kubectl ate create egress-policy counter-1 -a team-a -f policy.yaml' },
    k8s: { name: 'Kubernetes API (etcd)', where: 'the cluster',
      p: 'Holds the slow-changing infrastructure: WorkerPool and SandboxConfig CRDs, and the Deployments and Pods ate-controller creates from them. Actors and templates are deliberately not here.',
      kv: [['CRDs', 'workerpools · sandboxconfigs · csidriverconfigs'], ['Not here', 'actortemplates · actors']], sh: 'kubectl get crd | grep ate.dev' }
  };

  /* ================= layout (1320 × 1010) ================= */
  var frames = [
    { id: 'f-net', cls: 'ext', x: 20, y: 14, w: 230, h: 136, label: 'internet · external', lx: 16 },
    { id: 'f-op', cls: 'ext', x: 270, y: 14, w: 500, h: 136, label: 'your terminal', lx: 16 },
    { id: 'f-bucket', cls: 'ext', x: 1100, y: 590, w: 210, h: 136, label: 'object storage · external', lx: 14 },
    { id: 'f-cluster', cls: 'cluster', x: 10, y: 186, w: 1070, h: 818, label: 'kubernetes cluster', lx: 700 },
    { id: 'f-sys', cls: 'ns', x: 30, y: 226, w: 760, h: 314, label: 'namespace · ate-system', lx: 470 },
    { id: 'f-nodes', cls: 'nodes', x: 30, y: 566, w: 1040, h: 428, label: 'worker nodes', lx: 200 },
    { id: 'f-poolA', cls: 'group', x: 40, y: 712, w: 690, h: 270, label: 'WorkerPool agents · gvisor', lx: 250, c: 5 },
    { id: 'f-poolB', cls: 'group', x: 744, y: 712, w: 316, h: 270, label: 'WorkerPool vms · microvm', lx: 16, c: 5 }
  ];
  var nodes = [
    { id: 'internet', x: 40, y: 38, w: 190, h: 96, icon: 'globe', t: 'external API', s: 'api.anthropic.com', chips: ['egress allow-list'], c: 'internet' },
    { id: 'client', x: 290, y: 38, w: 220, h: 96, icon: 'user', t: 'client', s: 'curl · an app · an agent', chips: ['ate-target-actor'], c: 'client' },
    { id: 'kubectl', x: 530, y: 38, w: 220, h: 96, icon: 'term', t: 'kubectl ate', s: 'CLI plugin', chips: ['actors', 'templates'], c: 12 },
    { id: 'bucket', x: 1110, y: 614, w: 190, h: 96, icon: 'cloud', t: 'snapshots', s: 'GCS · S3 · RustFS', chips: [], c: 11 },
    { id: 'router', x: 50, y: 262, w: 230, h: 104, icon: 'route', t: 'atenet-router', s: 'ingress · resumes Actors', chips: ['Envoy or agentgateway'], c: 2 },
    { id: 'api', x: 305, y: 262, w: 230, h: 120, icon: 'server', t: 'ate-api-server', s: 'control plane · scheduler', chips: ['svc/api :443', 'authn · authz soon'], c: 1 },
    { id: 'pg', x: 560, y: 262, w: 210, h: 104, icon: 'db', t: 'state store', s: 'PostgreSQL', chips: ['actors · workers'], c: 10 },
    { id: 'egress', x: 50, y: 414, w: 230, h: 96, icon: 'shield', t: 'atenet-egress', s: 'egress gateway · policy', chips: ['deny by default'], c: 2 },
    { id: 'template', x: 305, y: 414, w: 230, h: 96, icon: 'file', t: 'ActorTemplate', s: 'a record in Postgres', chips: [], c: 7 },
    { id: 'controller', x: 560, y: 414, w: 210, h: 96, icon: 'sync', t: 'ate-controller', s: 'reconciles CRDs', chips: ['makes Deployments'], c: 9 },
    { id: 'records', x: 820, y: 262, w: 240, h: 138, records: true, c: 6 },
    { id: 'k8s', x: 820, y: 420, w: 240, h: 120, icon: 'k8s', t: 'kube-apiserver · etcd', s: 'slow-changing infrastructure', chips: ['WorkerPool', 'SandboxConfig'], c: 'k8s' },
    { id: 'atelet', x: 780, y: 598, w: 260, h: 88, icon: 'layers', t: 'atelet', s: 'DaemonSet · one per node', chips: ['images · bundles · snapshots'], c: 8 }
  ];
  var workers = [
    { id: 'A1', x: 56, y: 732, w: 320, h: 230, cls: 'gvisor', slots: 4, size: 256, cap: 1024 },
    { id: 'A2', x: 396, y: 732, w: 320, h: 230, cls: 'gvisor', slots: 4, size: 256, cap: 1024 },
    { id: 'B1', x: 758, y: 732, w: 288, h: 230, cls: 'microvm', slots: 2, size: 512, cap: 1024 }
  ];
  // kind: run · ctl · prov (dashed) · snap (blue) · egress (amber). a → b is the forward direction.
  var edges = {
    clientRouter: { kind: 'run', a: 'client', b: 'router', pts: [[400, 134], [400, 200], [165, 200], [165, 262]] },
    kubectlApi: { kind: 'ctl', a: 'kubectl', b: 'api', pts: [[640, 134], [640, 214], [440, 214], [440, 262]] },
    kubectlK8s: { kind: 'prov', a: 'kubectl', b: 'k8s', pts: [[750, 86], [1088, 86], [1088, 470], [1060, 470]] },
    routerApi: { kind: 'run', a: 'router', b: 'api', pts: [[280, 314], [305, 314]] },
    apiPg: { kind: 'run', a: 'api', b: 'pg', pts: [[535, 314], [560, 314]] },
    pgRecords: { kind: 'run', a: 'pg', b: 'records', pts: [[770, 314], [820, 314]] },
    apiTemplate: { kind: 'prov', a: 'api', b: 'template', pts: [[420, 382], [420, 414]] },
    ctrlK8s: { kind: 'prov', a: 'controller', b: 'k8s', pts: [[770, 470], [820, 470]] },
    apiAtelet: { kind: 'run', a: 'api', b: 'atelet', pts: [[510, 382], [510, 398], [545, 398], [545, 615], [780, 615]] },
    bucketAtelet: { kind: 'snap', a: 'bucket', b: 'atelet', pts: [[1110, 650], [1040, 650]] },
    ateletA1: { kind: 'run', a: 'atelet', b: 'A1', pts: [[800, 686], [800, 694], [216, 694], [216, 732]] },
    ateletA2: { kind: 'run', a: 'atelet', b: 'A2', pts: [[800, 686], [800, 694], [556, 694], [556, 732]] },
    ateletB1: { kind: 'run', a: 'atelet', b: 'B1', pts: [[1000, 686], [1000, 732]] },
    tunnelA1: { kind: 'run', a: 'router', b: 'A1', pts: [[50, 320], [36, 320], [36, 972], [216, 972], [216, 962]] },
    tunnelA2: { kind: 'run', a: 'router', b: 'A2', pts: [[50, 320], [36, 320], [36, 972], [556, 972], [556, 962]] },
    tunnelB1: { kind: 'run', a: 'router', b: 'B1', pts: [[50, 320], [36, 320], [36, 972], [902, 972], [902, 962]] },
    egressA1: { kind: 'egress', a: 'A1', b: 'egress', pts: [[120, 732], [120, 510]] },
    egressNet: { kind: 'egress', a: 'egress', b: 'internet', pts: [[50, 462], [22, 462], [22, 170], [135, 170], [135, 134]] }
  };

  /* ================= world model ================= */
  var POD = { A1: 'agents-6f9c-qx7lp', A2: 'agents-6f9c-m2v8d', B1: 'vms-58bd-4kzrw' };
  function freshWorld() {
    return { pods: { A1: 'none', A2: 'none', B1: 'none' }, podName: { A1: POD.A1, A2: POD.A2, B1: POD.B1 },
      slots: { A1: [null, null, null, null], A2: [null, null, null, null], B1: [null, null] },
      template: 'none', golden: false, snaps: 0, records: [] };
  }
  function put(w, wk, i, a) { w.slots[wk][i] = a; }
  function find(w, id) { for (var k in w.slots) for (var i = 0; i < w.slots[k].length; i++) { var s = w.slots[k][i]; if (s && s.id === id) return { wk: k, i: i, a: s }; } return null; }
  function act(w, id, patch) { var f = find(w, id); if (f) for (var k in patch) f.a[k] = patch[k]; }
  function drop(w, id) { var f = find(w, id); if (f) w.slots[f.wk][f.i] = null; }
  function rec(w, id, patch) {
    var r = null; w.records.forEach(function (x) { if (x.id === id) r = x; });
    if (!r) { r = { id: id, state: 'SUSPENDED', worker: '' }; w.records.push(r); }
    for (var k in patch) r[k] = patch[k];
  }

  /* ================= scenes ================= */
  function P(t, e, d, o) { o = o || {}; return { t: t, p: e, d: d, rev: !!o.rev, cls: o.cls || '', label: o.label || '' }; }
  function E(t, k, m) { return { t: t, ev: k, m: m }; }
  function S(t, f) { return { t: t, set: f }; }

  var SCENES = [
    { short: 'Warm capacity', title: 'A WorkerPool becomes warm workers',
      text: 'Capacity is Kubernetes. You apply a WorkerPool; ate-controller reconciles it into a Deployment, and the worker Pods start with a sandbox ready. Each worker tells the control plane what it can hold: its CPU and memory limits, and up to 1000 Actors.',
      watch: 'Hatched workers are Pods still starting. Once ready, each one registers its capacity with ate-api-server through atelet.',
      cmd: 'kubectl apply -f workerpool.yaml\nkubectl get workerpool -A\nkubectl ate get workers', dur: 11, frames: ['f-poolA', 'f-poolB'],
      beats: [
        E(0.2, 'cli', 'kubectl apply: WorkerPool agents (gvisor, 2 workers) and vms (microvm, 1 worker)'),
        P(0.2, 'kubectlK8s', 1.8, { label: 'apply' }),
        E(2.0, 'k8s', 'WorkerPools stored in etcd, like any Kubernetes object'),
        P(2.2, 'ctrlK8s', 1.1, { rev: true, label: 'watch' }),
        E(3.3, 'k8s', 'ate-controller reconciles each WorkerPool into a Deployment'),
        P(3.4, 'ctrlK8s', 1.1, { label: 'Deployment' }),
        S(4.6, function (w) { w.pods.A1 = 'starting'; w.pods.A2 = 'starting'; w.pods.B1 = 'starting'; }),
        E(4.6, 'k8s', 'worker Pods scheduled: 2 × ateom-gvisor, 1 × ateom-microvm'),
        S(6.6, function (w) { w.pods.A1 = 'ready'; w.pods.A2 = 'ready'; w.pods.B1 = 'ready'; }),
        E(6.6, 'atelet', 'workers ready: sandbox warm, nothing running yet'),
        P(6.8, 'ateletA1', 1.0, { rev: true }), P(6.8, 'ateletA2', 1.0, { rev: true }), P(6.8, 'ateletB1', 0.7, { rev: true }),
        P(7.9, 'apiAtelet', 1.4, { rev: true, label: 'capacity' }),
        P(9.3, 'apiPg', 0.6),
        E(9.5, 'api', '3 workers registered · 1Gi each · up to 1000 Actors each')
      ] },
    { short: 'Template', title: 'A template and its golden snapshot',
      text: 'An ActorTemplate defines a kind of Actor: image, resource limits, snapshot settings. It goes to the Substrate API and into Postgres, not etcd. Creating it boots the workload once, checkpoints it, and stores that golden snapshot in object storage.',
      watch: 'The purple "golden" Actor boots on a worker, is checkpointed, and leaves. The snapshot lands in object storage, and the template gets its golden tag.',
      cmd: 'kubectl ate create atespace team-a\nkubectl ate create actor-template -f counter.yaml\nkubectl ate get actor-templates -a team-a', keep: ['bucket', 'template'], dur: 12,
      beats: [
        E(0.2, 'cli', 'kubectl ate create actor-template: counter (256Mi, MEMORY fidelity)'),
        P(0.2, 'kubectlApi', 1.4, { label: 'CreateActorTemplate' }),
        P(1.6, 'apiPg', 0.6), P(1.6, 'apiTemplate', 0.6),
        S(2.2, function (w) { w.template = 'building'; }),
        E(2.2, 'api', 'template stored in Postgres; golden snapshot build starts'),
        P(2.4, 'apiAtelet', 1.4, { label: 'boot once' }),
        P(3.8, 'ateletA2', 1.1),
        S(4.9, function (w) { put(w, 'A2', 0, { id: 'golden', state: 'booting', count: null, kind: 'golden', size: 256 }); }),
        E(4.9, 'atelet', 'golden boot: the workload starts once in a gVisor sandbox'),
        S(6.6, function (w) { act(w, 'golden', { state: 'checkpoint' }); }),
        E(6.6, 'atelet', 'wakeup probe passed · checkpoint memory, rootfs and volumes'),
        P(6.8, 'ateletA2', 1.1, { rev: true, cls: 'snap', label: 'snapshot' }),
        P(7.9, 'bucketAtelet', 1.1, { rev: true, label: 'upload' }),
        S(9.0, function (w) { drop(w, 'golden'); w.golden = true; w.template = 'ready'; }),
        E(9.0, 'snap', 'golden snapshot stored · template counter has its GOLDEN TAG'),
        P(9.2, 'apiTemplate', 0.8)
      ] },
    { short: 'Create Actor', title: 'An Actor is a record, not a Pod',
      text: 'Creating an Actor writes a record in Postgres: (team-a, counter-1), created from the counter template. Nothing starts. A suspended Actor uses no worker, which is how thousands of agents can exist on a few Pods.',
      watch: 'A row appears in the actor records. No worker changes.',
      cmd: 'kubectl ate create actor counter-1 -a team-a --template counter\nkubectl ate get actor counter-1 -a team-a', dur: 6,
      beats: [
        E(0.2, 'cli', 'kubectl ate create actor counter-1 -a team-a --template counter'),
        P(0.2, 'kubectlApi', 1.4, { label: 'CreateActor' }),
        P(1.6, 'apiPg', 0.6), P(2.2, 'pgRecords', 0.6),
        S(2.8, function (w) { rec(w, 'team-a/counter-1', { state: 'SUSPENDED', worker: '' }); }),
        E(2.8, 'api', 'team-a/counter-1 · SUSPENDED · no worker, no compute')
      ] },
    { short: 'First request', title: 'The first request wakes the Actor',
      text: 'A client calls the router with the ate-target-actor header. The router asks ate-api-server to resume the Actor; the scheduler picks a worker with room, and atelet restores the golden snapshot into a fresh sandbox there. Then the router tunnels the request to the worker\'s atunnel, which hands it to the Actor.',
      watch: 'The Actor appears amber (resuming), turns green (running), and the count goes to 1. The second request skips the resume: the Actor is already running.',
      cmd: 'kubectl port-forward -n ate-system svc/atenet-router 8000:80\ncurl -X POST -H "ate-target-actor: team-a/counter-1" http://localhost:8000', keep: ['records', 'template'], dur: 16,
      beats: [
        E(0.2, 'router', 'POST / · ate-target-actor: team-a/counter-1'),
        P(0.2, 'clientRouter', 1.2, { label: 'request' }),
        P(1.4, 'routerApi', 0.6, { label: 'ResumeActor' }),
        P(2.0, 'apiPg', 0.5),
        S(2.5, function (w) { rec(w, 'team-a/counter-1', { state: 'RESUMING', worker: 'A1' }); }),
        E(2.5, 'api', 'scheduler: worker agents-…-qx7lp has 1Gi free, the Actor needs 256Mi'),
        P(2.6, 'apiAtelet', 1.4, { label: 'restore' }),
        P(4.0, 'bucketAtelet', 1.0, { label: 'golden' }),
        P(5.0, 'ateletA1', 1.2),
        S(6.2, function (w) { put(w, 'A1', 0, { id: 'team-a/counter-1', state: 'RESUMING', count: 0, size: 256 }); }),
        E(6.2, 'atelet', 'golden snapshot restored into a new gVisor sandbox'),
        S(7.0, function (w) { act(w, 'team-a/counter-1', { state: 'RUNNING' }); rec(w, 'team-a/counter-1', { state: 'RUNNING' }); }),
        P(7.0, 'routerApi', 0.5, { rev: true, label: 'worker' }),
        P(7.5, 'tunnelA1', 1.6, { label: 'mTLS tunnel' }),
        S(9.1, function (w) { act(w, 'team-a/counter-1', { count: 1 }); }),
        E(9.1, 'ok', '200 · count 1 · served by the Actor through atunnel'),
        P(9.1, 'tunnelA1', 1.4, { rev: true }), P(10.5, 'clientRouter', 1.0, { rev: true, label: '200' }),
        E(11.8, 'router', 'second request: the Actor is already running'),
        P(11.8, 'clientRouter', 0.8), P(12.6, 'tunnelA1', 1.0),
        S(13.6, function (w) { act(w, 'team-a/counter-1', { count: 2 }); }),
        E(13.6, 'ok', '200 · count 2 · no resume needed'),
        P(13.6, 'tunnelA1', 1.0, { rev: true }), P(14.6, 'clientRouter', 0.8, { rev: true })
      ] },
    { short: 'Egress', title: 'Every way out goes through the gateway',
      text: 'The Actor calls an LLM API. atunnel carries the connection to atenet-egress, which checks the Actor\'s egress policy. An allowed destination goes through, and the gateway can swap a placeholder for the real API key on the way. A destination with no rule is refused.',
      watch: 'The amber call reaches the external API and comes back. The red one stops at the gateway.',
      cmd: 'kubectl ate create egress-policy counter-1 -a team-a -f - <<EOF\nrules:\n- tlsPassthrough:\n    hostnames: ["api.anthropic.com"]\n    ports: {numbers: [443]}\nEOF', dur: 11,
      beats: [
        E(0.2, 'egress', 'counter-1 → api.anthropic.com:443'),
        P(0.2, 'egressA1', 1.0, { label: 'atunnel' }),
        E(1.2, 'egress', 'policy allows api.anthropic.com · forwarded'),
        P(1.3, 'egressNet', 1.8, { label: 'allowed' }),
        E(3.1, 'ok', 'upstream answered'),
        P(3.1, 'egressNet', 1.6, { rev: true }), P(4.7, 'egressA1', 0.9, { rev: true }),
        E(6.2, 'egress', 'counter-1 → example.com:443'),
        P(6.2, 'egressA1', 1.0, { cls: 'deny', label: 'example.com' }),
        E(7.2, 'deny', 'no rule for example.com → refused (403; DNS answered REFUSED)'),
        P(7.3, 'egressA1', 1.0, { rev: true, cls: 'deny', label: '403' })
      ] },
    { short: 'Suspend', title: 'Suspend: state to storage, worker freed',
      text: 'Suspending checkpoints the sandbox (process memory, root filesystem changes, and its durable volume) through atelet to object storage, under the Actor\'s atespace. The worker slot is free again for any other Actor.',
      watch: 'The Actor turns blue, its snapshot uploads, and the slot empties. The record says SUSPENDED.',
      cmd: 'kubectl ate suspend actor counter-1 -a team-a\nkubectl ate get actor counter-1 -a team-a', keep: ['records'], dur: 10,
      beats: [
        E(0.2, 'cli', 'kubectl ate suspend actor counter-1 -a team-a'),
        P(0.2, 'kubectlApi', 1.4, { label: 'SuspendActor' }),
        P(1.6, 'apiPg', 0.5),
        S(2.1, function (w) { rec(w, 'team-a/counter-1', { state: 'SUSPENDING' }); act(w, 'team-a/counter-1', { state: 'SUSPENDING' }); }),
        P(2.2, 'apiAtelet', 1.2, { label: 'checkpoint' }),
        P(3.4, 'ateletA1', 0.9),
        E(4.3, 'atelet', 'checkpoint: memory + rootfs + volume'),
        P(4.4, 'ateletA1', 1.0, { rev: true, cls: 'snap', label: 'snapshot' }),
        P(5.4, 'bucketAtelet', 1.1, { rev: true, label: 'upload' }),
        S(6.5, function (w) { drop(w, 'team-a/counter-1'); w.snaps = 1; rec(w, 'team-a/counter-1', { state: 'SUSPENDED', worker: '' }); }),
        E(6.5, 'snap', 'snapshot stored under …/atespaces/team-a/actors/<uid>/'),
        P(6.6, 'apiPg', 0.6, { rev: true }),
        E(7.2, 'api', 'team-a/counter-1 · SUSPENDED · worker freed')
      ] },
    { short: 'Teleport', title: 'Resume anywhere: the state isn\'t in a Pod',
      text: 'The worker that last ran the Actor is replaced (its Pod deleted, a new one started). That doesn\'t matter: the next request resumes the Actor from object storage onto any worker with room, with its process memory intact.',
      watch: 'The Actor comes back on the other worker, and the count continues at 3, not 1.',
      cmd: 'kubectl delete pod <old-worker> -n ate-demo\ncurl -X POST -H "ate-target-actor: team-a/counter-1" http://localhost:8000', keep: ['records', 'k8s'], dur: 14,
      beats: [
        E(0.2, 'k8s', 'worker Pod agents-…-qx7lp deleted · the Deployment replaces it'),
        S(0.3, function (w) { w.pods.A1 = 'starting'; w.podName.A1 = 'agents-6f9c-t9hzn'; }),
        S(2.6, function (w) { w.pods.A1 = 'ready'; }),
        E(2.6, 'atelet', 'new worker agents-…-t9hzn ready'),
        E(3.0, 'router', 'POST / · ate-target-actor: team-a/counter-1'),
        P(3.0, 'clientRouter', 1.0), P(4.0, 'routerApi', 0.5, { label: 'ResumeActor' }), P(4.5, 'apiPg', 0.5),
        S(5.0, function (w) { rec(w, 'team-a/counter-1', { state: 'RESUMING', worker: 'A2' }); }),
        E(5.0, 'api', 'last snapshot is in object storage → any worker with room'),
        P(5.1, 'apiAtelet', 1.2, { label: 'restore' }),
        P(6.3, 'bucketAtelet', 1.0, { label: 'counter-1' }),
        P(7.3, 'ateletA2', 1.1),
        S(8.4, function (w) { put(w, 'A2', 0, { id: 'team-a/counter-1', state: 'RUNNING', count: 2, size: 256 }); rec(w, 'team-a/counter-1', { state: 'RUNNING' }); }),
        E(8.4, 'atelet', 'restored on agents-…-m2v8d with its memory'),
        P(8.6, 'tunnelA2', 1.5),
        S(10.1, function (w) { act(w, 'team-a/counter-1', { count: 3 }); }),
        E(10.1, 'ok', '200 · count 3 · the count survived the move'),
        P(10.1, 'tunnelA2', 1.4, { rev: true }), P(11.5, 'clientRouter', 1.0, { rev: true })
      ] },
    { short: 'Packing', title: 'Several Actors on one worker',
      text: 'A worker hosts as many Actors as its limits allow, each in its own sandbox. With 1Gi workers and 256Mi Actors, four fit per worker. The same name in another atespace is a different Actor. A micro-VM pool runs Actors behind hardware isolation instead.',
      watch: 'The memory bar on the middle worker fills to 1Gi of 1Gi, so the next Actor lands on the other worker. team-b/counter-1 is not team-a/counter-1.',
      cmd: 'kubectl ate create actor agent-1 -a team-a --template counter\nkubectl ate create actor counter-1 -a team-b --template team-a/counter\nkubectl ate get workers', keep: ['records'], dur: 15, frames: ['f-poolA', 'f-poolB'],
      beats: [
        E(0.2, 'cli', 'more Actors: team-a/agent-1…3, team-b/counter-1, vms/vm-1 (micro-VM)'),
        P(0.2, 'kubectlApi', 1.2), P(1.4, 'apiPg', 0.5), P(1.9, 'pgRecords', 0.5),
        S(2.4, function (w) { ['team-a/agent-1', 'team-a/agent-2', 'team-a/agent-3', 'team-b/counter-1', 'vms/vm-1'].forEach(function (id) { rec(w, id, { state: 'SUSPENDED', worker: '' }); }); }),
        P(3.0, 'clientRouter', 0.7), P(3.7, 'routerApi', 0.4), P(4.1, 'apiAtelet', 0.9), P(5.0, 'ateletA2', 0.8),
        S(5.8, function (w) { put(w, 'A2', 1, { id: 'team-a/agent-1', state: 'RUNNING', count: 1, size: 256 }); put(w, 'A2', 2, { id: 'team-a/agent-2', state: 'RUNNING', count: 1, size: 256 }); put(w, 'A2', 3, { id: 'team-a/agent-3', state: 'RUNNING', count: 1, size: 256 });
          rec(w, 'team-a/agent-1', { state: 'RUNNING', worker: 'A2' }); rec(w, 'team-a/agent-2', { state: 'RUNNING', worker: 'A2' }); rec(w, 'team-a/agent-3', { state: 'RUNNING', worker: 'A2' }); }),
        E(5.8, 'atelet', 'agent-1…3 packed onto agents-…-m2v8d: 4 × 256Mi = 1Gi of 1Gi'),
        P(6.6, 'clientRouter', 0.7), P(7.3, 'routerApi', 0.4), P(7.7, 'apiAtelet', 0.9), P(8.6, 'ateletA1', 0.9),
        S(9.5, function (w) { put(w, 'A1', 0, { id: 'team-b/counter-1', state: 'RUNNING', count: 1, size: 256 }); rec(w, 'team-b/counter-1', { state: 'RUNNING', worker: 'A1' }); }),
        E(9.5, 'api', 'm2v8d has no 256Mi left → team-b/counter-1 goes to t9hzn'),
        E(9.7, 'ok', 'team-b/counter-1 starts at count 1: a different Actor than team-a/counter-1'),
        P(10.6, 'apiAtelet', 0.9), P(11.5, 'ateletB1', 0.7),
        S(12.2, function (w) { put(w, 'B1', 0, { id: 'vms/vm-1', state: 'RUNNING', count: 1, size: 512, vm: true }); rec(w, 'vms/vm-1', { state: 'RUNNING', worker: 'B1' }); }),
        E(12.2, 'atelet', 'vms/vm-1 boots in a micro-VM: its own guest kernel, behind KVM'),
        P(12.4, 'tunnelB1', 1.5)
      ] },
    { short: 'Two planes', title: 'Two control planes, on purpose',
      text: 'Kubernetes holds what changes slowly: WorkerPools, SandboxConfigs, Deployments, Pods. Substrate\'s own API and Postgres hold what changes constantly: Actors resuming and suspending, worker assignments, templates. Workers stay warm; Actors come and go on them.',
      watch: 'Kubernetes on the right, Substrate\'s records next to it. Click any component to read its role.',
      cmd: 'kubectl get workerpool,sandboxconfig -A   # Kubernetes\nkubectl ate get actors -A                 # Substrate', keep: ['k8s', 'records', 'pg'], dur: 6,
      beats: [
        E(0.2, 'k8s', 'slow-changing: WorkerPool · SandboxConfig · Deployment → etcd'),
        P(0.3, 'ctrlK8s', 1.4, { rev: true }),
        E(1.8, 'api', 'fast-changing: actors · workers · templates → Postgres'),
        P(1.9, 'apiPg', 0.8), P(2.7, 'pgRecords', 0.8),
        E(3.6, 'ok', 'the tour is over: press a scene to replay it, or explore the map')
      ] }
  ];
  SCENES.forEach(function (sc) {
    sc.beats.sort(function (a, b) { return a.t - b.t; });
    var ns = {}, es = {};
    sc.beats.forEach(function (b) { if (b.p) { es[b.p] = 1; ns[edges[b.p].a] = 1; ns[edges[b.p].b] = 1; } });
    (sc.keep || []).forEach(function (n) { ns[n] = 1; });
    sc.nodeSet = ns; sc.edgeSet = es;
  });

  /* ================= render canvas ================= */
  var canvas = $('#sd-canvas'), wiresSvg = $('#sd-wires'), pkSvg = $('#sd-packets');
  var SVGNS = 'http://www.w3.org/2000/svg';
  var frameEls = {}, nodeEls = {}, workerEls = {}, edgeEls = {};

  frames.forEach(function (f) {
    var e = el('div', 'frame ' + f.cls); place(e, f);
    var l = el('span', 'flabel', esc(f.label)); l.style.left = f.lx + 'px';
    if (f.c) { l.dataset.c = f.c; l.appendChild(el('span', 'cnum in-label', String(f.c))); }
    e.appendChild(l); canvas.appendChild(e); frameEls[f.id] = e;
  });

  nodes.forEach(function (n) {
    var e;
    if (n.records) {
      e = el('div', 'node records');
      e.innerHTML = '<div class="head"><span class="t">actor records</span><span class="s" data-rec-sum>in Postgres</span></div><ul data-rec-list></ul>';
    } else {
      e = el('div', 'node');
      e.innerHTML = '<div class="ico">' + icon(n.icon) + '</div><div class="txt"><div class="t">' + esc(n.t) + '</div><div class="s">' + esc(n.s) + '</div>' +
        '<div class="chips" data-chips="' + n.id + '">' + n.chips.map(function (c) { return '<span class="chip">' + esc(c) + '</span>'; }).join('') + '</div></div>';
    }
    if (typeof n.c === 'number') e.appendChild(el('span', 'cnum', String(n.c)));
    e.dataset.c = n.c; e.dataset.node = n.id; e.tabIndex = 0; e.setAttribute('role', 'button');
    e.setAttribute('aria-label', (n.t || 'actor records') + ': show details');
    place(e, n); canvas.appendChild(e); nodeEls[n.id] = e;
  });

  workers.forEach(function (wk) {
    var e = el('div', 'worker');
    e.dataset.c = 4; e.dataset.node = wk.id; e.tabIndex = 0; e.setAttribute('role', 'button');
    e.setAttribute('aria-label', 'worker ' + wk.id + ': show details');
    place(e, wk); canvas.appendChild(e); workerEls[wk.id] = e;
  });

  Object.keys(edges).forEach(function (id) {
    var ed = edges[id], d = 'M' + ed.pts.map(function (q) { return q.join(' '); }).join(' L');
    var halo = document.createElementNS(SVGNS, 'path'); halo.setAttribute('d', d); halo.setAttribute('class', 'halo');
    var p = document.createElementNS(SVGNS, 'path'); p.setAttribute('d', d); p.setAttribute('class', 'w ' + ed.kind);
    wiresSvg.appendChild(halo); wiresSvg.appendChild(p);
    edgeEls[id] = p; ed.len = p.getTotalLength();
  });

  /* ================= paint world ================= */
  function paintWorld(w) {
    $('[data-chips="template"]').innerHTML = w.template === 'ready' ? '<span class="chip good">golden tag ready</span>'
      : w.template === 'building' ? '<span class="chip warn">building golden snapshot</span>' : '<span class="chip">no template yet</span>';
    $('[data-chips="bucket"]').innerHTML = (w.golden ? '<span class="chip snapc">golden: counter</span>' : '<span class="chip">golden: none</span>') +
      (w.snaps ? '<span class="chip snapc">actor snapshots: ' + w.snaps + '</span>' : '');
    var list = $('[data-rec-list]');
    if (!w.records.length) { list.innerHTML = '<li class="empty">no Actors yet</li>'; }
    else {
      list.innerHTML = w.records.slice(-5).map(function (r) {
        return '<li><span>' + esc(r.id) + '</span><span class="st ' + r.state + '">' + r.state + '</span><span class="wk">' + (r.worker ? workerShort(r.worker, w) : '–') + '</span></li>';
      }).join('');
    }
    var running = w.records.filter(function (r) { return r.state === 'RUNNING'; }).length;
    $('[data-rec-sum]').textContent = w.records.length ? w.records.length + ' total · ' + running + ' running' : 'in Postgres';
    workers.forEach(function (wk) {
      var e = workerEls[wk.id], state = w.pods[wk.id], slots = w.slots[wk.id];
      var used = slots.reduce(function (s, a) { return s + (a ? a.size : 0); }, 0);
      var pct = Math.round(used / wk.cap * 100);
      e.className = 'worker ' + state + (e.classList.contains('on') ? ' on' : '') + (e.classList.contains('sel') ? ' sel' : '') + (e.classList.contains('dim') ? ' dim' : '');
      var vm = wk.cls === 'microvm';
      var sub = state === 'none' ? 'not created' : state === 'starting' ? 'starting…' : w.podName[wk.id];
      e.innerHTML = '<div class="hd"><div class="ico">' + icon('cube') + '</div><div><div class="t">' + (vm ? 'ateom-microvm' : 'ateom-gvisor') + '</div><div class="s">' + esc(sub) + '</div></div>' +
        '<span class="chip" data-c="3">atunnel</span></div>' +
        '<div class="mem"><div class="lbl"><span>memory</span><b>' + fmtMem(used) + ' / 1Gi</b></div><div class="bar"><i class="' + (pct >= 100 ? 'full' : '') + '"></i></div></div>' +
        '<div class="slots">' + slots.map(function (a) {
          if (!a) return '<div class="slot' + (vm ? ' vm' : '') + '" data-c="4a"><span class="sl">' + (vm ? 'micro-VM · 512Mi' : 'gVisor sandbox') + '</span></div>';
          var golden = a.kind === 'golden';
          var parts = golden ? ['ate-golden', 'golden boot'] : a.id.split('/');
          var st = golden ? (a.state === 'booting' ? 'booting' : 'checkpoint') : a.state;
          var cnt = a.count != null ? 'count ' + a.count : '';
          return '<div class="slot' + (vm ? ' vm' : '') + '" data-c="4a"><div class="actor ' + (golden ? 'golden ' : '') + st + '" data-c="6" title="' + esc(a.id + ' · ' + st.toLowerCase()) + '">' +
            '<b>' + esc(parts[1]) + '</b><span><em>' + esc(parts[0]) + '</em><em>' + esc(st.toLowerCase()) + '</em></span><span><em>' + (vm ? 'micro-VM' : 'gVisor') + '</em><em>' + cnt + '</em></span></div></div>';
        }).join('') + '</div>';
      e.querySelector('.bar i').style.setProperty('--m', pct + '%');
      e.appendChild(el('span', 'cnum', '4'));
    });
  }
  function workerShort(id, w) { return id === 'B1' ? 'vm' : w.podName[id].slice(-5); }
  function fmtMem(mi) { return mi === 0 ? '0' : mi >= 1024 ? (mi / 1024) + 'Gi' : mi + 'Mi'; }

  /* ================= side panel ================= */
  var comp = $('#sd-comp');
  function showComp(key) {
    var c = COMP[key];
    if (!c) { comp.innerHTML = '<div class="eyebrow">• component</div><p class="hint">Click any box on the map, or Tab to it and press Enter, to read what it does. The numbers match the list below.</p>'; return; }
    var num = /^\d|4a/.test(String(key)) ? '#' + key + ' · ' : '';
    comp.innerHTML = '<div class="eyebrow">• component ' + num + esc(c.where) + '</div><h2>' + esc(c.name) + '</h2><p>' + c.p + '</p>' +
      '<dl class="kv">' + c.kv.map(function (r) { return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>'; }).join('') + '</dl>' +
      '<pre class="shell">' + esc(c.sh) + '</pre>';
  }
  function select(key, srcEl) {
    Object.keys(nodeEls).forEach(function (k) { nodeEls[k].classList.remove('sel'); });
    Object.keys(workerEls).forEach(function (k) { workerEls[k].classList.remove('sel'); });
    if (srcEl && (srcEl.classList.contains('node') || srcEl.classList.contains('worker'))) srcEl.classList.add('sel');
    showComp(key);
  }
  canvas.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-c]'); if (!t) return;
    select(t.dataset.c, t.closest('.node,.worker'));
  });

  var feed = $('#sd-feed');
  var KIND = { cli: 'kubectl', api: 'api', router: 'router', k8s: 'k8s', atelet: 'atelet', snap: 'storage', egress: 'egress', ok: 'served', deny: 'denied' };
  function addEvent(t, k, m) {
    var li = el('li', null, '<span class="ts">' + t.toFixed(1) + 's</span><span class="k k-' + k + '">' + KIND[k] + '</span><span></span>');
    li.lastChild.textContent = m;
    var empty = feed.querySelector('.empty'); if (empty) empty.remove();
    feed.prepend(li);
  }
  function clearFeed() { feed.innerHTML = '<li class="empty">Press Play. Each step of the scene shows up here.</li>'; }

  /* ================= rail ================= */
  var rail = $('#sd-rail'), doneScenes = {};
  SCENES.forEach(function (sc, i) {
    var b = el('button', 'scene', '<span class="n">scene ' + (i + 1) + '</span><b></b><span class="bar"></span>');
    b.type = 'button'; b.querySelector('b').textContent = sc.short;
    b.addEventListener('click', function () { load(i, playing); });
    rail.appendChild(b);
  });
  function paintRail(progress) {
    Array.prototype.forEach.call(rail.children, function (c, i) {
      if (i === idx) c.setAttribute('aria-current', 'step'); else c.removeAttribute('aria-current');
      c.classList.toggle('done', !!doneScenes[i] && i !== idx);
      c.style.setProperty('--p', i === idx ? Math.round(progress * 100) + '%' : doneScenes[i] ? '100%' : '0%');
    });
  }

  /* ================= playback engine ================= */
  var idx = 0, t = 0, world = null, applied = 0, playing = false, phase = 'ready', holdLeft = 0, speed = 1, raf = null, lastTs = 0;
  var HOLD = 3.5;

  function worldBefore(i) {
    var w = freshWorld();
    for (var j = 0; j < i; j++) SCENES[j].beats.forEach(function (b) { if (b.set) b.set(w); });
    return w;
  }
  function load(i, autoplay) {
    idx = Math.max(0, Math.min(SCENES.length - 1, i));
    var sc = SCENES[idx];
    t = 0; applied = 0; phase = 'ready'; holdLeft = 0;
    world = worldBefore(idx);
    $('#sd-n-eyebrow').textContent = '• scene ' + (idx + 1) + ' of ' + SCENES.length;
    $('#sd-n-title').textContent = sc.title; $('#sd-n-text').textContent = sc.text;
    $('#sd-n-watch').textContent = sc.watch; $('#sd-n-cmd').textContent = sc.cmd;
    $('#sd-banner').hidden = true;
    clearFeed(); paintWorld(world); paintDynamics(); paintRail(0); updateClock();
    if (autoplay) play(); else stopLoop('Play');
  }
  function advance(dt) {
    var sc = SCENES[idx];
    t = Math.min(sc.dur, t + dt);
    var changed = false;
    while (applied < sc.beats.length && sc.beats[applied].t <= t) {
      var b = sc.beats[applied++];
      if (b.set) { b.set(world); changed = true; }
      if (b.ev) addEvent(b.t, b.ev, b.m);
    }
    if (changed) paintWorld(world);
    if (t >= sc.dur) {
      phase = 'hold'; holdLeft = HOLD; doneScenes[idx] = true;
      var last = idx === SCENES.length - 1;
      $('#sd-banner').hidden = false;
      $('#sd-banner').textContent = last ? 'Tour complete. Click a scene to replay it, or explore the map.' : 'Scene ' + (idx + 1) + ' done.';
      if (last) stopLoop('Replay');
    }
  }
  function activePackets() {
    var sc = SCENES[idx], out = [];
    if (phase === 'ready' && t === 0) return out;
    sc.beats.forEach(function (b) { if (b.p && t >= b.t && t < b.t + b.d) out.push(b); });
    return out;
  }
  function paintDynamics() {
    var sc = SCENES[idx], act = activePackets();
    var live = phase !== 'ready' || t > 0;
    var onEdges = {}, onNodes = {};
    act.forEach(function (b) { onEdges[b.p] = b.cls || 'x'; onNodes[edges[b.p].a] = 1; onNodes[edges[b.p].b] = 1; });
    Object.keys(edgeEls).forEach(function (id) {
      var p = edgeEls[id];
      p.classList.toggle('on', !!onEdges[id]);
      p.classList.toggle('deny', onEdges[id] === 'deny');
      p.classList.toggle('dim', live && !sc.edgeSet[id]);
    });
    function tog(map) {
      Object.keys(map).forEach(function (id) {
        map[id].classList.toggle('on', !!onNodes[id]);
        map[id].classList.toggle('dim', live && !sc.nodeSet[id] && !onNodes[id]);
      });
    }
    tog(nodeEls); tog(workerEls);
    Object.keys(frameEls).forEach(function (id) { frameEls[id].classList.toggle('on', live && (sc.frames || []).indexOf(id) >= 0); });
    var html = '';
    act.forEach(function (b) {
      var ed = edges[b.p], k = (t - b.t) / b.d; k = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      var pt = edgeEls[b.p].getPointAtLength(ed.len * (b.rev ? 1 - k : k));
      var col = b.cls === 'deny' ? '#FF6B7A' : (b.cls === 'snap' || ed.kind === 'snap') ? '#20B7F3' : ed.kind === 'egress' ? '#F2B84B' : '#B79CFF';
      html += '<g class="pk"><circle cx="' + pt.x.toFixed(1) + '" cy="' + pt.y.toFixed(1) + '" r="11" fill="' + col + '" opacity=".18"/>' +
        '<circle cx="' + pt.x.toFixed(1) + '" cy="' + pt.y.toFixed(1) + '" r="5" fill="' + col + '"/>';
      if (b.label) {
        var wdt = b.label.length * 6.2 + 12;
        html += '<rect x="' + (pt.x + 9).toFixed(1) + '" y="' + (pt.y - 21).toFixed(1) + '" width="' + wdt.toFixed(1) + '" height="17" rx="6" fill="#11141F" stroke="' + col + '" stroke-opacity=".6"/>' +
          '<text x="' + (pt.x + 15).toFixed(1) + '" y="' + (pt.y - 9).toFixed(1) + '">' + esc(b.label) + '</text>';
      }
      html += '</g>';
    });
    pkSvg.innerHTML = html;
  }
  function updateClock() { $('#sd-clock').textContent = 'scene ' + (idx + 1) + ' / ' + SCENES.length + ' · ' + t.toFixed(1) + 's of ' + SCENES[idx].dur + 's'; }

  function frame(ts) {
    raf = null;
    if (!lastTs) lastTs = ts;
    var dt = Math.min(0.1, (ts - lastTs) / 1000); lastTs = ts;
    if (phase === 'running') {
      advance(dt * speed);
      paintDynamics(); updateClock(); paintRail(t / SCENES[idx].dur);
    } else if (phase === 'hold') {
      paintDynamics();
      if ($('#sd-autoadv').checked && idx < SCENES.length - 1) {
        holdLeft -= dt;
        $('#sd-banner').textContent = 'Scene ' + (idx + 1) + ' done · next: ' + SCENES[idx + 1].short + ' in ' + Math.max(0, Math.ceil(holdLeft)) + 's';
        if (holdLeft <= 0) { load(idx + 1, true); return; }
      } else if (idx < SCENES.length - 1) $('#sd-banner').textContent = 'Scene ' + (idx + 1) + ' done · press Next to continue';
    }
    if (playing) raf = requestAnimationFrame(frame);
  }
  function play() {
    if (phase === 'hold' && idx === SCENES.length - 1) { doneScenes = {}; load(0, true); return; }
    if (phase === 'ready') phase = 'running';
    playing = true; $('#sd-play').textContent = 'Pause'; lastTs = 0;
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function stopLoop(label) {
    playing = false; if (raf) cancelAnimationFrame(raf); raf = null;
    $('#sd-play').textContent = label || (t > 0 && phase !== 'hold' ? 'Resume' : 'Play');
  }
  $('#sd-play').addEventListener('click', function () { playing ? stopLoop() : play(); });
  $('#sd-next').addEventListener('click', function () { load(idx + 1, playing); });
  $('#sd-prev').addEventListener('click', function () { load(idx - 1, playing); });

  // Keys only act while focus is inside the diagram, so page scrolling and the site's "/" search keep working.
  root.addEventListener('keydown', function (e) {
    var onControl = e.target.closest('input, button, [role="button"]');
    if ((e.key === 'Enter' || e.key === ' ') && onControl && onControl.dataset.c) {
      e.preventDefault(); select(onControl.dataset.c, onControl); return;
    }
    if (onControl && (e.key === ' ' || e.key === 'Enter')) return;
    if (e.key === ' ') { e.preventDefault(); playing ? stopLoop() : play(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); load(idx + 1, playing); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); load(idx - 1, playing); }
    else if (e.key === 'Escape') select(null, null);
  });
  var speedSeg = $('#sd-speed');
  function setSpeed(v) { speed = v; Array.prototype.forEach.call(speedSeg.children, function (b) { b.setAttribute('aria-pressed', String(+b.dataset.v === v)); }); }
  speedSeg.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) setSpeed(+b.dataset.v); });
  $('#sd-fs').addEventListener('click', function () {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (root.requestFullscreen) root.requestFullscreen().catch(function () { $('#sd-fs').textContent = 'full screen unavailable'; });
    } catch (err) { $('#sd-fs').textContent = 'full screen unavailable'; }
  });
  document.addEventListener('fullscreenchange', function () { $('#sd-fs').textContent = document.fullscreenElement === root ? 'exit full screen' : 'full screen'; size(); });

  /* ================= size: widen past the text column, then fit the canvas ================= */
  var stage = $('#sd-stage');
  function size() {
    if (document.fullscreenElement === root) { root.style.width = ''; }
    else {
      root.style.width = '';
      var left = root.getBoundingClientRect().left, avail = document.documentElement.clientWidth - left - 16;
      root.style.width = Math.max(root.parentElement.clientWidth, Math.min(1400, avail)) + 'px';
    }
    var k = Math.min(1, stage.clientWidth / 1320);
    canvas.style.transform = 'scale(' + k + ')';
    stage.style.height = Math.ceil(1010 * k) + 'px';
  }
  window.addEventListener('resize', size);
  size();

  setSpeed(1);
  showComp(null);
  load(0, false);
})();

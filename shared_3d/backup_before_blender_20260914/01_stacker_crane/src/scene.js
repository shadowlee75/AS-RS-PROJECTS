(function (root) {
  'use strict';
  const Model = root.STCModel, M = root.STCMotion;
  class Scene {
    constructor(container, c, onCell) {
      this.container = container; this.config = c; this.onCell = onCell; this.needsRender = true; this.lastRender = 0;
      this.aisles = []; this.labels = []; this.textures = []; this.geometries = []; this.materials = [];
      this.stride = Math.max(5, c.stroke * 2 + 2.5); this.depth = (c.cranes - 1) * this.stride;
      this.bounds = Model.envelope(c); this.pointMarkers = [];
      if (!root.THREE) { this.fallback = true; return; }
      const T = root.THREE;
      try { this.renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); } catch (_) { this.fallback = true; return; }
      this.renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 1.5));
      this.renderer.setClearColor(0x122a3a); this.renderer.outputEncoding = T.sRGBEncoding;
      container.replaceChildren(this.renderer.domElement);
      this.scene = new T.Scene(); this.camera = new T.PerspectiveCamera(42, 1, .01, 10000);
      this.scene.add(new T.AmbientLight(0xbadce9, .8));
      const sun = new T.DirectionalLight(0xe5f6ff, 1.1); sun.position.set(c.length / 2, c.height + 25, 25); this.scene.add(sun);
      this.controls = new T.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true; this.controls.dampingFactor = .09; this.controls.maxPolarAngle = Math.PI / 2.01;
      this.controls.minDistance = .2; this.controls.maxDistance = Math.max(this.bounds.width, this.bounds.height, this.depth, 20) * 10;
      const mat = color => { const m = new T.MeshStandardMaterial({ color, roughness: .75, metalness: .15 }); this.materials.push(m); return m; };
      const steel = mat(0x466274), beam = mat(0x718e9d), mast = mat(0xe6b957), platform = mat(0xc0d6df), floor = mat(0x1b3546), cargoMat = mat(0xc89050);
      const unit = new T.BoxGeometry(1, 1, 1); this.geometries.push(unit);
      this.dummy = new T.Object3D(); this.color = new T.Color();
      const batches = new Map();
      const box = (w, h, d, x, y, z, material, parent) => {
        if (!parent) { if (!batches.has(material)) batches.set(material, []); batches.get(material).push([w, h, d, x, y, z]); return; }
        const mesh = new T.Mesh(unit, material); mesh.scale.set(w, h, d); mesh.position.set(x, y, z); parent.add(mesh); return mesh;
      };
      this.layout = Model.rackLayout(c);
      const px = c.length / c.bays, py = this.layout.pitch, bw = Math.min(.09, px * .05, py * .05);
      const loadW = Math.min(px * .74, 1.6), loadH = Math.min(py * .6, 1.2), loadD = Math.min(1, c.stroke * .7);
      const loadGeometry = new T.BoxGeometry(loadW, loadH, loadD); this.geometries.push(loadGeometry);
      const loadMaterial = mat(0xffffff); loadMaterial.transparent = true; loadMaterial.opacity = .58; loadMaterial.depthWrite = false;
      this.loads = new T.InstancedMesh(loadGeometry, loadMaterial, c.bays * c.levels * c.sides * c.cranes);
      this.loads.instanceMatrix.setUsage(T.DynamicDrawUsage); this.loads.frustumCulled = false; this.scene.add(this.loads);
      this.rack = Model.cells(c);
      this.highlight = new T.Mesh(new T.BoxGeometry(loadW * 1.12, loadH * 1.12, loadD * 1.12), new T.MeshBasicMaterial({ color: 0xffffff, wireframe: true }));
      this.geometries.push(this.highlight.geometry); this.materials.push(this.highlight.material); this.highlight.visible = false; this.scene.add(this.highlight);
      for (let i = 0; i < c.cranes; i++) {
        const z0 = i * this.stride, cfg = Model.aisleConfig(c, i);
        const travel = Model.envelope(cfg), railY = travel.yMin - .05;
        box(travel.width + 4, .09, this.stride - .2, (travel.xMin + travel.xMax) / 2, travel.yMin - .28, z0, floor);
        for (const dz of [-.35, .35]) box(travel.width + 1, .06, .05, (travel.xMin + travel.xMax) / 2, railY, z0 + dz, platform);
        for (let side = 0; side < c.sides; side++) {
          const z = z0 + (side === 0 ? -1 : 1) * c.stroke;
          for (let b = 0; b <= c.bays; b++) for (const depth of [-loadD * .6, loadD * .6])
            box(bw, this.layout.pitch * c.levels + .15, bw, b * px, (this.layout.boundaries[0] + this.layout.boundaries.at(-1)) / 2, z + depth, steel);
          for (const y of this.layout.boundaries) for (const depth of [-loadD * .6, loadD * .6])
            box(c.length, bw, bw, c.length / 2, y, z + depth, beam);
          // One texture per axis shows every input bay and level without omitting numbers.
          this.axisLabel(Array.from({ length: c.bays }, (_, b) => String(b + 1).padStart(3, '0')), c.length, Math.min(.65, py * .5), c.length / 2, -.65, z, false);
          this.axisLabel(Array.from({ length: c.levels }, (_, l) => String(l + 1).padStart(2, '0')), .8, c.height, -.7, c.height / 2, z, true, this.layout.heights);
          this.label(side === 0 ? 'A' : 'B', .8, .8, -.7, c.height + 1, z);
        }
        const crane = new T.Group(); crane.position.z = z0; crane.name = 'STC-' + (i + 1); this.scene.add(crane);
        box(Math.min(1.8, px), .28, Math.min(1, c.stroke), 0, travel.yMin + .14, 0, mast, crane);
        for (const x of [-.22, .22]) box(.12, travel.height + .7, .16, x, (travel.yMin + travel.yMax) / 2 + .3, 0, mast, crane);
        const carriage = new T.Group(); crane.add(carriage);
        box(Math.min(1.4, px), .12, Math.min(.8, c.stroke), 0, -.15, 0, platform, carriage);
        const fork = new T.Group(); carriage.add(fork);
        for (const x of [-loadW * .28, loadW * .28]) box(.07, .05, loadD, x, -loadH / 2, 0, platform, fork);
        const cargo = new T.Mesh(loadGeometry, cargoMat); fork.add(cargo); cargo.visible = false;
        this.label('STC ' + String(i + 1).padStart(2, '0'), 2.8, .8, 0, travel.yMax + 2, 0, crane);
        const queues = {};
        for (const kind of ['in', 'out']) {
          const p = M.port(cfg, kind), material = mat(kind === 'in' ? 0x2dc4bb : 0xf0a851);
          box(Math.min(1.5, px), .12, Math.max(loadD, .15), p.x, p.y - loadH / 2 - .16, z0 + p.z, material);
          this.label(kind.toUpperCase() + ' (' + [p.x, p.y, p.z].map(v => Number(v.toFixed(2))).join(',') + ')', 4.2, .7, p.x, p.y + 1.1 + (kind === 'out' ? .7 : 0), z0 + p.z);
          queues[kind] = new T.Group(); this.scene.add(queues[kind]);
          for (let j = 0; j < 8; j++) box(.45, .2, .4, p.x - 1.4, p.y + .2 + j * .24, z0 + p.z, material, queues[kind]);
        }
        this.aisles.push({ crane, carriage, fork, cargo, queues, z: z0, lastVersion: -1, lastPose: '', engine: null });
        if (c.method === 'fem') {
          const f = Model.femPoints(cfg), points = [...f.inbound, ...(c.femCase === 2 ? f.outbound : [])];
          points.forEach((p, j) => {
            const material = new T.MeshBasicMaterial({ color: j % 2 ? 0xf0a851 : 0x2dc4bb, wireframe: true, depthTest: false }); this.materials.push(material);
            const marker = new T.Mesh(unit, material); marker.scale.set(loadW * 1.14, loadH * 1.14, loadD * 1.14); marker.position.set(p.x, p.y, z0 + p.z);
            marker.userData = { point: p.name, cellId: p.id, aisle: i, coordinate: [p.x, p.y, p.z] }; this.scene.add(marker); this.pointMarkers.push(marker);
            this.label(p.name, .9, .45, p.x, p.y + loadH * .75, z0 + p.z);
          });
        }
      }
      // Batch static rack beams and port platforms across all aisles.
      for (const [material, boxes] of batches) {
        const mesh = new T.InstancedMesh(unit, material, boxes.length);
        boxes.forEach(([w, h, d, x, y, z], index) => {
          this.dummy.position.set(x, y, z); this.dummy.scale.set(w, h, d); this.dummy.updateMatrix(); mesh.setMatrixAt(index, this.dummy.matrix);
        });
        mesh.frustumCulled = false; this.scene.add(mesh);
      }
      // Compatibility aliases for one-aisle renderer checks.
      Object.assign(this, { crane: this.aisles[0].crane, carriage: this.aisles[0].carriage, fork: this.aisles[0].fork, cargo: this.aisles[0].cargo, sideZ: c.stroke });
      this.raycaster = new T.Raycaster(); this.pointer = new T.Vector2();
      this.down = e => { this.pointerStart = { x: e.clientX, y: e.clientY }; };
      this.up = e => {
        if (!this.pointerStart || Math.hypot(e.clientX - this.pointerStart.x, e.clientY - this.pointerStart.y) > 5) return;
        const r = this.renderer.domElement.getBoundingClientRect();
        this.pointer.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
        this.raycaster.setFromCamera(this.pointer, this.camera);
        const hit = this.raycaster.intersectObject(this.loads)[0];
        if (hit && Number.isInteger(hit.instanceId)) {
          const aisle = Math.floor(hit.instanceId / this.rack.length), id = hit.instanceId % this.rack.length;
          this.selectCell(aisle, id); this.onCell(id, aisle);
        }
      };
      this.renderer.domElement.addEventListener('pointerdown', this.down); this.renderer.domElement.addEventListener('pointerup', this.up);
      this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(container);
      this.setView('iso'); this.resize();
    }
    label(text, w, h, x, y, z, parent) {
      const T = root.THREE, canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#d7e9ee'; ctx.font = 'bold 38px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 256, 48, 500);
      const texture = new T.CanvasTexture(canvas); this.textures.push(texture);
      const material = new T.SpriteMaterial({ map: texture, depthTest: false, transparent: true }); this.materials.push(material);
      const sprite = new T.Sprite(material); sprite.position.set(x, y, z); sprite.scale.set(w, h, 1); sprite.userData.text = text;
      sprite.userData.baseSize = [w, h]; (parent || this.scene).add(sprite); this.labels.push(sprite);
    }
    axisLabel(values, w, h, x, y, z, vertical, positions) {
      const T = root.THREE, canvas = document.createElement('canvas');
      const plotHeight = values.length * 60, padding = vertical ? 20 : 0;
      canvas.width = vertical ? 80 : Math.min(8192, values.length * 90); canvas.height = vertical ? plotHeight + padding * 2 : 60;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#b4d1dd';
      const fontSize = vertical ? Math.min(34, this.layout.pitch / h * plotHeight * .6) : 34;
      ctx.font = 'bold ' + fontSize + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      values.forEach((v, i) => ctx.fillText(v, vertical ? 40 : (i + .5) * canvas.width / values.length, vertical ? padding + plotHeight * (1 - positions[i] / h) : 30));
      const texture = new T.CanvasTexture(canvas); this.textures.push(texture);
      const material = new T.MeshBasicMaterial({ map: texture, side: T.DoubleSide, transparent: true, depthTest: false }); this.materials.push(material);
      // Extend both ends of the texture plane so labels at Y=0 or H stay visible at their actual coordinates.
      const geometry = new T.PlaneGeometry(w, vertical ? h * canvas.height / plotHeight : h); this.geometries.push(geometry);
      const plane = new T.Mesh(geometry, material); plane.position.set(x, y, z); plane.userData.axis = vertical ? 'levels' : 'bays'; plane.userData.values = values;
      if (vertical) plane.userData.positions = positions.slice();
      this.scene.add(plane); this.labels.push(plane);
    }
    selectCell(aisle, id) {
      if (this.fallback) return;
      const cell = this.rack[id]; if (!cell) return;
      this.highlight.position.set(cell.x, cell.y, aisle * this.stride + cell.z); this.highlight.visible = true; this.needsRender = true;
    }
    resize() {
      if (this.fallback) return;
      const w = this.container.clientWidth, h = this.container.clientHeight; if (!w || !h) return;
      if (this.lastWidth === w && this.lastHeight === h) return;
      this.lastWidth = w; this.lastHeight = h;
      this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.needsRender = true;
      this.lastRender = -Infinity; if (this.latestFleet) this.update(this.latestFleet);
    }
    setView(view, aisle = 0) {
      if (this.fallback) return;
      const c = this.config, all = view === 'iso', depth = all ? this.depth : 0, z = all ? depth / 2 : aisle * this.stride;
      const bounds = all ? this.bounds : Model.envelope(Model.aisleConfig(c, aisle)), cx = (bounds.xMin + bounds.xMax) / 2, cy = (bounds.yMin + bounds.yMax) / 2;
      const aspect = this.container.clientWidth / Math.max(1, this.container.clientHeight);
      const size = Math.max(bounds.width / Math.min(1.4, aspect), bounds.height * 1.8, depth * 1.2, 10);
      this.controls.target.set(cx, cy, z);
      if (view === 'front') this.camera.position.set(cx, cy, z + size * 1.6);
      else this.camera.position.set(cx + size * .6, cy + size * .7, z + size * 1.3);
      this.controls.update(); this.needsRender = true;
      this.lastRender = -Infinity; if (this.latestFleet) this.update(this.latestFleet);
    }
    update(fleet) {
      this.latestFleet = fleet;
      const engines = fleet.engines || [fleet];
      if (this.fallback) {
        this.container.innerHTML = '<p class="fallback-note">WebGL 미지원 · 전체 STC를 2D로 재생합니다.</p>' + engines.map((e, i) => '<div><b>STC ' + (i + 1) + '</b>' + root.STCCharts.rack(e.config, null, null, e) + '</div>').join(''); return;
      }
      let changed = false;
      engines.forEach((e, i) => {
        const a = this.aisles[i];
        const p = e.pose(), transfer = p.transfer;
        const effect = p.action?.effect, point = transfer?.point;
        const rackOverride = effect === 'pickOut' && transfer.onFork ? 'empty' : effect === 'placeIn' && !transfer.onFork ? 'occupied' : null;
        const transferKey = rackOverride ? point.id + ':' + rackOverride : '';
        if (a.engine !== e || a.lastVersion !== e.version || a.lastTransfer !== transferKey) {
          a.engine = e; a.lastVersion = e.version; changed = true;
          a.lastTransfer = transferKey;
          e.rack.forEach((cell, id) => {
            const state = rackOverride && point.id === id ? rackOverride : cell.state;
            const empty = state === 'empty' || state === 'reservedIn';
            this.dummy.position.set(cell.x, cell.y, a.z + cell.z); this.dummy.scale.setScalar(empty ? .18 : 1); this.dummy.updateMatrix();
            const index = i * this.rack.length + id; this.loads.setMatrixAt(index, this.dummy.matrix);
            this.color.set(empty ? 0x385366 : state === 'occupied' ? 0x47998d : 0xe0b05d); this.loads.setColorAt(index, this.color);
          });
        }
        const signature = [p.x.p, p.y.p, p.f.p, e.cargo, e.inSlots, e.outputCount, effect, transfer?.stage].join(',');
        if (signature !== a.lastPose) { a.lastPose = signature; this.needsRender = true; }
        a.crane.position.x = p.x.p; a.carriage.position.y = p.y.p; a.fork.position.z = p.f.p; a.cargo.visible = e.cargo !== null;
        a.cargo.position.set(0, 0, 0);
        if (transfer) {
          // During extension the source stays put; after lowering the destination stays put during retraction.
          a.cargo.visible = transfer.onFork || effect === 'pickIn' || effect === 'placeOut';
          if (!transfer.onFork) a.cargo.position.set(point.x - p.x.p, point.y - p.y.p, point.z - p.f.p);
        }
        a.queues.in.children.forEach((m, j) => { m.visible = j < e.inSlots; }); a.queues.out.children.forEach((m, j) => { m.visible = j < e.outputCount; });
      });
      if (changed) { this.loads.instanceMatrix.needsUpdate = true; this.loads.instanceColor.needsUpdate = true; this.needsRender = true; }
      if (this.controls.update()) this.needsRender = true;
      const now = performance.now();
      if (this.needsRender && now - this.lastRender >= 40) {
        for (const label of this.labels) if (label.isSprite) {
          const point = new root.THREE.Vector3(); label.getWorldPosition(point);
          const pixels = label.userData.text.startsWith('STC') ? 32 : 26;
          const size = 2 * this.camera.position.distanceTo(point) * Math.tan(this.camera.fov * Math.PI / 360) / Math.max(1, this.container.clientHeight) * pixels;
          label.scale.set(size * label.userData.baseSize[0] / label.userData.baseSize[1], size, 1);
        }
        this.renderer.render(this.scene, this.camera); this.lastRender = now; this.needsRender = false;
      }
    }
    dispose() {
      if (this.fallback) { this.container.replaceChildren(); return; }
      this.resizeObserver.disconnect(); this.controls.dispose();
      this.renderer.domElement.removeEventListener('pointerdown', this.down); this.renderer.domElement.removeEventListener('pointerup', this.up);
      this.geometries.forEach(g => g.dispose()); this.materials.forEach(m => m.dispose()); this.textures.forEach(t => t.dispose());
      this.renderer.dispose(); this.renderer.forceContextLoss(); this.container.replaceChildren();
    }
  }
  root.STCScene = { Scene };
})(globalThis);

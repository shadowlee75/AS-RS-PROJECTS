(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root, require('./engine.js'));
  else root.RGVScene = factory(root, root.RGVEngine);
})(globalThis, function (root, E) {
  'use strict';
  const clamp = x => Math.max(0, Math.min(1, x));
  // X is the actual travel coordinate. Y/Z and equipment dimensions are a schematic.
  function layout(c) {
    const unit = Math.min(1.2, Math.min(...c.sections.map(s => s.end - s.start)) / 4);
    const stride = unit * 7, lanes = c.sections.map((s, i) => ({ ...s, z: i * stride }));
    const ports = c.stations.map((s, i) => {
      const lane = lanes.find(l => s.x >= l.start - 1e-8 && s.x <= l.end + 1e-8);
      return { ...s, z: lane.z + (i % 2 ? 2.5 : -2.5) * unit, lane: lane.id };
    });
    const buffers = c.layout === 'tandem' ? c.handoffs.flatMap((b, i) => ['R', 'L'].map(direction => ({
      id: 'H' + i + direction, label: 'H' + (i + 1) + (direction === 'R' ? ' →' : ' ←'),
      x: lanes[i].end + (direction === 'R' ? -.8 : .8) * unit,
      z: (lanes[i].z + lanes[i + 1].z) / 2, capacity: b.capacity, boundary: i, direction
    }))) : [];
    return { unit, stride, lanes, ports, buffers, depth: lanes.at(-1).z };
  }
  function frameState(engine, diagram) {
    const moving = new Set(), u = diagram.unit;
    const cars = engine.cars.map((car, i) => {
      const p = engine.pose(car), lane = diagram.lanes[i], q = car.job?.quantity || 0;
      let cargo = car.loaded ? { x: p.x, y: u * 1.12, z: lane.z, quantity: q } : null;
      if (car.active && (car.state === 'load' || car.state === 'unload')) {
        const loading = car.state === 'load', point = car.leg[loading ? 'from' : 'to'];
        const port = (point.kind === 'station' ? diagram.ports : diagram.buffers).find(b => b.id === point.id);
        const t = car.active.duration ? clamp((engine.time - car.active.start) / car.active.duration) : 1;
        const f = loading ? 1 - t : t;
        cargo = { x: p.x + (port.x - p.x) * f, y: u * 1.12, z: lane.z + (port.z - lane.z) * f, quantity: q };
        if (loading) moving.add(car.job.id);
      }
      return { id: lane.id, name: lane.name, x: p.x, z: lane.z, speed: p.v, state: car.state,
        loaded: car.loaded, quantity: q, job: car.job?.id || '', reason: car.reason, cargo };
    });
    const stocks = [['station', engine.outputs], ['handoff', engine.buffers]].flatMap(([kind, stores]) => Object.values(stores).map(b => ({
      id: b.id, kind,
      count: engine.contents(b), reserved: b.reserved, capacity: b.capacity ?? b.buffer,
      visualCount: b.items.reduce((n, j) => n + (moving.has(j.id) ? 0 : j.quantity), 0)
    })));
    return { time: engine.time, cars, stocks };
  }
  class Scene {
    constructor(container, config, onSelect = () => {}) {
      this.container = container; this.config = config; this.onSelect = onSelect; this.diagram = layout(config);
      this.selected = 0; this.view = 'iso'; this.follow = false; this.labelsVisible = true; this.needsRender = true;
      this.geometries = []; this.materials = []; this.textures = []; this.labels = []; this.cars = []; this.stocks = [];
      this.lastRender = -Infinity; this.lastTime = null; this.disposed = false;
      if (!root.THREE || !root.THREE.OrbitControls) { this.fallback = true; return; }
      const T = root.THREE;
      try { this.renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); }
      catch (_) { this.fallback = true; return; }
      this.renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 1.5));
      this.renderer.setClearColor(0x122a3a); this.renderer.outputEncoding = T.sRGBEncoding;
      this.renderer.domElement.setAttribute('aria-label', '직선 RGV 3D 레일·차량·화물 시뮬레이션');
      this.renderer.domElement.setAttribute('role', 'img');
      container.replaceChildren(this.renderer.domElement); container.dataset.renderer = 'webgl';
      this.scene = new T.Scene(); this.camera = new T.PerspectiveCamera(42, 1, .001, 100000);
      this.controls = new T.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true; this.controls.dampingFactor = .1;
      this.controls.maxPolarAngle = Math.PI / 2.005; this.controls.minDistance = this.diagram.unit * .8;
      this.controls.maxDistance = Math.max(config.length, this.diagram.depth, 10) * 8;
      this.change = () => { this.needsRender = true; };
      this.controls.addEventListener('change', this.change);
      this.controls.addEventListener('start', () => { if (!this.follow) this.view = 'free'; });
      this.scene.add(new T.HemisphereLight(0xd9efff, 0x21323e, 1.15));
      const sun = new T.DirectionalLight(0xfff0d5, 1.15);
      sun.position.set(config.length * .4, 30, 20); this.scene.add(sun);
      this.unitGeometry = this.geometry(new T.BoxGeometry(1, 1, 1));
      this.palette = {
        floor: this.material(0x213e50), rail: this.material(0xa6beca), dark: this.material(0x132330),
        steel: this.material(0x486674), teal: this.material(0x2ba999), yellow: this.material(0xe9bc60),
        cargo: this.material(0xc99452), band: this.material(0xe1c78e), red: this.material(0xb96852),
        zone: this.material(0xb9893c), output: this.material(0x7aa2bb)
      };
      this.build();
      this.raycaster = new T.Raycaster(); this.pointer = new T.Vector2();
      this.down = event => { this.pointerStart = { x: event.clientX, y: event.clientY }; };
      this.up = event => {
        if (event.button !== 0 || !this.pointerStart || Math.hypot(event.clientX - this.pointerStart.x, event.clientY - this.pointerStart.y) > 5) return;
        const r = this.renderer.domElement.getBoundingClientRect();
        this.pointer.set((event.clientX - r.left) / r.width * 2 - 1, -(event.clientY - r.top) / r.height * 2 + 1);
        this.raycaster.setFromCamera(this.pointer, this.camera);
        const hits = this.raycaster.intersectObjects(this.cars.map(c => c.body), true);
        if (hits.length) { let obj = hits[0].object; while (obj && obj.userData.carIndex === undefined) obj = obj.parent;
          if (obj) { this.select(obj.userData.carIndex); this.onSelect(this.selected); }
        }
      };
      this.lost = event => { event.preventDefault(); this.fallback = true; this.lastFallbackTime = null; if (this.engine) this.update(this.engine); };
      this.renderer.domElement.addEventListener('pointerdown', this.down);
      this.renderer.domElement.addEventListener('pointerup', this.up);
      this.renderer.domElement.addEventListener('webglcontextlost', this.lost);
      this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(container);
      this.resize(); this.setView('iso');
    }
    geometry(g) { this.geometries.push(g); return g; }
    material(color, extra = {}) {
      const m = new root.THREE.MeshStandardMaterial({ color, roughness: .72, metalness: .2, ...extra });
      this.materials.push(m); return m;
    }
    box(w, h, d, x, y, z, material, parent = this.scene) {
      if (this.batching && parent === this.scene) {
        if (!this.staticBatches.has(material)) this.staticBatches.set(material, []);
        this.staticBatches.get(material).push([w, h, d, x, y, z]); return;
      }
      const mesh = new root.THREE.Mesh(this.unitGeometry, material);
      mesh.scale.set(w, h, d); mesh.position.set(x, y, z); parent.add(mesh); return mesh;
    }
    label(text, x, y, z, parent = this.scene, pixels = 15, color = '#c1dce4') {
      const T = root.THREE, canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 80;
      const ctx = canvas.getContext('2d');
      const texture = new T.CanvasTexture(canvas); this.textures.push(texture);
      const material = new T.SpriteMaterial({ map: texture, depthTest: false, transparent: true }); this.materials.push(material);
      const sprite = new T.Sprite(material); sprite.position.set(x, y, z); parent.add(sprite);
      sprite.userData = { canvas, ctx, texture, pixels, color, text: null, anchor: sprite.position.clone() }; this.labels.push(sprite); this.setLabel(sprite, text); return sprite;
    }
    setLabel(sprite, text) {
      const data = sprite.userData; if (data.text === text) return; data.text = text;
      data.ctx.clearRect(0, 0, 640, 80); data.ctx.font = '500 32px "Malgun Gothic", sans-serif';
      data.ctx.textAlign = 'center'; data.ctx.textBaseline = 'middle'; data.ctx.fillStyle = data.color;
      data.ctx.fillText(text, 320, 40, 624); data.width = Math.min(624, data.ctx.measureText(text).width);
      data.texture.needsUpdate = true; this.needsRender = true;
    }
    cargo(parent, count = 8) {
      const group = new root.THREE.Group(), u = this.diagram.unit;
      for (let i = 0; i < count; i++) {
        const load = new root.THREE.Group();
        this.box(.58 * u, .42 * u, .5 * u, 0, 0, 0, this.palette.cargo, load);
        this.box(.06 * u, .425 * u, .505 * u, 0, 0, 0, this.palette.band, load);
        this.box(.64 * u, .06 * u, .56 * u, 0, -.24 * u, 0, this.palette.band, load);
        load.position.set((i % 2 ? .34 : -.34) * u, Math.floor(i / 4) * .5 * u, (Math.floor(i / 2) % 2 ? .29 : -.29) * u);
        load.visible = false; group.add(load);
      }
      parent.add(group); return group;
    }
    build() {
      this.batching = true; this.staticBatches = new Map();
      const T = root.THREE, c = this.config, { unit: u, lanes, ports, buffers } = this.diagram, p = this.palette;
      const wheelGeometry = this.geometry(new T.CylinderGeometry(.2 * u, .2 * u, .16 * u, 16));
      const rollerGeometry = this.geometry(new T.CylinderGeometry(.06 * u, .06 * u, 1.22 * u, 10));
      for (const [i, lane] of lanes.entries()) {
        const span = lane.end - lane.start, center = (lane.start + lane.end) / 2;
        this.box(span + u * 2, .12 * u, 6.5 * u, center, -.13 * u, lane.z, p.floor);
        for (const dz of [-.56, .56]) this.box(span + .3 * u, .09 * u, .09 * u, center, .12 * u, lane.z + dz * u, p.rail);
        const ties = Math.min(100, Math.max(2, Math.ceil(span / (u * 1.5))));
        for (let j = 0; j <= ties; j++) this.box(.12 * u, .08 * u, 1.6 * u, lane.start + span * j / ties, .035 * u, lane.z, p.steel);
        for (const x of [lane.start, lane.end]) {
          this.box(.16 * u, .4 * u, 1.6 * u, x, .24 * u, lane.z, p.red);
          this.label(Number(x.toFixed(2)) + ' m', x, .3 * u, lane.z + 1.5 * u, this.scene, 13, '#91acba');
        }
        for (const zone of c.zones) {
          const a = Math.max(lane.start, zone.from), b = Math.min(lane.end, zone.to); if (b <= a) continue;
          this.box(b - a, .02 * u, 2.1 * u, (a + b) / 2, .015 * u, lane.z, p.zone);
          this.label('제한 ' + Number((zone.v * (c.speedUnit === 'm/min' ? 60 : 1)).toFixed(2)) + ' ' + c.speedUnit, (a + b) / 2, .1 * u, lane.z - 1.35 * u, this.scene, 12, '#d3b36d');
        }
        this.box(.6 * u, .02 * u, .6 * u, lane.home, .02 * u, lane.z - 1.1 * u, p.teal);
        const body = new T.Group(); body.name = 'RGV-' + lane.id; body.position.set(lane.home, 0, lane.z); body.userData.carIndex = i; this.scene.add(body);
        this.box(1.8 * u, .34 * u, 1.38 * u, 0, .43 * u, 0, p.yellow, body);
        this.box(1.52 * u, .1 * u, 1.28 * u, 0, .69 * u, 0, p.rail, body);
        this.box(.4 * u, .34 * u, .8 * u, -.68 * u, .75 * u, 0, p.teal, body);
        for (const x of [-.64, .64]) for (const z of [-.7, .7]) {
          const wheel = new T.Mesh(wheelGeometry, p.dark); wheel.rotation.x = Math.PI / 2; wheel.position.set(x * u, .27 * u, z * u); body.add(wheel);
        }
        for (let j = 0; j < 7; j++) {
          const roller = new T.Mesh(rollerGeometry, p.steel); roller.rotation.z = Math.PI / 2;
          roller.position.set(.12 * u, .8 * u, (j - 3) * .17 * u); body.add(roller);
        }
        const lampMaterial = this.material(0x52d9c0, { emissive: 0x164c42 });
        this.box(.12 * u, .2 * u, .12 * u, -.72 * u, 1.03 * u, -.38 * u, lampMaterial, body);
        const lineMat = new T.MeshBasicMaterial({ color: 0x69f1d1, wireframe: true, transparent: true, opacity: .7 }); this.materials.push(lineMat);
        const outline = this.box(2.04 * u, .7 * u, 1.62 * u, 0, .55 * u, 0, lineMat, body);
        outline.visible = i === 0;
        const label = this.label(lane.name || lane.id, 0, 2.3 * u, 0, body, 16, '#eef8f7');
        this.cars.push({ body, cargo: this.cargo(this.scene), label, lampMaterial, outline });
      }
      for (const port of ports) {
        this.platform(port.x, port.z, 1.8 * u, 1.7 * u, p.teal);
        this.label(port.id + ' · ' + port.name, port.x, 1.05 * u, port.z + (port.z < 0 ? -1.2 : 1.2) * u, this.scene, 15);
        const label = this.label('출고 0 / ' + port.buffer, port.x, .25 * u, port.z + (port.z < 0 ? -1.8 : 1.8) * u, this.scene, 12, '#85b5b7');
        const cargo = this.cargo(this.scene); cargo.position.set(port.x, 1.12 * u, port.z);
        this.stocks.push({ id: port.id, kind: 'station', label, cargo });
      }
      for (const b of buffers) {
        this.platform(b.x, b.z, 1.35 * u, 4.6 * u, p.output);
        this.label(b.label, b.x + (b.direction === 'R' ? -1.8 : 1.8) * u, 1.4 * u, b.z, this.scene, 14, '#efc785');
        const label = this.label('0 / ' + b.capacity, b.x + (b.direction === 'R' ? -1.8 : 1.8) * u, .65 * u, b.z, this.scene, 12, '#bbced7');
        const cargo = this.cargo(this.scene); cargo.position.set(b.x, 1.12 * u, b.z);
        this.stocks.push({ id: b.id, kind: 'handoff', label, cargo });
      }
      const dummy = new T.Object3D();
      for (const [material, boxes] of this.staticBatches) {
        const mesh = new T.InstancedMesh(this.unitGeometry, material, boxes.length);
        boxes.forEach(([w, h, d, x, y, z], i) => {
          dummy.scale.set(w, h, d); dummy.position.set(x, y, z); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
        });
        mesh.frustumCulled = false; this.scene.add(mesh);
      }
      this.batching = false; this.staticBatches.clear();
    }
    platform(x, z, w, d, material) {
      const u = this.diagram.unit;
      this.box(w, .14 * u, d, x, .7 * u, z, material);
      for (const dx of [-.38, .38]) for (const dz of [-.35, .35]) this.box(.09 * u, .64 * u, .09 * u, x + dx * w, .31 * u, z + dz * d, this.palette.steel);
      for (let j = 0; j < 6; j++) this.box(w * .86, .07 * u, .06 * u, x, .81 * u, z + (j - 2.5) * d / 7, this.palette.rail);
    }
    resize() {
      if (this.fallback || this.disposed) return;
      const w = this.container.clientWidth, h = this.container.clientHeight; if (!w || !h || (this.width === w && this.height === h)) return;
      this.width = w; this.height = h; this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
      if (this.view !== 'free') this.setView(this.view); this.needsRender = true;
    }
    setView(view) {
      this.view = view; if (this.fallback || this.disposed) return;
      const T = root.THREE, u = this.diagram.unit, car = this.cars[this.selected], focus = view === 'selected';
      const min = focus ? new T.Vector3(car.body.position.x - 2.8 * u, -.3 * u, car.body.position.z - 2.7 * u) : new T.Vector3(-3 * u, -.3 * u, -4.7 * u);
      const max = focus ? new T.Vector3(car.body.position.x + 2.8 * u, 2.6 * u, car.body.position.z + 2.7 * u) : new T.Vector3(this.config.length + 3 * u, 3 * u, this.diagram.depth + 4.7 * u);
      const center = min.clone().add(max).multiplyScalar(.5);
      const direction = view === 'front' ? new T.Vector3(0, .06, 1) : view === 'top' ? new T.Vector3(0, 1, .001) : new T.Vector3(.28, .7, 1);
      direction.normalize(); const right = new T.Vector3().crossVectors(new T.Vector3(0, 1, 0), direction).normalize();
      const up = new T.Vector3().crossVectors(direction, right), tanV = Math.tan(this.camera.fov * Math.PI / 360), tanH = tanV * this.camera.aspect;
      let distance = u;
      for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) {
        const point = new T.Vector3(x, y, z).sub(center), depth = point.dot(direction);
        distance = Math.max(distance, depth + Math.abs(point.dot(right)) / tanH, depth + Math.abs(point.dot(up)) / tanV);
      }
      this.controls.target.copy(center); this.camera.position.copy(center).addScaledVector(direction, distance * 1.14);
      this.controls.update(); this.needsRender = true; this.lastRender = -Infinity;
    }
    select(index) {
      this.selected = Math.max(0, Math.min(this.config.sections.length - 1, Number(index) || 0));
      this.cars.forEach((car, i) => { car.outline.visible = i === this.selected; });
      if (this.view === 'selected') this.setView('selected'); this.needsRender = true;
    }
    setLabels(visible) { this.labelsVisible = visible; this.labels.forEach(label => { label.visible = visible; }); this.needsRender = true; }
    update(engine) {
      if (this.disposed) return; this.engine = engine;
      if (this.fallback) {
        if (this.lastFallbackTime !== engine.time || this.lastFallbackEngine !== engine) {
          this.container.dataset.renderer = 'fallback';
          this.container.innerHTML = '<p class="fallback-note">3D를 사용할 수 없어 2D로 표시합니다. 설정 재적용 시 3D를 다시 시도합니다.</p>' + root.RGVView.layout(this.config, engine.snapshot());
          this.lastFallbackTime = engine.time; this.lastFallbackEngine = engine;
        } return;
      }
      this.resize(); const now = performance.now(); this.controls.update();
      if (now - this.lastRender < 30) return;
      if (this.lastTime !== engine.time || this.lastEngine !== engine) {
        const state = frameState(engine, this.diagram), selected = this.cars[this.selected], previous = selected.body.position.x;
        for (const [i, pose] of state.cars.entries()) {
          const car = this.cars[i]; car.body.position.x = pose.x;
          car.body.userData.pose = pose; car.cargo.visible = !!pose.cargo;
          if (pose.cargo) { car.cargo.position.set(pose.cargo.x, pose.cargo.y, pose.cargo.z); car.cargo.children.forEach((m, j) => { m.visible = j < pose.cargo.quantity; }); }
          const color = pose.state === 'blocked' ? 0xe57550 : pose.loaded ? 0x3fd2b2 : 0x9dbbcc;
          car.lampMaterial.color.setHex(color); this.setLabel(car.label, pose.id + ' · ' + E.states[pose.state]);
        }
        for (const stock of this.stocks) {
          const current = state.stocks.find(s => s.id === stock.id && s.kind === stock.kind);
          stock.cargo.children.forEach((m, j) => { m.visible = j < Math.min(8, current.visualCount); });
          this.setLabel(stock.label, (stock.kind === 'station' ? '출고 ' : '') + current.count + ' / ' + current.capacity + (current.reserved ? ' (예약 ' + current.reserved + ')' : ''));
          stock.cargo.userData.count = current.count; stock.cargo.userData.visualCount = current.visualCount;
        }
        if (this.follow && this.view === 'selected') {
          const dx = selected.body.position.x - previous; this.camera.position.x += dx; this.controls.target.x += dx;
        }
        this.lastTime = engine.time; this.lastEngine = engine; this.needsRender = true;
      }
      if (this.needsRender && this.width && this.height) {
        const T = root.THREE, point = new T.Vector3(), occupied = [];
        this.camera.updateMatrixWorld(); this.scene.updateMatrixWorld(true);
        const screenUp = new T.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
        const screenRight = new T.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
        for (const label of this.labels) {
          label.position.copy(label.userData.anchor); label.updateMatrixWorld(true);
          label.getWorldPosition(point);
          const depth = point.clone().applyMatrix4(this.camera.matrixWorldInverse).z;
          const unitsPerPixel = Math.max(.001, -depth) * 2 * Math.tan(this.camera.fov * Math.PI / 360) / this.height;
          const height = unitsPerPixel * label.userData.pixels * 2.5;
          label.scale.set(height * 8, height, 1);
          const projected = point.clone().project(this.camera), px = (projected.x + 1) * this.width / 2, py = (1 - projected.y) * this.height / 2;
          label.visible = this.labelsVisible && projected.z >= -1 && projected.z <= 1 && px > -20 && px < this.width + 20 && py > -20 && py < this.height + 20;
          if (!label.visible) continue;
          const w = Math.min(this.width - 12, label.userData.width / 32 * label.userData.pixels), h = label.userData.pixels + 5;
          const x = Math.max(w / 2 + 6, Math.min(this.width - w / 2 - 6, px)); let y = py;
          for (let pass = 0; pass < this.labels.length; pass++) {
            const hit = occupied.find(r => Math.abs(r.x - x) < (r.w + w) / 2 + 4 && Math.abs(r.y - y) < (r.h + h) / 2 + 3);
            if (!hit) break; y = hit.y - (hit.h + h) / 2 - 4;
          }
          if (y < h / 2) { label.visible = false; continue; }
          label.position.addScaledVector(screenUp, (py - y) * unitsPerPixel).addScaledVector(screenRight, (x - px) * unitsPerPixel);
          occupied.push({ x, y, w, h });
        }
        this.renderer.render(this.scene, this.camera); this.lastRender = now; this.needsRender = false;
      }
    }
    dispose() {
      this.disposed = true; this.resizeObserver?.disconnect(); this.controls?.dispose();
      if (this.renderer) {
        const canvas = this.renderer.domElement;
        canvas.removeEventListener('pointerdown', this.down); canvas.removeEventListener('pointerup', this.up); canvas.removeEventListener('webglcontextlost', this.lost);
        this.geometries.forEach(g => g.dispose()); this.materials.forEach(m => m.dispose()); this.textures.forEach(t => t.dispose());
        this.renderer.dispose(); this.renderer.forceContextLoss();
      }
      this.container.replaceChildren();
    }
  }
  return { layout, frameState, Scene };
});

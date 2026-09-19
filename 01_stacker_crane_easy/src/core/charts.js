(function (root) {
  'use strict';
  const M = root.STCMotion;
  const colors = { x: '#139caa', y: '#d38b30', f: '#577eda', idle: '#c0ced8', loaded: '#139caa', empty: '#7eb9c2', fork: '#577eda', position: '#d38b30', control: '#9dabb9', blocked: '#d96759' };
  const esc = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const fmt = (n, digits = 1) => Number.isFinite(n) ? n.toLocaleString('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
  function table(headers, rows) { return '<table><thead><tr>' + headers.map((h, i) => '<th' + (i ? ' class="num"' : '') + '>' + esc(h) + '</th>').join('') + '</tr></thead><tbody>' + rows.map(row => '<tr>' + row.map((v, i) => '<td' + (i ? ' class="num"' : '') + '>' + esc(v) + '</td>').join('') + '</tr>').join('') + '</tbody></table>'; }
  function line(series, options = {}) {
    const w = 500, h = options.height || 174, left = 44, right = 18, top = 17, bottom = 29;
    const xMax = options.xMax || Math.max(1, ...series.flatMap(s => s.points.map(p => p.x)));
    let lo = 0, hi = 0;
    for (const s of series) for (const p of s.points) { lo = Math.min(lo, p.y); hi = Math.max(hi, p.y); }
    if (hi === lo) hi = lo + 1;
    if (options.symmetric) { hi = Math.max(Math.abs(lo), Math.abs(hi)) * 1.18; lo = -hi; }
    else { const gap = hi - lo; hi += gap * 0.13; if (lo < 0) lo -= gap * 0.13; }
    const sx = x => left + x / xMax * (w - left - right), sy = y => top + (hi - y) / (hi - lo) * (h - top - bottom);
    let svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(options.label || '시계열 그래프') + '"' + (options.motion ? ' data-motion-chart="true" data-duration="' + xMax + '"' : '') + '>';
    for (let i = 0; i <= 4; i++) {
      const value = lo + (hi - lo) * i / 4, y = sy(value);
      svg += '<line x1="' + left + '" y1="' + y + '" x2="' + (w - right) + '" y2="' + y + '" stroke="#eaf0f4"/><text x="' + (left - 8) + '" y="' + (y + 3) + '" fill="#8f9fac" font-size="8" text-anchor="end">' + fmt(value, Math.abs(hi) > 50 ? 0 : 1) + '</text>';
    }
    for (let i = 0; i <= 5; i++) {
      const value = xMax * i / 5, x = sx(value);
      svg += '<line x1="' + x + '" y1="' + top + '" x2="' + x + '" y2="' + (h - bottom) + '" stroke="#f0f4f7"/><text x="' + x + '" y="' + (h - 10) + '" fill="#8f9fac" font-size="8" text-anchor="middle">' + fmt(value, xMax > 100 ? 0 : 1) + '</text>';
    }
    if (lo < 0) svg += '<line x1="' + left + '" y1="' + sy(0) + '" x2="' + (w - right) + '" y2="' + sy(0) + '" stroke="#b7c8d4" stroke-dasharray="3 3"/>';
    for (const s of series) {
      if (!s.points.length) continue;
      const path = s.points.map((p, i) => (i ? 'L' : 'M') + sx(p.x).toFixed(3) + ',' + sy(p.y).toFixed(3)).join(' ');
      if (options.fill) svg += '<path d="' + path + ' L' + sx(s.points.at(-1).x) + ',' + sy(0) + ' L' + sx(s.points[0].x) + ',' + sy(0) + ' Z" fill="' + s.color + '" opacity=".06"/>';
      svg += '<path d="' + path + '" fill="none" stroke="' + s.color + '" stroke-width="1.9" stroke-linejoin="round"/>';
    }
    if (options.motion) svg += '<line data-cursor x1="44" x2="44" y1="' + top + '" y2="' + (h - bottom) + '" stroke="#294b60" stroke-width="1" stroke-dasharray="3 3"/>';
    svg += '<text x="' + (w - right) + '" y="' + (h - 1) + '" fill="#9daab4" font-size="7" text-anchor="end">' + esc(options.xUnit || '시간 (s)') + '</text></svg>';
    return svg;
  }
  function motion(plan, mode, speedUnit = 'm/min') {
    const velocityFactor = speedUnit === 'm/min' ? 60 : 1;
    const samples = M.sampleTimes(plan).map(time => ({ time, pose: M.planAt(plan, time) }));
    const metrics = mode === 'pv' ? ['p', 'v'] : ['v', 'a'];
    const titles = { p: '위치 / m', v: '속도 / ' + speedUnit, a: '가속도 / m/s²' };
    return ['x', 'y', 'f'].map(axis => '<article class="axis-chart-card"><div class="axis-chart-heading"><h3><i class="dot ' + axis + '"></i>' + ({ x: '주행 X', y: '승강 Y', f: '포크 Z' })[axis] + '</h3><output id="motionValue-' + axis + '"></output></div><div class="chart-pair">' + metrics.map(metric => '<div><div class="chart-title">' + titles[metric] + '</div>' + line([{ color: colors[axis], points: samples.map(s => ({ x: s.time, y: s.pose[axis][metric] * (metric === 'v' ? velocityFactor : 1) })) }], { xMax: plan.duration, motion: true, symmetric: metric !== 'p', fill: true, label: ({ x: '주행', y: '승강', f: '포크' })[axis] + ' ' + titles[metric] }) + '</div>').join('') + '</div></article>').join('');
  }
  function timeline(plan) {
    let html = '<div class="card-heading" style="margin-bottom:8px"><h2>동작 순서</h2><span class="muted">전체 ' + fmt(plan.duration, 2) + ' s</span></div><svg viewBox="0 0 980 52" role="img" aria-label="사이클 동작 순서와 시간">';
    const segments = plan.actions.flatMap(a => a.type !== 'fork' ? [a] : [
      { label: '포크 OUT', shortLabel: 'OUT', start: 0, duration: a.fork.profile.duration, type: 'fork' },
      { label: '캐리지 ' + (a.pick ? 'UP' : 'DOWN') + ' ' + fmt(a.fork.lift.distance * 1000, 0) + ' mm', shortLabel: a.pick ? 'UP' : 'DOWN', start: a.fork.liftStart, duration: a.fork.lift.duration, type: 'position' },
      { label: '안착 대기', shortLabel: '안착', start: a.fork.liftEnd, duration: a.fork.dwell, type: 'control' },
      { label: '포크 IN', shortLabel: 'IN', start: a.fork.retractStart, duration: a.fork.profile.duration, type: 'fork' }
    ].filter(s => s.duration > 0).map(s => ({ ...s, start: a.start + s.start, label: a.label + ' · ' + s.label })));
    for (const a of segments) {
      const x = a.start / plan.duration * 980, w = a.duration / plan.duration * 980;
      const color = colors[a.type === 'move' ? (a.loaded ? 'loaded' : 'empty') : a.type];
      html += '<rect x="' + x + '" y="2" width="' + Math.max(0.2, w - 1) + '" height="24" rx="2" fill="' + color + '" opacity=".8"><title>' + esc(a.label) + ': ' + fmt(a.duration, 2) + ' s</title></rect>';
      if (w > (a.shortLabel ? 26 : 51)) html += '<text x="' + (x + w / 2) + '" y="18" font-size="8" text-anchor="middle" fill="white">' + esc(a.shortLabel || a.label) + '</text>';
      if (w > 40) html += '<text x="' + (x + w / 2) + '" y="43" font-size="8" text-anchor="middle" fill="#8c9da9">' + fmt(a.duration, 1) + 's</text>';
    }
    return html + '<line data-timeline-cursor x1="0" x2="0" y1="0" y2="29" stroke="#133b50" stroke-width="2"/></svg>';
  }
  function rack(c, a, b, engine) {
    const Model = root.STCModel, primary = Model.routeConfigs(c)[0].config, input = M.port(primary, 'in'), output = M.port(primary, 'out'), layout = Model.rackLayout(c), bounds = Model.envelope(c);
    const xMin = bounds.xMin - bounds.width * .09, xMax = bounds.xMax + bounds.width * .09;
    const yMin = bounds.yMin - bounds.height * .1, yMax = bounds.yMax + bounds.height * .1;
    const sx = x => 44 + (x - xMin) / (xMax - xMin) * 662, sy = y => 240 - (y - yMin) / (yMax - yMin) * 216;
    const bottom = layout.boundaries[0], top = layout.boundaries.at(-1), cellW = (sx(c.length) - sx(0)) / c.bays, cellH = sy(0) - sy(layout.pitch);
    let s = '<svg viewBox="0 0 750 290" role="img" aria-label="랙 화물 중심과 외부 입출고 포트 경로"><rect data-rack x="' + sx(0) + '" y="' + sy(top) + '" width="' + (sx(c.length) - sx(0)) + '" height="' + (sy(bottom) - sy(top)) + '" fill="#f4f8fa"/>';
    for (let i = 0; i <= c.bays; i++) s += '<line x1="' + sx(i * c.length / c.bays) + '" y1="' + sy(top) + '" x2="' + sx(i * c.length / c.bays) + '" y2="' + sy(bottom) + '" stroke="#c2d3dc" stroke-width=".7"/>';
    for (const y of layout.boundaries) s += '<line x1="' + sx(0) + '" y1="' + sy(y) + '" x2="' + sx(c.length) + '" y2="' + sy(y) + '" stroke="#c2d3dc" stroke-width=".7"/>';
    const pose = engine?.pose(), transfer = pose?.transfer;
    for (const cell of (engine ? engine.rack : Model.cells(c)).filter(p => p.side === -1)) {
      let state = cell.state;
      if (transfer?.point.id === cell.id) {
        if (pose.action.effect === 'pickOut' && transfer.onFork) state = 'empty';
        if (pose.action.effect === 'placeIn' && !transfer.onFork) state = 'occupied';
      }
      const color = !engine ? '#bfd5dd' : ['empty', 'reservedIn'].includes(state) ? '#e5edf1' : state === 'occupied' ? '#439e92' : '#e2a74e';
      s += '<rect data-cell="' + cell.id + '" data-x="' + cell.x + '" data-y="' + cell.y + '" x="' + (sx(cell.x) - cellW * .3 + (Model.depthCount(c) === 2 ? ((cell.depth || 1) - 1) * cellW * .32 : 0)) + '" y="' + (sy(cell.y) - cellH * .27) + '" width="' + cellW * (Model.depthCount(c) === 2 ? .28 : .6) + '" height="' + cellH * .54 + '" rx="1" fill="' + color + '" opacity=".7"><title>' + cell.bay + '번지 ' + cell.level + '단' + (cell.depth ? ' D' + cell.depth : '') + ' · 중심 (' + fmt(cell.x, 3) + ', ' + fmt(cell.y, 3) + ') m</title></rect>';
    }
    if (engine) {
      const pose = engine.pose(); s += '<line x1="' + sx(pose.x.p) + '" x2="' + sx(pose.x.p) + '" y1="' + sy(bounds.yMax) + '" y2="' + sy(bounds.yMin) + '" stroke="#e8a23c" stroke-width="4"/><rect x="' + (sx(pose.x.p) - 7) + '" y="' + (sy(pose.y.p) - 5) + '" width="14" height="10" fill="#123e52"/>';
    } else if (a && b) {
      s += '<path d="M' + sx(input.x) + ',' + sy(input.y) + ' L' + sx(a.x) + ',' + sy(a.y) + '" stroke="' + colors.x + '" stroke-width="2" fill="none"/><path d="M' + sx(a.x) + ',' + sy(a.y) + ' L' + sx(b.x) + ',' + sy(b.y) + ' L' + sx(output.x) + ',' + sy(output.y) + '" stroke="' + colors.y + '" stroke-width="1.8" stroke-dasharray="5 4" fill="none"/>';
      [a, b].forEach((p, i) => { const label = p.name || (i ? 'P2' : 'P1'); s += '<circle data-point="' + esc(label) + '" data-cell-id="' + (p.id ?? '') + '" cx="' + sx(p.x) + '" cy="' + sy(p.y) + '" r="5" fill="' + (i ? colors.y : colors.x) + '" stroke="white" stroke-width="1.5"/><text x="' + (sx(p.x) + 9) + '" y="' + (sy(p.y) - 8) + '" font-size="10" fill="#3b5a6e">' + esc(label) + '</text>'; });
    }
    for (let i = 1; i <= c.bays; i++) s += '<text x="' + sx((i - .5) * c.length / c.bays) + '" y="' + (sy(bottom) + 13) + '" text-anchor="middle" font-size="' + Math.min(9, cellW * .45) + '" fill="#647f91">' + i + '</text>';
    for (let i = 1; i <= c.levels; i++) s += '<text data-level="' + i + '" data-height="' + layout.heights[i - 1] + '" x="' + (sx(0) - 7) + '" y="' + (sy(layout.heights[i - 1]) + 3) + '" text-anchor="end" font-size="' + Math.min(9, cellH * .6) + '" fill="#647f91">' + i + '</text>';
    for (const route of Model.routeConfigs(c)) for (const [p, key, label, color, dy] of [[M.port(route.config, 'in'), 'in', 'E / IN', colors.x, -14], [M.port(route.config, 'out'), 'out', 'A / OUT', colors.y, 18]])
      s += '<circle data-port="' + key + '" cx="' + sx(p.x) + '" cy="' + sy(p.y) + '" r="6" fill="' + color + '" stroke="white" stroke-width="2"/><text x="' + sx(p.x) + '" y="' + (sy(p.y) + dy) + '" text-anchor="middle" fill="' + color + '" font-size="10">' + label + (Model.routeConfigs(c).length > 1 ? ' / ' + esc(route.id) : '') + '<title>XYZ (' + [p.x, p.y, p.z].map(v => fmt(v, 3)).join(', ') + ') m</title></text>';
    s += '<text x="375" y="278" text-anchor="middle" fill="#8ba0ad" font-size="10">랙 ' + fmt(c.length) + ' m · ' + c.bays + '번지 × ' + c.levels + '단 · ' + Model.depthName(c) + (Model.depthCount(c) === 2 ? ' (셀 좌/우: D1/D2)' : '') + ' · 포트 포함 X ' + fmt(bounds.xMin) + '~' + fmt(bounds.xMax) + ' m</text></svg>';
    return s;
  }
  root.STCCharts = { colors, esc, fmt, table, line, motion, timeline, rack };
})(globalThis);

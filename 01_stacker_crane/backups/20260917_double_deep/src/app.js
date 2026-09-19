(function () {
  'use strict';
  const M = STCMotion, Model = STCModel, E = STCEngine, C = STCCharts, R = STCReport;
  const $ = id => document.getElementById(id), fmt = C.fmt, esc = C.esc;
  const modeNames = { 'sc-return': 'SC · I/O 복귀', 'sc-stay': 'SC · 제자리 대기', dc: 'DC · 최대 페어링', mixed: 'SC / DC · 지정 비율' };
  const basisNames = { '': '미선택', assumption: '설계 가정', vendor: '벤더 사양', measured: '실측', ideal: '이상 조건' };
  let config, result, engine, scene, preview, previewIn, previewOut;
  let tab = 'overview', dirty = false, simPlaying = false, motionPlaying = false, motionTime = 0, lastFrame = 0, lastStats = 0;
  let speedUnit = Model.defaults.speedUnit, experimentToken = 0, experimentData = null, bulkToken = 0, toastTimer;
  function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500); }
  function clock(seconds) { const n = Math.floor(seconds); return [Math.floor(n / 3600), Math.floor(n / 60) % 60, n % 60].map(v => String(v).padStart(2, '0')).join(':'); }
  function metric(label, value, detail = '') { return '<div class="metric-row"><div><div class="label">' + esc(label) + '</div><div class="detail">' + esc(detail) + '</div></div><div class="value">' + value + '</div></div>'; }
  function unitFor(key) { const unit = Model.fields[key][1]; return unit === 'speed' ? speedUnit : unit === 'ratio' ? '비율 · 0~1' : unit === 'unit/h' ? (($('unit')?.value || 'PLT') + '/h') : unit; }
  function velocity(value) { return value * (config.speedUnit === 'm/min' ? 60 : 1); }
  function inputScale(key) { return key === 'transferLift' ? 1000 : ['vx', 'vy', 'vf'].includes(key) && speedUnit === 'm/min' ? 60 : 1; }
  function field(key) {
    const [label, , low, high, increment] = Model.fields[key], scale = inputScale(key), min = low * scale, max = high * scale, step = increment * scale;
    const speed = Model.fields[key][1] === 'speed';
    return '<div class="field"><label for="' + key + '">' + label + '<span class="unit" data-unit="' + key + '">' + unitFor(key) + '</span></label><input id="' + key + '" type="number" min="' + min + '" max="' + max + '" step="' + step + '"' + (speed ? ' aria-describedby="speedHint-' + key + '"' : '') + (['A', 'Ft', 'Ew'].includes(key) ? ' placeholder="미선택"' : ['firstLevelHeight', 'levelPitch'].includes(key) ? ' placeholder="자동" aria-describedby="rackHeightHint"' : '') + '>' + (speed ? '<small id="speedHint-' + key + '" class="speed-hint"></small>' : '') + '</div>';
  }
  const groups = {
    rackFields: ['length', 'height', 'bays', 'levels', 'sides', 'firstLevelHeight', 'levelPitch'], portFields: Model.portKeys, xFields: ['vx', 'ax', 'dx'], yFields: ['vy', 'ay', 'dy'],
    forkFields: ['stroke', 'vf', 'af', 'df', 'transferLift', 'forkDwell'], delayFields: ['position', 'control', 'loadedFactor'],
    flowFields: ['inbound', 'outbound', 'peak', 'cranes', 'targetUtil'], factorFields: ['A', 'Ft', 'Ew'],
    simFields: ['hours', 'warmup', 'seed', 'initialFill', 'inBuffer', 'outBuffer', 'takeaway', 'jitter']
  };
  for (const [id, keys] of Object.entries(groups)) $(id).innerHTML = keys.map(field).join('');
  function refreshUnits() {
    document.querySelectorAll('[data-unit]').forEach(label => { label.textContent = unitFor(label.dataset.unit); });
    for (const key of ['vx', 'vy', 'vf']) {
      const f = speedUnit === 'm/min' ? 60 : 1;
      $(key).min = Model.fields[key][2] * f; $(key).max = Model.fields[key][3] * f; $(key).step = speedUnit === 'm/min' ? 1 : 0.1;
    }
    refreshSpeedHints();
  }
  function refreshSpeedHints() {
    const unit = $('speedUnit').value, factor = unit === 'm/min' ? 60 : 1;
    for (const key of ['vx', 'vy', 'vf']) {
      const input = $(key), raw = input.value, value = Number(raw), [, , min, max] = Model.fields[key];
      const number = n => String(Number(n.toPrecision(6)));
      const equivalent = raw.trim() && Number.isFinite(value) ? (unit === 'm/min' ? number(value / 60) + ' m/s' : number(value * 60) + ' m/min') : '값을 입력하세요';
      $('speedHint-' + key).textContent = number(min * factor) + '~' + number(max * factor) + ' ' + unit + ' · ' + equivalent;
    }
  }
  function clearInputError() {
    $('error').hidden = true;
    document.querySelectorAll('#configForm [aria-invalid="true"]').forEach(input => { input.removeAttribute('aria-invalid'); });
  }
  function refreshRackHeights() {
    const c = Object.fromEntries(['height', 'levels', 'firstLevelHeight', 'levelPitch'].map(key => [key, $(key).value.trim() === '' ? null : Number($(key).value)]));
    if (!(c.height > 0 && Number.isInteger(c.levels) && c.levels >= 1 && c.levels <= Model.fields.levels[3])) { $('rackHeightHint').textContent = '랙 높이와 단수를 입력하면 단별 높이를 확인할 수 있습니다.'; return; }
    const layout = Model.rackLayout(c);
    $('rackHeightHint').textContent = '1단 ' + fmt(layout.first, 3) + ' m · 단간격 ' + fmt(layout.pitch, 3) + ' m · 최상단 ' + fmt(layout.top, 3) + ' m' + (layout.top > c.height ? ' · 랙 높이를 초과합니다.' : '');
  }
  function showInputError(error, focus = true) {
    clearInputError(); $('error').textContent = error.message; $('error').hidden = false;
    const input = error.field ? $(error.field) : null;
    if (!input) return;
    input.setAttribute('aria-invalid', 'true');
    const section = input.closest('details'); if (section) section.open = true;
    if (focus) {
      input.focus({ preventScroll: true });
      const sidebar = input.closest('.sidebar');
      if (sidebar) sidebar.scrollTop += input.getBoundingClientRect().top - sidebar.getBoundingClientRect().top - sidebar.clientHeight / 2 + input.offsetHeight / 2;
    }
  }
  function write(input) {
    speedUnit = input.speedUnit;
    for (const key of Object.keys(Model.defaults)) {
      if (key === 'ports' || key === 'routes') continue;
      let value = input[key]; if (value !== null && key in Model.fields) value *= inputScale(key);
      $(key).value = value === null ? '' : value;
    }
    renderPortTable(input.ports); renderRoutes(input.routes || []); refreshMix(); refreshCaseHelp(); refreshUnits(); refreshRackHeights();
  }
  function read(check = true) {
    const c = {}, displayUnit = $('speedUnit').value;
    for (const key of Object.keys(Model.defaults)) {
      if (key === 'ports') { c.ports = readPortTable(); continue; }
      if (key === 'routes') { c.routes = readRoutes(); continue; }
      const value = $(key).value;
      c[key] = key in Model.fields ? (value.trim() === '' ? (Model.nullable.includes(key) ? null : NaN) : Number(value)) : value;
      if (['vx', 'vy', 'vf'].includes(key) && displayUnit === 'm/min') c[key] /= 60;
      if (key === 'transferLift') c[key] /= 1000;
    }
    return check ? Model.validate(c) : c;
  }
  function readPortTable() {
    return [...$('portTable').querySelectorAll('tbody tr')].map(row => Object.fromEntries([...Model.portKeys, 'femCase'].map(key => {
      const value = row.querySelector('[data-port="' + key + '"]').value.trim(); return [key, value === '' ? null : Number(value)];
    })));
  }
  function renderPortTable(rows = []) {
    const n = Math.max(1, Math.min(100, Number($('cranes').value) || 1));
    $('portTable').innerHTML = '<table><thead><tr><th>STC</th>' + ['CASE', 'IN X', 'IN Y', 'IN Z', 'OUT X', 'OUT Y', 'OUT Z'].map(k => '<th>' + k + '</th>').join('') + '</tr></thead><tbody>' +
      Array.from({ length: n }, (_, i) => '<tr><th>' + (i + 1) + '</th><td><select data-port="femCase" aria-label="STC ' + (i + 1) + ' CASE">' + caseOptions(rows[i]?.femCase, true) + '</select></td>' + Model.portKeys.map(key => '<td><input type="number" step="0.1" data-port="' + key + '" aria-label="STC ' + (i + 1) + ' ' + key + '" placeholder="기본" value="' + esc(rows[i]?.[key] ?? '') + '"></td>').join('') + '</tr>').join('') + '</tbody></table>';
    window.STCHelp?.mountPorts();
  }
  function caseOptions(value, base = false) {
    return (base ? '<option value="">기본</option>' : '') + Model.caseNames.map((label, i) => '<option value="' + (i + 1) + '"' + (Number(value) === i + 1 ? ' selected' : '') + '>CASE ' + (i + 1) + ' · ' + label + '</option>').join('');
  }
  function refreshMix() {
    const enabled = $('mode').value === 'mixed', dc = Number($('dcRatio').value);
    $('scRatio').value = $('dcRatio').value.trim() === '' ? '' : Number((100 - dc).toFixed(6));
    for (const id of ['scRatio', 'dcRatio', 'ratioBasis']) $(id).disabled = !enabled;
    $('mixHint').textContent = enabled ? 'SC + DC = 100% · ' + ($('ratioBasis').value === 'cycles' ? 'SC 1회=화물 1개, DC 1회=입고 1개+출고 1개. 50:50이면 DC로 처리하는 화물은 약 66.7%입니다.' : '전체 화물 중 DC로 처리하는 비율입니다. 화물 50:50은 사이클 기준 SC 66.7% / DC 33.3%입니다.') : '비율을 입력하려면 운전 모드를 「SC / DC · 지정 비율」로 선택하세요.';
  }
  const routeKeys = ['aisle', 'id', 'femCase', 'weight', ...Model.portKeys];
  function readRoutes() {
    return [...$('routeTable').querySelectorAll('tbody tr')].map(row => Object.fromEntries(routeKeys.map(key => {
      const value = row.querySelector('[data-route="' + key + '"]').value.trim();
      return [key, key === 'id' ? value : value === '' ? (Model.portKeys.includes(key) ? null : NaN) : Number(value)];
    })));
  }
  function routeTotals() {
    const rows = readRoutes(), totals = new Map();
    for (const row of rows) totals.set(row.aisle, (totals.get(row.aisle) || 0) + row.weight);
    $('routeTotals').textContent = totals.size ? [...totals].map(([aisle, weight]) => 'STC ' + aisle + ': ' + fmt(weight, 3) + '%' + (Math.abs(weight - 100) > 1e-6 ? ' · 합계를 100%로 조정하세요' : '')).join(' / ') : '등록된 복합 조합이 없습니다. STC별 기본 포트를 사용합니다.';
    $('routeCount').textContent = rows.length ? rows.length + '개 조합 · ' + totals.size + '대 STC에 적용' : '기본 포트 사용 · 한 STC에 여러 CASE를 함께 배치하려면 구성 버튼을 누르세요.';
  }
  function renderRoutes(rows) {
    $('routeTable').innerHTML = '<table><thead><tr>' + ['STC', '조합 ID', 'CASE', '배분 %', 'IN X', 'IN Y', 'IN Z', 'OUT X', 'OUT Y', 'OUT Z', '편집'].map(h => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' + rows.map((row, i) => '<tr>' + routeKeys.map(key => '<td>' + (key === 'femCase' ? '<select data-route="femCase" aria-label="조합 ' + (i + 1) + ' CASE">' + caseOptions(row.femCase) + '</select>' : '<input data-route="' + key + '" aria-label="조합 ' + (i + 1) + ' ' + key + '" type="' + (key === 'id' ? 'text' : 'number') + '" ' + (key === 'id' ? 'maxlength="24"' : 'step="any"') + ' placeholder="CASE" value="' + esc(row[key] ?? '') + '">') + '</td>').join('') + '<td><button type="button" data-route-reset="' + i + '">좌표 초기화</button><button type="button" data-route-remove="' + i + '">삭제</button></td></tr>').join('') + '</tbody></table>';
    routeTotals();
  }
  function balanceRoutes(rows, aisle) {
    const chosen = rows.filter(row => row.aisle === aisle), sum = chosen.reduce((s, row) => s + (Number.isFinite(row.weight) && row.weight > 0 ? row.weight : 1), 0);
    let used = 0;
    chosen.forEach((row, i) => { row.weight = i === chosen.length - 1 ? Number((100 - used).toFixed(6)) : Number(((Number.isFinite(row.weight) && row.weight > 0 ? row.weight : 1) / sum * 100).toFixed(6)); used += row.weight; });
    return rows;
  }
  function refreshCaseHelp() { $('caseHelp').textContent = '참조 배치 ' + Model.caseConditions[Number($('femCase').value) - 1] + ' · E=IN, A=OUT · 실제 화물 중심 모드는 외부 포트를 유지합니다.'; }
  function selectedEngine() { return engine.engines[Number($('simAisle').value) || 0]; }
  function motionConfig() { return Model.routeConfigs(Model.aisleConfig(config, Number($('motionAisle').value) || 0))[Number($('motionRoute').value) || 0].config; }
  function refreshMotionRoutes() {
    const routes = Model.routeConfigs(Model.aisleConfig(config, Number($('motionAisle').value) || 0)), prior = Number($('motionRoute').value) || 0;
    $('motionRoute').innerHTML = routes.map((r, i) => '<option value="' + i + '">' + esc(r.id) + ' · CASE ' + r.femCase + '</option>').join('');
    $('motionRoute').value = Math.min(prior, routes.length - 1);
  }
  function showCell(id, aisle) {
    const cell = engine.engines[aisle].rack[id]; $('simAisle').value = aisle;
    $('cellBay').value = cell.bay; $('cellLevel').value = cell.level; $('cellSide').value = cell.side;
    $('cellInfo').textContent = Model.address(cell, aisle) + ' · 번지 ' + cell.bay + ' / ' + cell.level + '단 · XYZ (' + [cell.x, cell.y, cell.z].map(v => fmt(v, 2)).join(', ') + ') m · ' +
      ({ empty: '빈 셀', occupied: '보관 중', reservedIn: '입고 예약', reservedOut: '출고 예약' })[cell.state]; $('cellInfo').hidden = false;
    if (scene) scene.selectCell(aisle, id); renderPose();
  }
  function stopPlayback() {
    simPlaying = false; motionPlaying = false; bulkToken++;
    $('simPlay').textContent = '▶ 시뮬레이션 재생'; $('motionPlay').textContent = '▶ 동작 재생'; $('simFinish').disabled = false;
  }
  function stopExperiments(cancelled = true) {
    experimentToken++; $('runExperiments').disabled = false; $('cancelExperiments').disabled = true;
    if (cancelled && experimentData) $('experimentStatus').textContent = '실험을 중단했습니다. 완료된 반복만 표시합니다.';
  }
  function markDirty() {
    clearInputError();
    dirty = true; document.body.dataset.dirty = 'true'; $('dirtyNotice').hidden = false;
    stopPlayback(); stopExperiments();
  }
  function fresh() { if (!result || dirty) { toast('계산 및 설정 적용으로 현재 입력을 먼저 반영하세요.'); return false; } return true; }
  function resetEngine() {
    stopPlayback(); engine = new E.Fleet(config); engine.advanceTo(0);
    $('simSeek').value = 0; $('simEnd').textContent = clock(engine.horizon); $('cellInfo').hidden = true;
    renderSimulation();
  }
  function apply() {
    try {
      const next = read(), calculation = Model.calculate(next);
      stopPlayback(); stopExperiments(false);
      config = next; result = calculation; dirty = false; document.body.dataset.dirty = 'false';
      $('dirtyNotice').hidden = true; $('error').hidden = true;
      if (scene) { scene.dispose(); scene = null; }
      $('projectSubtitle').textContent = config.name + ' · ' + config.bays + ' Bay × ' + config.levels + ' Level · ' + modeNames[config.mode];
      $('factorIndicator').textContent = result.factor === null ? '미선택' : basisNames[config.basis];
      const nBay = Number($('previewBay').value), nLevel = Number($('previewLevel').value);
      $('previewBay').max = config.bays; $('previewLevel').max = config.levels;
      $('previewBay').value = Math.max(1, Math.min(config.bays, nBay || Math.ceil(config.bays * .67)));
      $('previewLevel').value = Math.max(1, Math.min(config.levels, nLevel || Math.ceil(config.levels * .67)));
      $('previewKind').querySelector('[value="dc"]').disabled = result.cells < 2;
      if (result.cells < 2) $('previewKind').value = 'in';
      for (const id of ['simAisle', 'motionAisle']) {
        const prior = Number($(id).value) || 0;
        $(id).innerHTML = Array.from({ length: config.cranes }, (_, i) => '<option value="' + i + '">STC ' + String(i + 1).padStart(2, '0') + '</option>').join('');
        $(id).value = Math.min(prior, config.cranes - 1);
      }
      for (const id of ['cellBay', 'previewOutBay']) { $(id).max = config.bays; $(id).value = Math.min(Number($(id).value) || 1, config.bays); }
      for (const id of ['cellLevel', 'previewOutLevel']) { $(id).max = config.levels; $(id).value = Math.min(Number($(id).value) || 1, config.levels); }
      for (const id of ['cellSide', 'previewSide', 'previewOutSide']) { $(id).querySelector('[value="1"]').disabled = config.sides === 1; if (config.sides === 1) $(id).value = '-1'; }
      $('fleetNotice').textContent = 'STC ' + config.cranes + '대 · 총 ' + calculation.totalCells.toLocaleString() + '셀을 모두 재현합니다. 전체 수요 균등 배분 · 독립 통로별 시드 · 고장 없는 조건 · 보정계수 추가 차감 없음';
      $('motionSource').value = config.method === 'fem' ? 'fem' : 'cell';
      $('motionSource').querySelector('[value="fem"]').disabled = config.method !== 'fem';
      refreshMotionRoutes(); buildPreview(); renderAnalysis(); resetEngine();
      experimentData = null; $('exportExperiments').disabled = true; $('experimentProgress').value = 0;
      $('experimentResults').innerHTML = '<p class="empty-state">실험을 실행하면 처리량, P95 대기, 종료 대기 작업이 표시됩니다.</p>';
      $('experimentStatus').textContent = '현재 적용 설정으로 실험할 수 있습니다.';
      if (tab === 'simulation') ensureScene();
      return true;
    } catch (error) {
      markDirty(); showInputError(error); return false;
    }
  }
  function kpi(label, value, unit, sub, featured = false) {
    return '<div class="kpi' + (featured ? ' featured' : '') + '"><div class="kpi-label">' + esc(label) + '</div><div class="kpi-value">' + value + '<small>' + esc(unit) + '</small></div><div class="kpi-sub">' + esc(sub) + '</div>' + (featured ? '<span class="kpi-accent">↗</span>' : '') + '</div>';
  }
  function renderAnalysis() {
    const r = result, c = config, u = c.unit + '/h';
    $('analysisKpis').innerHTML = kpi('이론 처리량 · STC 1', fmt(r.theory), u, c.method === 'fem' ? 'FEM CASE ' + [...new Set(r.routes.map(a => a.femCase))].join('/') : '균일 셀 평균', true) +
      kpi('보정 처리량 · STC 1', fmt(r.available), u, r.factor === null ? '보정계수와 근거 선택 필요' : 'A × Fₜ × E𝑤 = ' + fmt(r.factor, 3)) +
      kpi('피크 요구량 · 전체', fmt(r.demand), u, '입고 ' + fmt(c.inbound * c.peak) + ' + 출고 ' + fmt(c.outbound * c.peak)) +
      kpi('필요 독립 통로', fmt(r.required, 0), '대', '목표 부하율 ' + fmt(c.targetUtil * 100, 0) + '% · 설계 가정');
    const notes = [];
    if (r.factor === null) notes.push('이론 처리량을 계산했습니다. 보정 처리량과 필요 대수는 왼쪽의 「분석 보정계수」에서 값과 근거를 선택하면 표시됩니다.');
    else notes.push(r.worstUtil > c.targetUtil ? '최대 통로 부하율 ' + fmt(r.worstUtil * 100) + '%가 목표 ' + fmt(c.targetUtil * 100, 0) + '%를 초과합니다. 독립 통로 수와 운전 조건을 검토하세요.' : '분석상 목표 부하율 이내입니다. 실제 대기와 재고 변동은 시뮬레이션으로 확인하세요.');
    if (c.mode === 'sc-stay') notes.push('SC-stay의 분석값은 SC-return 참고값입니다.');
    if (c.mode === 'mixed') notes.push('사이클 기준 목표 SC ' + fmt((1 - r.mix.requested) * 100, 1) + '% / DC ' + fmt(r.mix.requested * 100, 1) + '% · 분석 적용 DC ' + fmt(r.p * 100, 1) + '%.' + (r.mix.limited ? ' 입출고 수요 불균형 또는 셀 수 때문에 듀얼 상한을 적용했습니다.' : ' 실제 달성 비율은 시뮬레이션에서 확인하세요.'));
    $('analysisNotice').textContent = notes.join(' '); $('analysisNotice').className = 'notice' + (r.worstUtil !== null && r.worstUtil > c.targetUtil ? ' warning' : '');
    $('rackCount').textContent = r.cells.toLocaleString() + '셀/STC × ' + c.cranes + '대 = ' + r.totalCells.toLocaleString() + '셀';
    const bounds = Model.envelope(c);
    $('travelEnvelope').textContent = '랙·포트 포함 범위: X ' + fmt(bounds.xMin, 3) + '~' + fmt(bounds.xMax, 3) + ' m · Y ' + fmt(bounds.yMin, 3) + '~' + fmt(bounds.yMax, 3) + ' m. 랙 길이와 셀 간격은 유지됩니다.';
    $('levelHeights').innerHTML = C.table(['단', '이재 높이 Y (m)'], Model.rackLayout(c).heights.map((y, i) => [i + 1, fmt(y, 3)]));
    $('rackDiagram').innerHTML = C.rack(Model.aisleConfig(c, 0), r.fem ? r.fem.inbound[0] : previewIn, r.fem ? r.fem.inbound[1] : previewOut);
    $('cycleSummary').innerHTML = metric('SC 입고 / SC 출고', fmt(r.scIn, 2) + ' / ' + fmt(r.scOut, 2) + ' <small>s</small>', 'STC 1 · 각 IN / OUT 포트 기준 복귀') + metric('복합 사이클 DC', fmt(r.dc, 2) + ' <small>s</small>', '입고 1건 + 출고 1건 · 이재 4회') + metric('적용 혼합 평균', fmt(r.cycle, 2) + ' <small>s/cycle</small>', '분석 DC 비율 ' + fmt(r.p * 100, 1) + '% / 전체 사이클');
    if (r.transition > 0) $('cycleSummary').innerHTML += metric('포트 전환 공차시간', fmt(r.transition, 2) + ' <small>s/cycle</small>', '혼합 평균에 포함 · 조합/방향 독립 선택 추정');
    const parts = [['이동', r.scParts.move, C.colors.x], ['포크', r.scParts.fork, C.colors.f], ['정위치', r.scParts.position, C.colors.y], ['제어', c.control, '#9dabb9']];
    $('cycleBreakdown').innerHTML = '<div class="stacked-bar">' + parts.map(p => '<span style="width:' + p[1] / r.sc * 100 + '%;background:' + p[2] + '"></span>').join('') + '</div><div class="breakdown-legend">' + parts.map(p => '<span style="color:' + p[2] + '">' + p[0] + ' ' + fmt(p[1]) + ' s</span>').join('') + '</div>';
    const capacities = [['피크 요구량', r.demand, C.colors.y], ['전체 이론 처리능력', r.theoryTotal, '#92b8be']];
    if (r.capacity !== null) capacities.push(['전체 보정 처리능력', r.capacity, '#138982']);
    const maximum = Math.max(...capacities.map(row => row[1]), 1);
    $('capacityBars').innerHTML = capacities.map(row => '<div class="bar-row"><div class="bar-label"><span>' + row[0] + '</span><strong>' + fmt(row[1]) + ' ' + u + '</strong></div><div class="bar-track"><span style="width:' + row[1] / maximum * 100 + '%;background:' + row[2] + '"></span></div></div>').join('');
    $('designDetails').innerHTML = '<dl class="small-grid"><div><dt>현재 독립 통로</dt><dd>' + c.cranes + '대</dd></div><div><dt>전체 설계 부하율</dt><dd>' + fmt(r.util === null ? null : r.util * 100) + '%</dd></div><div><dt>요구 대비 잔여능력</dt><dd>' + fmt(r.capacity === null ? null : r.capacity - r.demand) + '</dd></div></dl><p class="muted">독립 통로에 균등 배분하고 공통 I/O 병목이 없다는 가정입니다. DC ' + r.dcSampling.method + ' ' + fmt(r.dcSampling.samples, 0) + '쌍' + (r.dcSampling.se ? ' · 시간 표준오차 ' + fmt(r.dcSampling.se, 3) + ' s' : '') + '.</p>';
    renderFem();
    $('sensitivityTable').innerHTML = r.factor === null ? '<p class="empty-state">보정계수를 선택하면<br>능력 변화와 필요 통로 수를 비교합니다.</p>' : C.table(['계수', '변화', '적용값', '능력 (' + u + ')', '필요 대수'], Model.sensitivity(r).map(row => [row.key, (row.delta > 0 ? '+' : '') + fmt(row.delta * 100, 0) + '%', fmt(row.value, 3), fmt(row.capacity), row.required]));
  }
  function renderFem() {
    const r = result, c = config, all = r.allRoutes, xyz = p => [p.x, p.y, p.z].map(v => fmt(v, 3)).join(', ');
    const extended = r.fem && all.some(a => !a.fem.portMatch);
    $('femSummary').innerHTML = '<p>' + esc(r.reference) + '</p>' +
      (r.fem ? '<p class="notice ' + (extended || r.fem.alpha <= .5 || r.fem.alpha >= 2 ? 'warning' : 'subtle') + '">α = ' + fmt(r.fem.alpha, 3) + ' · 권고 범위 0.5 &lt; α &lt; 2 · ' + (c.pointMode === 'cell' ? '실제 화물 중심 P1·P2' : '이론 대표점 비교') + '</p><p>SC는 대표점별 복귀 평균, DC는 IN → P1 → P2 → OUT → IN입니다. CASE 2는 기본·대칭 경로를 평균합니다. 각 조합의 포트와 대표점을 계산·운동 그래프·3D에 적용합니다.</p>' : '<p>각 포트 조합에서 전체 셀 평균을 계산합니다. CASE는 배치 프리셋으로 사용합니다.</p>');
    const rack = Model.cells(c), rows = [];
    for (const a of all) if (a.fem) for (const p of [...a.fem.inbound, ...(a.femCase === 2 ? a.fem.outbound : [])]) {
      const near = p.id == null ? Model.nearestCell(rack, p) : p, ref = p.reference || p;
      rows.push([a.aisle, a.id, a.femCase, p.name, xyz(p), Model.address(near, a.aisle - 1), xyz(ref)]);
    }
    $('femPoints').innerHTML = rows.length ? C.table(['STC', '조합', 'CASE', '대표점', '적용 XYZ (m)', c.pointMode === 'cell' ? '적용 화물 셀' : '가까운 셀', '이론 XYZ'], rows) : '';
    $('referencePorts').innerHTML = extended ? C.table(['STC / 조합', '셀 선정 참조 IN XYZ', '셀 선정 참조 OUT XYZ', '좌우 반전'], all.map(a => [a.aisle + ' / ' + a.id, xyz(a.fem.referencePorts.in), xyz(a.fem.referencePorts.out), a.fem.mirroredLayout ? '적용' : '없음'])) : '';
    $('aisleAnalysis').innerHTML = C.table(['STC', '조합 수', 'SC 입고 s', 'SC 출고 s', 'DC s', '전환 공차 s/cycle', '혼합 평균 s/cycle', '이론 /h'], r.aisles.map(a => [a.aisle, a.routes.length, fmt(a.scIn, 2), fmt(a.scOut, 2), fmt(a.dc, 2), fmt(a.transition, 2), fmt(a.cycle, 2), fmt(a.theory, 2)]));
    $('routeAnalysis').innerHTML = C.table(['STC', '조합', 'CASE', '배분 %', 'IN XYZ (m)', 'OUT XYZ (m)', 'SC 입고 s', 'SC 출고 s', 'DC s'], all.map(a => [a.aisle, a.id, a.femCase, fmt(a.weight * 100, 3), xyz(a.ports.in), xyz(a.ports.out), fmt(a.scIn, 2), fmt(a.scOut, 2), fmt(a.dc, 2)]));
  }
  function buildPreview() {
    const c = motionConfig(), rack = Model.cells(c), kind = $('previewKind').value, source = $('motionSource').value;
    if (source === 'fem') {
      const f = Model.femPoints(c), route = c.femCase === 2 ? Number($('femRoute').value) : 0;
      previewIn = kind === 'dc' ? f.dcPairs[route][0] : f.inbound[0];
      previewOut = kind === 'dc' ? f.dcPairs[route][1] : f.outbound[0];
    } else {
      const cell = (bay, level, side) => rack.find(p => p.bay === Number($(bay).value) && p.level === Number($(level).value) && p.side === Number($(side).value));
      previewIn = cell('previewBay', 'previewLevel', 'previewSide'); previewOut = cell('previewOutBay', 'previewOutLevel', 'previewOutSide');
      if (!previewIn || !previewOut) throw Error('그래프 지점은 입력한 번지·단·보관면 범위 안이어야 합니다.');
      if (kind === 'dc' && previewIn.id === previewOut.id) throw Error('DC 입고 셀과 출고 셀은 서로 달라야 합니다.');
    }
    preview = M.plan(c, kind, M.port(c, kind === 'out' ? 'out' : 'in'), previewIn, previewOut, true);
    motionTime = 0; motionPlaying = false; $('motionPlay').textContent = '▶ 동작 재생';
    const label = p => source === 'fem' ? p.name + ' ' + (p.id == null ? '' : Model.address(p, Number($('motionAisle').value)) + ' ') + '(' + [p.x, p.y, p.z].map(v => fmt(v, 3)).join(', ') + ')' : Model.address(p, Number($('motionAisle').value));
    $('previewDescription').textContent = $('motionRoute').selectedOptions[0].textContent + ' · 입고 ' + label(previewIn) + ' · 출고 ' + label(previewOut) + ' · ' + (source === 'fem' && c.pointMode === 'theory' ? 'FEM 이론 좌표 비교' : '실제 화물 중심 경로') + ' · DC는 OUT→IN 공차 복귀 포함.';
    $('motionCharts').innerHTML = C.motion(preview, $('graphMode').value, config.speedUnit); $('motionTimeline').innerHTML = C.timeline(preview);
    const move = M.move(c, M.port(c, 'in'), previewIn, true);
    $('phaseTable').innerHTML = C.table(['축', '거리 (m)', '선도', '도달속도 (' + config.speedUnit + ')', '가속 (s)', '정속 (s)', '감속 (s)', '합계 (s)'],
      [['주행 X', move.x], ['승강 Y', move.y], ['랙 포크 Z', M.fork(c).profile], ['IN 포크 Z', M.fork(c, Math.abs(M.port(c, 'in').z)).profile], ['OUT 포크 Z', M.fork(c, Math.abs(M.port(c, 'out').z)).profile], ['캐리지 이재 UP / DOWN', M.fork(c).lift]]
        .map(([name, p]) => [name, fmt(p.distance, 2), p.shape, fmt(velocity(p.peak), 3), fmt(p.ta, 3), fmt(p.tc, 3), fmt(p.td, 3), fmt(p.duration, 3)]));
    updateMotion();
  }
  function updateMotion() {
    if (!preview) return;
    const pose = M.planAt(preview, motionTime), fraction = preview.duration ? motionTime / preview.duration : 0;
    $('motionPhase').textContent = pose.label;
    $('motionClock').textContent = fmt(motionTime, 2) + ' s'; $('motionSeek').value = fraction * 1000;
    document.querySelectorAll('[data-cursor]').forEach(line => { const x = 44 + fraction * 438; line.setAttribute('x1', x); line.setAttribute('x2', x); });
    const cursor = document.querySelector('[data-timeline-cursor]'); if (cursor) { cursor.setAttribute('x1', fraction * 980); cursor.setAttribute('x2', fraction * 980); }
    for (const axis of ['x', 'y', 'f']) $('motionValue-' + axis).textContent = fmt(pose[axis].p, 2) + ' m  ·  ' + fmt(velocity(pose[axis].v), 2) + ' ' + config.speedUnit + '  ·  ' + fmt(pose[axis].a, 2) + ' m/s²';
  }
  function ensureScene() {
    if (!scene && config) scene = new STCScene.Scene($('scene'), config, showCell);
    if (scene) { scene.resize(); scene.update(engine); }
  }
  function renderPose() {
    const chosen = selectedEngine(), pose = chosen.pose();
    $('simState').textContent = 'STC ' + (Number($('simAisle').value) + 1) + ' · ' + pose.label; $('simClock').textContent = clock(engine.time); $('simSeek').value = engine.time / engine.horizon * 1000;
    $('liveAxes').innerHTML = ['x', 'y', 'f'].map(axis => '<div><strong><i class="dot ' + axis + '"></i> ' + ({ x: '주행 X', y: '승강 Y', f: '포크 Z' })[axis] + '</strong><div class="values"><span><b>' + fmt(pose[axis].p, 2) + '</b> m</span><span><b>' + fmt(velocity(pose[axis].v), 2) + '</b> ' + config.speedUnit + '</span><span><b>' + fmt(pose[axis].a, 2) + '</b> m/s²</span></div></div>').join('');
  }
  function renderSimulation() {
    if (!engine) return;
    const s = engine.snapshot(), u = config.unit + '/h';
    $('simMix').textContent = '측정구간 완료 사이클 SC ' + s.measuredCycles.sc + '회 / DC ' + s.measuredCycles.dc + '회 · 실제 DC ' + (s.mix.actual === null ? '측정 전' : fmt(s.mix.actual * 100, 1) + '%') + ' · 분석 적용 DC ' + fmt(result.p * 100, 1) + '% / 사이클' + (config.mode === 'mixed' ? ' · 지정 DC ' + fmt(config.dcRatio, 1) + '% / ' + (config.ratioBasis === 'cycles' ? '사이클' : '화물') : '') + '. 재고·도착·버퍼 조건에 따라 실제 비율이 달라집니다.';
    $('measureStatus').textContent = s.time >= s.horizon ? '측정 종료' : s.measuredTime > 0 ? '측정 중' : '준비운전';
    $('liveKpis').innerHTML = metric('총 취급량', fmt(s.throughput) + ' <small>' + u + '</small>', '입고 ' + fmt(s.inboundRate) + ' / 출고 ' + fmt(s.outboundRate)) +
      metric('대기 작업', fmt(s.queued, 0) + ' <small>건</small>', '입고 ' + (s.inQueue + s.overflow) + ' / 출고 ' + s.outQueue) +
      metric('관측 가동률', fmt(s.busy * 100) + ' <small>%</small>', '출고 차단 포함 · 측정구간') + metric('P95 대기시간', fmt(s.p95Wait) + ' <small>s</small>', '배차된 작업 ' + s.waitSamples + '건') + metric('랙 재고', fmt(s.stock, 0) + ' <small>/ ' + result.totalCells + '</small>', '출고 운반 중 ' + s.outboundOnCrane + '개');
    $('inventoryEquation').textContent = '재고 검산 ' + (s.conservation ? '✓' : '오류') + '  ' + s.initialInventory + ' + ' + s.completed.in + ' − ' + s.completed.out + ' = ' + s.stock + ' + ' + s.outboundOnCrane;
    const series = engine.series.length ? engine.series : [{ time: 0, queue: 0, inventory: s.initialInventory }];
    $('queueChart').innerHTML = C.line([{ color: C.colors.y, points: series.map(p => ({ x: p.time / 60, y: p.queue })) }, { color: C.colors.x, points: series.map(p => ({ x: p.time / 60, y: p.inventory })) }], { xMax: engine.horizon / 60, height: 185, xUnit: '운전 시간 (min)', label: '시간에 따른 대기 작업 수와 랙 재고' });
    $('stateBars').innerHTML = Object.entries(s.stateTime).map(([key, value]) => '<div class="bar-row" style="margin-bottom:10px"><div class="bar-label"><span>' + E.stateNames[key] + '</span><span>' + fmt(value, 1) + ' s · ' + fmt(s.measuredTime ? value / s.machineTime * 100 : 0) + '%</span></div><div class="bar-track" style="height:6px"><span style="width:' + (s.measuredTime ? value / s.machineTime * 100 : 0) + '%;background:' + C.colors[key] + '"></span></div></div>').join('');
    $('simDetails').innerHTML = '<div class="status-grid"><div><small>작업 수 보존 · 전체 운전</small><b>' + (s.jobsConserved ? '정상' : '오류') + '</b><p>생성 ' + (s.created.in + s.created.out) + ' = 완료 ' + (s.completed.in + s.completed.out) + ' + 대기 ' + s.queued + ' + 진행 ' + s.inProgress + '</p></div><div><small>평균 / 최대 대기</small><b>' + fmt(s.meanWait) + ' / ' + fmt(s.maxWait) + ' s</b><p>미배차 최장 경과 ' + fmt(s.oldestPending) + ' s · 평균 대기열 ' + fmt(s.meanQueue) + '건</p></div><div><small>입고 초과 / 출고 차단</small><b>' + fmt(s.overflowTime) + ' / ' + fmt(s.stateTime.blocked) + ' s</b><p>입고 외부 대기 ' + s.overflow + '건 · 출고 버퍼 ' + s.output + '개</p></div><div><small>외부 출하량</small><b>' + fmt(s.shippingRate) + ' ' + u + '</b><p>전체 SC ' + s.cycles.sc + '회 / DC ' + s.cycles.dc + '회 · 출고 반출 ' + s.shipped + '개</p></div></div>';
    const warnings = [];
    if (s.starvedTime > 0) warnings.push('재고 부족 대기 ' + fmt(s.starvedTime) + ' s');
    if (s.fullTime > 0) warnings.push('랙 만재 대기 ' + fmt(s.fullTime) + ' s');
    if (s.saturated) warnings.push('대기 누적 / 포화 징후');
    if (config.inbound !== config.outbound) warnings.push('입출고 불균형으로 재고가 지속 변동할 수 있습니다.');
    if (config.arrival === 'poisson') warnings.push('Poisson 입출고는 재고 변동이 커질 수 있습니다.');
    if (!warnings.length) warnings.push('입출고 완료 수량과 대기 중인 작업을 함께 확인하세요. P95 대기는 아직 배차되지 않은 작업을 포함하지 않습니다.');
    $('simWarnings').textContent = warnings.join(' · '); $('simWarnings').style.marginTop = '20px'; $('simWarnings').style.marginBottom = '0';
    $('fleetTable').innerHTML = C.table(['STC', '동작', '현재 / 목표 셀', 'X / Y / Z (m)', '입고', '출고', '재고', '대기', '처리량 /h'], engine.engines.map((e, i) => {
      const p = e.pose(), local = s.aisles[i], target = e.active?.to || e.position;
      return [i + 1, p.label + (e.cycle ? ' · ' + e.routes[e.cycle.route].id + ' / CASE ' + e.cycle.config.femCase : ''), target.bay ? Model.address(target, i) : target.port ? target.port.toUpperCase() + ' 포트' : '—', [p.x.p, p.y.p, p.f.p].map(v => fmt(v, 2)).join(' / '), local.completed.in, local.completed.out, local.stock, local.queued, fmt(local.throughput)];
    }));
    renderPose(); if (scene && tab === 'simulation') scene.update(engine);
  }
  function selectTab(name) {
    tab = name; document.querySelectorAll('[data-tab]').forEach(button => { const active = button.dataset.tab === name; button.classList.toggle('active', active); button.setAttribute('aria-pressed', active); });
    document.querySelectorAll('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== name; });
    if (name === 'simulation') { ensureScene(); renderSimulation(); }
    if (name === 'motion') updateMotion();
  }
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  function fileName(suffix) { return config.name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 70) + suffix; }
  function experimentModes() { return ['sc-return', 'sc-stay', 'dc', ...(config.mode === 'mixed' ? ['mixed'] : [])]; }
  function renderExperiments() {
    const rows = [];
    for (const mode of experimentModes()) {
      const runs = experimentData.runs.filter(run => run.mode === mode);
      if (!runs.length) { rows.push([modeNames[mode], '0', '—', '—', '—', '—']); continue; }
      const throughput = E.interval95(runs.map(run => run.throughput));
      const wait = E.interval95(runs.map(run => run.p95Wait)), queue = E.interval95(runs.map(run => run.queued));
      rows.push([modeNames[mode], runs.length, fmt(throughput.mean, 2) + ' ± ' + fmt(throughput.ci95, 2), fmt(wait.mean), fmt(queue.mean), runs.filter(run => run.queued > 0).length + '/' + runs.length]);
    }
    $('experimentResults').innerHTML = C.table(['모드', '반복', '처리량 평균 ± 95% CI', 'P95 대기 평균 (s)', '종료 대기 평균', '대기 남은 반복'], rows);
  }
  async function experiments() {
    if (!fresh()) return;
    stopPlayback(); const token = ++experimentToken, n = Number($('repCount').value);
    experimentData = { schemaVersion: 'stc/experiment@1', config: { ...config }, seedBase: config.seed, repetitions: n, runs: [] };
    $('runExperiments').disabled = true; $('cancelExperiments').disabled = false; $('exportExperiments').disabled = true;
    try {
      for (let r = 0; r < n; r++) for (const mode of experimentModes()) {
        if (token !== experimentToken) return;
        const runConfig = { ...config, mode, seed: (config.seed + r) >>> 0 };
        const trial = new E.Fleet(runConfig);
        while (trial.time < trial.horizon) {
          if (token !== experimentToken) return;
          trial.advanceTo(Math.min(trial.horizon, trial.time + 900)); await new Promise(resolve => setTimeout(resolve, 0));
        }
        const s = trial.snapshot();
        experimentData.runs.push({ mode, repetition: r, seed: runConfig.seed, throughput: s.throughput, p95Wait: s.p95Wait, queued: s.queued, busy: s.busy,
          measuredCycles: s.measuredCycles, actualDCRatio: s.mix.actual, stock: s.stock, inProgress: s.inProgress, overflowTime: s.overflowTime, blockedTime: s.stateTime.blocked, conservation: s.conservation, jobsConserved: s.jobsConserved });
        $('experimentProgress').value = experimentData.runs.length / (n * experimentModes().length) * 100;
        $('experimentStatus').textContent = experimentData.runs.length + ' / ' + n * experimentModes().length + '회 완료 · ' + modeNames[mode] + ' · seed ' + runConfig.seed;
        $('exportExperiments').disabled = false; renderExperiments();
      }
      $('experimentStatus').textContent = n * experimentModes().length + '회 완료 · Student t 95% 신뢰구간 · 처리량 단위 ' + config.unit + '/h · 각 반복의 P95 대기 평균';
    } catch (error) { toast('실험 오류: ' + error.message); }
    finally { if (token === experimentToken) { $('runExperiments').disabled = false; $('cancelExperiments').disabled = true; } }
  }
  $('configForm').addEventListener('input', event => { if (event.target.id !== 'speedUnit') { markDirty(); if (['vx', 'vy', 'vf'].includes(event.target.id)) refreshSpeedHints(); if (['height', 'levels', 'firstLevelHeight', 'levelPitch'].includes(event.target.id)) refreshRackHeights(); } });
  $('configForm').addEventListener('change', event => { if (event.target.id !== 'speedUnit') { markDirty(); refreshUnits(); } });
  $('configForm').addEventListener('submit', event => { event.preventDefault(); apply(); });
  $('speedUnit').addEventListener('change', () => {
    const next = $('speedUnit').value, factor = next === 'm/min' ? 60 : 1 / 60;
    if (next !== speedUnit) for (const key of ['vx', 'vy', 'vf']) if ($(key).value.trim() !== '') $(key).value = Number((Number($(key).value) * factor).toPrecision(12));
    speedUnit = next; refreshUnits(); markDirty();
  });
  $('editPorts').addEventListener('click', () => { renderPortTable(readPortTable()); markDirty(); });
  $('clearPorts').addEventListener('click', () => { renderPortTable(); markDirty(); });
  $('cranes').addEventListener('change', () => { renderPortTable(readPortTable()); markDirty(); });
  $('femCase').addEventListener('change', refreshCaseHelp);
  for (const id of ['mode', 'ratioBasis', 'dcRatio']) $(id).addEventListener('input', refreshMix);
  $('scRatio').addEventListener('input', () => { $('dcRatio').value = $('scRatio').value.trim() === '' ? '' : Number((100 - Number($('scRatio').value)).toFixed(6)); refreshMix(); });
  $('editRoutes').addEventListener('click', () => { $('routeAisle').max = $('cranes').value; $('routeAisle').value = Math.min(Number($('routeAisle').value) || 1, Number($('cranes').value)); $('routeDialog').showModal(); });
  $('closeRoutes').addEventListener('click', () => $('routeDialog').close());
  $('routeTable').addEventListener('input', () => { routeTotals(); markDirty(); });
  $('routeTable').addEventListener('change', () => { routeTotals(); markDirty(); });
  function routeAisle() {
    const value = Number($('routeAisle').value);
    if (!Number.isInteger(value) || value < 1 || value > Number($('cranes').value)) throw Error('현재 STC 수 범위의 번호를 입력하세요.');
    return value;
  }
  $('addRoute').addEventListener('click', () => {
    try {
      const aisle = routeAisle(), rows = readRoutes(), chosen = rows.filter(r => r.aisle === aisle);
      if (chosen.length >= 6) throw Error('STC별 최대 6개 조합입니다.');
      let id = 1; while (chosen.some(r => r.id === 'R' + id)) id++;
      rows.push({ aisle, id: 'R' + id, femCase: Number($('femCase').value), weight: chosen.length ? 100 / chosen.length : 100 });
      renderRoutes(balanceRoutes(rows, aisle)); markDirty();
    } catch (error) { toast(error.message); }
  });
  $('sixRoutes').addEventListener('click', () => {
    try {
      const aisle = routeAisle(), rows = readRoutes();
      if (rows.some(r => r.aisle === aisle)) throw Error('CASE 1~6 예제는 복합 조합이 없는 STC에 추가할 수 있습니다.');
      for (let k = 1; k <= 6; k++) rows.push({ aisle, id: 'CASE' + k, femCase: k, weight: 1 });
      renderRoutes(balanceRoutes(rows, aisle)); markDirty();
    } catch (error) { toast(error.message); }
  });
  $('routeTable').addEventListener('click', event => {
    const remove = event.target.closest('[data-route-remove]'), reset = event.target.closest('[data-route-reset]');
    if (!remove && !reset) return;
    const rows = readRoutes(), index = Number((remove || reset).dataset[remove ? 'routeRemove' : 'routeReset']);
    if (remove) { const aisle = rows[index].aisle; rows.splice(index, 1); balanceRoutes(rows, aisle); }
    else for (const key of Model.portKeys) rows[index][key] = null;
    renderRoutes(rows); markDirty();
  });
  $('applyCase').addEventListener('click', () => {
    const c = read(false), p = Model.casePorts(c);
    for (const [key, value] of Object.entries(p)) $(key).value = value;
    if ([1, 3, 4].includes(Number(c.femCase))) $('outZ').value = $('ioZ').value;
    renderPortTable(readPortTable().map(row => ({ ...row, femCase: null, ioX: null, ioY: null, outX: null, outY: null, ...([1, 3, 4].includes(c.femCase) ? { outZ: row.ioZ } : {}) })));
    $('method').value = 'fem'; markDirty(); toast('CASE ' + c.femCase + ' 포트 배치를 입력했습니다. 계산 및 설정 적용을 눌러 반영하세요.');
  });
  $('findCell').addEventListener('click', () => { if (!fresh()) return; const i = Number($('simAisle').value), cell = engine.engines[i].rack.find(c => c.bay === Number($('cellBay').value) && c.level === Number($('cellLevel').value) && c.side === Number($('cellSide').value)); if (!cell) { toast('번지·단·면 입력이 랙 범위를 벗어났습니다.'); return; } ensureScene(); showCell(cell.id, i); });
  $('simAisle').addEventListener('change', () => { if (fresh()) { $('cellInfo').hidden = true; renderPose(); } });
  $('viewSelected').addEventListener('click', () => { if (fresh()) { ensureScene(); scene.setView('selected', Number($('simAisle').value)); } });
  for (const id of ['motionAisle', 'motionRoute', 'motionSource', 'femRoute']) $(id).addEventListener('change', () => { if (fresh()) { try { if (id === 'motionAisle') refreshMotionRoutes(); buildPreview(); } catch (e) { toast(e.message); } } });
  $('calculate').addEventListener('click', () => { if (apply()) toast('현재 설비 조건을 계산과 시뮬레이션에 적용했습니다.'); });
  $('resetDefaults').addEventListener('click', () => { write({ ...Model.defaults }); apply(); toast('예시 설비로 초기화했습니다.'); });
  $('assumedFactors').addEventListener('click', () => { $('A').value = .95; $('Ft').value = .95; $('Ew').value = 1; $('basis').value = 'assumption'; $('basisNote').value = '설계 검토 예시: A 0.95, Ft 0.95, Ew 1.0 (자동 운전 이상 조건). 실측값 아님.'; markDirty(); });
  $('idealFactors').addEventListener('click', () => { $('A').value = 1; $('Ft').value = 1; $('Ew').value = 1; $('basis').value = 'ideal'; $('basisNote').value = '고장·혼잡·작업효율 손실을 제외하는 이상 조건'; markDirty(); });
  document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => selectTab(button.dataset.tab)));
  $('refreshMotion').addEventListener('click', () => { if (!fresh()) return; try { buildPreview(); $('rackDiagram').innerHTML = C.rack(motionConfig(), previewIn, previewOut); } catch (error) { toast(error.message); } });
  $('previewKind').addEventListener('change', () => { if (fresh()) { try { buildPreview(); } catch (error) { toast(error.message); } } });
  $('graphMode').addEventListener('change', () => { if (fresh()) { $('motionCharts').innerHTML = C.motion(preview, $('graphMode').value, config.speedUnit); updateMotion(); } });
  $('motionPlay').addEventListener('click', () => { if (!fresh()) return; if (motionTime >= preview.duration) motionTime = 0; motionPlaying = !motionPlaying; $('motionPlay').textContent = motionPlaying ? 'Ⅱ 일시정지' : '▶ 동작 재생'; });
  $('motionReset').addEventListener('click', () => { motionPlaying = false; motionTime = 0; $('motionPlay').textContent = '▶ 동작 재생'; updateMotion(); });
  $('motionSeek').addEventListener('input', () => { if (!fresh()) return; motionPlaying = false; $('motionPlay').textContent = '▶ 동작 재생'; motionTime = Number($('motionSeek').value) / 1000 * preview.duration; updateMotion(); });
  $('motionCharts').addEventListener('pointermove', event => {
    const svg = event.target.closest('svg[data-motion-chart]'); if (!svg || motionPlaying || dirty) return;
    const rect = svg.getBoundingClientRect(), x = (event.clientX - rect.left) / rect.width * 500;
    motionTime = Math.max(0, Math.min(1, (x - 44) / 438)) * preview.duration; updateMotion();
  });
  $('simPlay').addEventListener('click', () => { if (!fresh()) return; bulkToken++; $('simFinish').disabled = false; if (engine.time >= engine.horizon) resetEngine(); simPlaying = !simPlaying; $('simPlay').textContent = simPlaying ? 'Ⅱ 일시정지' : '▶ 시뮬레이션 재생'; ensureScene(); });
  $('simStep').addEventListener('click', () => { if (!fresh()) return; stopPlayback(); const next = engine.heap.peek(); if (next) engine.advanceTo(Math.min(next.time, engine.horizon)); renderSimulation(); });
  $('simReset').addEventListener('click', () => { if (fresh()) resetEngine(); });
  $('simFinish').addEventListener('click', async () => {
    if (!fresh()) return; stopPlayback(); const token = ++bulkToken; $('simFinish').disabled = true;
    try {
      while (engine.time < engine.horizon && token === bulkToken) { engine.advanceTo(Math.min(engine.horizon, engine.time + 900)); renderSimulation(); await new Promise(resolve => setTimeout(resolve, 0)); }
      if (token === bulkToken) toast('시뮬레이션이 종료되었습니다.');
    } catch (error) { toast(error.message); }
    finally { if (token === bulkToken) $('simFinish').disabled = false; }
  });
  $('simSeek').addEventListener('change', () => { if (!fresh()) return; stopPlayback(); const target = Number($('simSeek').value) / 1000 * engine.horizon; if (target < engine.time) engine = new E.Fleet(config); engine.advanceTo(target); renderSimulation(); });
  $('viewFront').addEventListener('click', () => { ensureScene(); scene.setView('front', Number($('simAisle').value)); });
  $('viewIso').addEventListener('click', () => { ensureScene(); scene.setView('iso'); });
  $('saveProject').addEventListener('click', () => { try { const c = read(); const name = c.name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 70); download(name + '_프로젝트.json', JSON.stringify(Model.pack(c), null, 2), 'application/json;charset=utf-8'); toast('입력 설정을 JSON으로 저장했습니다.'); } catch (error) { showInputError(error); toast(error.message); } });
  $('loadProject').addEventListener('click', () => { $('projectFile').value = ''; $('projectFile').click(); });
  $('projectFile').addEventListener('change', async () => {
    const file = $('projectFile').files[0]; if (!file) return;
    try { if (file.size > 1000000) throw Error('프로젝트 JSON은 1MB 이하여야 합니다.'); const c = Model.unpack(JSON.parse(await file.text())); document.activeElement?.blur(); write(c); if (apply()) toast('프로젝트 설정을 불러왔습니다.'); }
    catch (error) { toast('불러오기 실패: ' + error.message); }
  });
  $('report').addEventListener('click', () => { if (fresh()) download(fileName('_계산서.md'), R.markdown(result, engine && engine.time > 0 ? engine.snapshot() : null), 'text/markdown;charset=utf-8'); });
  $('pdfReport').addEventListener('click', () => {
    if (!fresh()) return;
    stopPlayback();
    const s = engine && engine.time > 0 ? engine.snapshot() : null;
    $('pdfSimulationStatus').textContent = !s ? '시뮬레이션 미실행: 계산 결과를 보고서에 담습니다.' : s.time >= s.horizon ? '시뮬레이션 완료 결과를 담습니다.' : s.measuredTime > 0 ? '진행 중인 시뮬레이션의 현재 시점 결과이며, 보고서에 부분 결과로 표시합니다.' : '준비운전 중이며, 보고서에 측정 전으로 표시합니다.';
    $('pdfIncludeSim').disabled = !s; $('pdfError').hidden = true;
    $('pdfOptions').showModal();
  });
  $('pdfCancel').addEventListener('click', () => $('pdfOptions').close());
  $('pdfOptionsForm').addEventListener('submit', event => {
    event.preventDefault();
    if (!fresh()) { $('pdfOptions').close(); return; }
    let reportWindow;
    try {
      const html = STCPrint.document(result, engine && engine.time > 0 ? engine.snapshot() : null, {
        documentNo: $('pdfDocumentNo').value.trim(), recipient: $('pdfRecipient').value.trim(), author: $('pdfAuthor').value.trim(), reviewer: $('pdfReviewer').value.trim(),
        includeGraphs: $('pdfIncludeGraphs').checked, includeSimulation: $('pdfIncludeSim').checked,
        plan: preview, motionConfig: motionConfig(), inPoint: previewIn, outPoint: previewOut,
        aisle: Number($('motionAisle').value) || 0, routeDescription: $('previewDescription').textContent + ' / ' + $('previewKind').selectedOptions[0].textContent
      });
      reportWindow = window.open('', '_blank');
      if (!reportWindow) { $('pdfError').textContent = '보고서 새 창이 차단되었습니다. 이 파일의 팝업을 허용한 뒤 미리보기를 다시 눌러주세요.'; $('pdfError').hidden = false; return; }
      reportWindow.document.open(); reportWindow.document.write(html); reportWindow.document.close(); reportWindow.opener = null;
      $('pdfOptions').close();
    } catch (error) {
      if (reportWindow && !reportWindow.closed) reportWindow.close();
      $('pdfError').textContent = '보고서 생성 오류: ' + error.message; $('pdfError').hidden = false;
    }
  });
  $('exportSim').addEventListener('click', () => { if (!fresh()) return; const rows = [['job_id', 'STC', 'rack_address', 'port_x_m', 'port_y_m', 'port_z_m', 'kind', 'arrival_s', 'dispatch_s', 'complete_s', 'wait_s', 'lead_s', 'cycle', 'measurement_window', 'seed', 'port_route', 'fem_case']]; engine.logs.forEach(job => rows.push([job.id, job.aisle, job.address, job.port.x, job.port.y, job.port.z, job.kind, job.arrival, job.start, job.end, job.wait, job.lead, job.cycle, job.measured, job.seed, job.route, job.femCase])); download(fileName('_완료작업.csv'), R.csv(rows), 'text/csv;charset=utf-8'); });
  $('runExperiments').addEventListener('click', experiments); $('cancelExperiments').addEventListener('click', () => stopExperiments());
  $('exportExperiments').addEventListener('click', () => { if (fresh() && experimentData) download(fileName('_반복실험.json'), JSON.stringify(experimentData, null, 2), 'application/json;charset=utf-8'); });
  function frame(now) {
    const delta = lastFrame ? Math.min((now - lastFrame) / 1000, .15) : 0; lastFrame = now;
    try {
      if (engine && simPlaying && !dirty) {
        engine.advanceTo(Math.min(engine.horizon, engine.time + delta * Number($('simSpeed').value)));
        if (engine.time >= engine.horizon) { simPlaying = false; $('simPlay').textContent = '▶ 다시 재생'; renderSimulation(); }
      }
      if (motionPlaying && preview && !dirty) {
        motionTime = Math.min(preview.duration, motionTime + delta * Number($('motionSpeed').value)); updateMotion();
        if (motionTime >= preview.duration) { motionPlaying = false; $('motionPlay').textContent = '▶ 다시 재생'; }
      }
      if (tab === 'simulation' && scene && engine) { scene.update(engine); if (simPlaying) renderPose(); }
      if (simPlaying && now - lastStats > 350) { renderSimulation(); lastStats = now; }
    } catch (error) { stopPlayback(); toast('재생 오류: ' + error.message); }
    requestAnimationFrame(frame);
  }
  write({ ...Model.defaults }); apply(); requestAnimationFrame(frame);
})();

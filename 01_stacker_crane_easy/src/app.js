(function () {
  'use strict';
  const Easy = STCEasy, Model = STCModel, $ = id => document.getElementById(id), esc = STCCharts.esc;
  const fmt = (v, d = 1) => Number.isFinite(v) ? v.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
  const modeName = { 'sc-return': '단독 · 싱글', 'sc-stay': 'SC 위치 대기 · 복귀 참고값', dc: '복합 우선 · 듀얼', mixed: '싱글·듀얼 혼합' };
  let config = structuredClone(Easy.defaults), result = null, dirty = false, currentView = 'basic';
  function field(key) {
    const [label, unit, help, type] = Easy.fields[key], id = 'input-' + key;
    const numeric = key in Model.fields, optional = Model.nullable.includes(key);
    let control;
    if (type && typeof type === 'object') control = '<select id="' + id + '" data-key="' + key + '" aria-describedby="hint-' + key + '">' + Object.entries(type).map(([v, text]) => '<option value="' + esc(v) + '">' + esc(text) + '</option>').join('') + '</select>';
    else if (!numeric) control = '<input type="text" id="' + id + '" data-key="' + key + '" maxlength="300" aria-describedby="hint-' + key + '">';
    else {
      const [, , low, high] = Model.fields[key], f = Easy.scale(key);
      control = '<input type="number" inputmode="decimal" id="' + id + '" data-key="' + key + '" min="' + low * f + '" max="' + high * f + '" step="any"' + (optional ? ' placeholder="' + (key === 'operatingEfficiency' ? '미입력' : '자동') + '"' : '') + ' aria-describedby="hint-' + key + '">';
    }
    return '<div class="field' + (['name', 'mode', 'loadedFactor'].includes(key) ? ' wide' : '') + '" data-field="' + key + '"><label for="' + id + '">' + esc(label) + (unit ? '<span class="unit" data-unit="' + key + '">' + esc(unit) + '</span>' : '') + '</label>' + control + '<small id="hint-' + key + '">' + esc(help) + '</small></div>';
  }
  $('projectName').innerHTML = field('name');
  $('basicGroups').innerHTML = Easy.basicGroups.map((g, i) => '<article class="input-group"><div class="group-heading"><span class="group-index">' + (i + 1) + '</span><div><h3>' + g.title + '</h3><p>' + g.note + '</p></div></div><div class="fields">' + g.keys.map(field).join('') + '</div>' + (g.id === 'speed' ? '<p class="group-note">입력한 속도를 그대로 사용합니다. 적재 시 속도가 달라지면 「파라미터 설정 → 적재 사양 적용률」에서 조정하세요.</p>' : '') + '</article>').join('');
  $('parameterGroups').innerHTML = Easy.parameterGroups.map((g, i) => '<details class="parameter-group" id="group-' + g.id + '"' + (i === 0 ? ' open' : '') + '><summary><span class="group-index">' + String(i + 1).padStart(2, '0') + '</span><div><b>' + g.title + '</b><small>' + g.note + '</small></div></summary><div class="group-content"><div class="fields">' + g.keys.map(field).join('') + '</div>' + (g.id === 'method' ? '<p class="group-note">배치 유형을 선택한 후 좌표를 적용하세요. 실제 도면 위치가 다르면 입고·출고 위치를 직접 수정할 수 있습니다.</p><button type="button" id="applyCase">선택한 배치 좌표 적용</button>' : '') + (g.id === 'movement' ? '<p class="group-note" id="loadedExplanation"></p>' : '') + '</div></details>').join('');
  function notify(text) { $('message').textContent = text; $('message').hidden = false; }
  function clearError() { $('error').hidden = true; document.querySelectorAll('[aria-invalid]').forEach(e => e.removeAttribute('aria-invalid')); }
  function showError(error) {
    $('error').textContent = error.message; $('error').hidden = false;
    const input = $('input-' + error.field);
    if (input) {
      showView(input.closest('.view').id, false);
      const details = input.closest('details'); if (details) details.open = true;
      input.setAttribute('aria-invalid', 'true'); input.focus(); input.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } else $('error').scrollIntoView({ block: 'center' });
  }
  function read(overrides = {}) { return Easy.fromDisplay({ ...Object.fromEntries([...document.querySelectorAll('[data-key]')].map(e => [e.dataset.key, e.value])), ...overrides }, config); }
  const defaultParameterInputs = () => Object.fromEntries(Easy.parameterKeys.map(k => [k, Easy.display(Easy.defaults, k)]));
  function write(c) {
    config = c;
    document.querySelectorAll('[data-key]').forEach(e => { e.value = Easy.display(c, e.dataset.key); });
    ['inbound', 'outbound'].forEach(k => document.querySelector('[data-unit="' + k + '"]').textContent = c.unit + '/h');
    syncUI();
  }
  function syncUI() {
    const value = k => $('input-' + k).value;
    $('summaryEfficiency').textContent = value('operatingEfficiency') === '' ? '직접값 미입력' : value('operatingEfficiency') + '%';
    $('summaryLoaded').textContent = value('loadedFactor') + '%';
    $('summaryControl').textContent = value('control') + '초';
    document.querySelector('[data-field="dcRatio"]').hidden = value('mode') !== 'mixed';
    document.querySelector('[data-field="rearStroke"]').hidden = value('rackDepth') !== 'double';
    ['femCase', 'pointMode'].forEach(k => { document.querySelector('[data-field="' + k + '"]').hidden = value('method') !== 'fem'; });
    $('applyCase').hidden = value('method') !== 'fem';
    let count = 0;
    for (const key of Easy.parameterKeys) {
      const actual = value(key), standard = String(Easy.display(Easy.defaults, key));
      const changed = actual !== standard && !(actual !== '' && standard !== '' && Number(actual) === Number(standard));
      document.querySelector('[data-field="' + key + '"]').classList.toggle('modified', changed); if (changed) count++;
    }
    $('parameterCount').textContent = count ? '초기값에서 ' + count + '개 변경' : '예시 기본값 사용';
    const f = Number(value('loadedFactor')) / 100, vx = Number(value('vx')), vy = Number(value('vy'));
    $('loadedExplanation').textContent = Number.isFinite(f * vx * vy) ? '적재 시 적용 속도: 주행 ' + fmt(vx * f, 2) + ' m/min · 승강 ' + fmt(vy * f, 2) + ' m/min. 가속도·감속도와 캐리지 이재 승하강에도 같은 비율을 적용합니다. 포크 수평 속도는 포크 입력값을 사용합니다.' : '적재 사양 적용률에 따라 실제 이동 속도가 달라집니다.';
    const depthHint = value('rackDepth') === 'double' ? '더블딥의 뒷열 포크 거리는 파라미터에서 조정합니다. 빈칸이면 앞열의 2배를 사용합니다.' : Easy.fields.rackDepth[2];
    $('hint-rackDepth').textContent = depthHint;
    $('hint-dcRatio').textContent = config.ratioBasis === 'loads' ? '불러온 파일은 화물 개수 비율 기준입니다. 50% 화물 = 약 33.3% 사이클.' : Easy.fields.dcRatio[2];
  }
  function markDirty() {
    dirty = true; document.body.dataset.dirty = 'true';
    $('stateBadge').textContent = '입력 변경됨'; $('stateText').textContent = '계산 버튼을 눌러 결과에 반영하세요.';
    $('staleResult').hidden = !result; syncUI();
  }
  function showView(view, scroll = true) {
    if (view === 'results' && !result) { calculate(); return; }
    currentView = view;
    document.querySelectorAll('.view').forEach(e => { e.hidden = e.id !== view; });
    document.querySelectorAll('.step').forEach(e => { e.classList.toggle('active', e.dataset.view === view); if (e.dataset.view === view) e.setAttribute('aria-current', 'step'); else e.removeAttribute('aria-current'); });
    if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function calculate() {
    clearError();
    try {
      const c = read(), previous = result;
      const next = Model.calculate(c);
      config = c; result = next; dirty = false; document.body.dataset.dirty = 'false';
      renderResults(previous); $('staleResult').hidden = true;
      $('stateBadge').textContent = '계산 완료'; $('stateText').textContent = '현재 입력값이 모두 반영되었습니다.';
      showView('results');
    } catch (error) { showError(error); }
  }
  function metric(title, value, unit, detail, featured) {
    return '<article class="result-card' + (featured ? ' featured' : '') + '"><div class="metric-label">' + esc(title) + '</div><div class="metric-value">' + esc(value) + '<small>' + esc(unit) + '</small></div><div class="metric-detail">' + esc(detail) + '</div></article>';
  }
  function renderResults(previous) {
    const r = result, c = r.config, unit = c.unit + '/h';
    $('resultSubtitle').textContent = c.name + ' · ' + modeName[c.mode] + ' · ' + Model.depthName(c) + ' · STC ' + c.cranes + '대';
    $('resultCards').innerHTML = metric('효율을 반영한 처리량 · 1대', fmt(r.available), unit, Model.correctionText(r) + ' / 이론 ' + fmt(r.theory) + ' ' + unit, true) + metric('전체 크레인 처리능력', fmt(r.capacity), unit, c.cranes + '대 합계 · 피크 요구량 ' + fmt(r.demand) + ' ' + unit) + metric('목표 부하율 기준 필요 대수', fmt(r.required, 0), '대', '현재 ' + c.cranes + '대 · 목표 부하율 ' + fmt(c.targetUtil * 100) + '%');
    const noFactor = r.factor === null, insufficient = r.worstUtil !== null && r.worstUtil > c.targetUtil;
    $('judgement').className = 'judgement' + (noFactor || insufficient ? ' amber' : '');
    $('judgement').textContent = noFactor ? '운전효율이 미입력입니다. 파라미터에서 효율을 입력하면 보정 처리량과 필요 대수가 표시됩니다. 이론 처리량은 ' + fmt(r.theory) + ' ' + unit + '입니다.' : (insufficient ? '목표 설계 부하율을 초과합니다. 필요 대수 또는 설비 조건을 검토하세요.' : '입력한 요구량은 목표 설계 부하율 이내입니다.') + ' 전체 요구량 ' + fmt(r.demand) + ' ' + unit + ' / 설계 부하율 ' + fmt(r.worstUtil * 100) + '% / 목표 ' + fmt(c.targetUtil * 100) + '%.';
    const changes = previous ? Easy.changed(previous.config, c) : [];
    $('changeSummary').hidden = !changes.length;
    if (changes.length) {
      const descriptions = changes.slice(0, 5).map(k => Easy.fields[k][0] + ': ' + (Easy.display(previous.config, k) === '' ? '자동/미입력' : Easy.display(previous.config, k)) + ' → ' + (Easy.display(c, k) === '' ? '자동/미입력' : Easy.display(c, k)) + ' ' + Easy.fields[k][1]);
      const diff = r.available !== null && previous.available !== null ? r.available - previous.available : null;
      $('changeSummary').textContent = '이전 계산과 비교' + (diff === null ? '' : ': 1대 보정 처리량 ' + (diff >= 0 ? '+' : '') + fmt(diff, 2) + ' ' + unit) + '. ' + descriptions.join(' / ') + (changes.length > 5 ? ' 외 ' + (changes.length - 5) + '개' : '');
    }
    const rows = Easy.comparisons(r);
    $('cycleTable').innerHTML = '<table><thead><tr><th>비교 항목</th>' + rows.map(v => '<th>' + esc(v.label) + '</th>').join('') + '</tr></thead><tbody>' + [['1회 취급 수', ...rows.map(v => v.loads + '개')], ['평균 사이클 시간', ...rows.map(v => fmt(v.time, 2) + '초')], ['시간당 이론 처리량', ...rows.map(v => fmt(v.theory, 2) + ' ' + unit)], ['효율 반영 처리량', ...rows.map(v => fmt(v.available, 2) + ' ' + unit)]].map(row => '<tr>' + row.map(v => '<td>' + esc(v) + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
    $('appliedParameters').innerHTML = '<dl class="applied-list">' + [['운전효율', r.factor === null ? '미입력' : fmt(r.factor * 100, 2) + '%'], ['적재 사양 적용률', fmt(c.loadedFactor * 100) + '%'], ['제어 지연', fmt(c.control, 2) + '초 / 사이클'], ['정위치 확인', fmt(c.position, 2) + '초 / 이동'], ['피크 계수', fmt(c.peak, 2) + '배'], ['계산 방법', c.method === 'fem' ? 'FEM CASE ' + c.femCase : '전체 보관 셀 평균'], ['실제 계산 DC 비율', fmt(r.p * 100) + '% / 사이클']].map(([k, v]) => '<div><dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd></div>').join('') + '</dl>';
    $('storageCount').textContent = fmt(r.cells, 0) + '셀/대 · 전체 ' + fmt(r.totalCells, 0) + '셀';
    $('rackDiagram').innerHTML = rackSvg(r);
    const layout = Model.rackLayout(c);
    $('rackCaption').textContent = '랙 ' + c.length + ' m × ' + c.height + ' m · ' + c.bays + '칸 × ' + c.levels + '단 · 1단 높이 ' + fmt(layout.first, 3) + ' m · 단간격 ' + fmt(layout.pitch, 3) + ' m. 한 면의 측면도이며 격자는 보기 쉽게 간략화했습니다.';
    const notes = ['이론 처리량 = 3600 × (1 + 듀얼 사이클 비율) ÷ 평균 사이클 시간', '보정 처리량 = 이론 처리량 × 운전효율 ÷ 100', '필요 대수 = 올림(피크 요구량 ÷ 1대 보정 처리량 ÷ 목표 설계 부하율)'];
    $('calculationNotes').innerHTML = '<code>' + notes.map(esc).join('<br>') + '</code><p>' + esc(r.reference) + '</p><p>상단 처리량은 선택한 운전 방식과 입출고 수요 비중을 반영합니다. 사이클 비교표는 각 사이클의 연속 운전 환산값입니다. 운전효율은 처리량에 적용하고 물리적 사이클 시간은 바꾸지 않습니다.</p>' + (r.mix.limited ? '<p>입출고 수요가 불균형하거나 사용 가능한 셀 쌍이 없어 요청한 듀얼 비율을 제한했습니다. 계산 적용 비율은 ' + fmt(r.p * 100) + '%입니다.</p>' : '') + (c.mode === 'sc-stay' ? '<p>SC 작업 위치 대기는 SC 복귀 사이클 참고값입니다. 실제 운영 배차는 상세 프로그램의 시뮬레이션으로 확인하세요.</p>' : '') + (Model.depthCount(c) === 2 ? '<p>' + esc(Model.depthNote) + '</p>' : '') + '<p>독립 통로에 수요를 균등 배분하는 평균 능력 계산입니다. 재고·대기·공유 상하류 병목, 고장, creep 및 jerk 제어는 포함하지 않습니다. 초기 파라미터는 설계 예시이며 현장·장비 사양과 대조해 조정하세요.</p>';
  }
  function rackSvg(r) {
    const c = r.config, E = r.ports.in, A = r.ports.out;
    const xMin = Math.min(0, E.x, A.x), xMax = Math.max(c.length, E.x, A.x), yMin = Math.min(0, E.y, A.y), yMax = Math.max(c.height, E.y, A.y);
    const x = v => 62 + (v - xMin) / (xMax - xMin) * 636, y = v => 232 - (v - yMin) / (yMax - yMin) * 193;
    let svg = '<svg viewBox="0 0 760 280" role="img" aria-label="랙과 입고 출고 포트 배치"><defs><pattern id="dots" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="#deebe9"/></pattern></defs><rect x="30" y="15" width="702" height="237" rx="12" fill="url(#dots)"/><rect x="' + x(0) + '" y="' + y(c.height) + '" width="' + (x(c.length) - x(0)) + '" height="' + (y(0) - y(c.height)) + '" fill="#edf6f3" stroke="#82aaa3"/>';
    for (let i = 1; i < Math.min(c.bays, 40); i++) { const px = x(c.length * i / Math.min(c.bays, 40)); svg += '<path d="M' + px + ' ' + y(0) + 'V' + y(c.height) + '" stroke="#c3dbd5"/>'; }
    for (const h of Model.rackLayout(c).heights) svg += '<path d="M' + x(0) + ' ' + y(h) + 'H' + x(c.length) + '" stroke="#c3dbd5"/>';
    const pts = r.fem?.inbound || [];
    if (r.fem) svg += '<path d="M' + x(E.x) + ' ' + y(E.y) + 'L' + x(pts[0].x) + ' ' + y(pts[0].y) + 'L' + x(pts[1].x) + ' ' + y(pts[1].y) + 'L' + x(A.x) + ' ' + y(A.y) + '" fill="none" stroke="#16948d" stroke-width="2.5" stroke-dasharray="6 5"/>' + pts.map((p, i) => '<circle cx="' + x(p.x) + '" cy="' + y(p.y) + '" r="5" fill="#087c7d"/><text x="' + (x(p.x) + 9) + '" y="' + (y(p.y) - 9) + '" font-size="11" fill="#075d60">P' + (i + 1) + '</text>').join('');
    const same = E.x === A.x && E.y === A.y;
    for (const p of (same ? [{ ...E, label: '입고 / 출고' }] : [{ ...E, label: '입고' }, { ...A, label: '출고' }])) svg += '<rect x="' + (x(p.x) - 6) + '" y="' + (y(p.y) - 6) + '" width="12" height="12" rx="3" fill="#cd9c4d" stroke="white" stroke-width="2"/><text x="' + x(p.x) + '" y="' + (y(p.y) + 23) + '" text-anchor="middle" font-size="11" fill="#8d6632">' + p.label + '</text>';
    return svg + '<text x="380" y="22" text-anchor="middle" font-size="12" fill="#667c87">랙 길이 ' + c.length + ' m</text><text x="7" y="133" font-size="11" fill="#667c87">' + c.height + ' m</text></svg>';
  }
  function download(name, text, type) { const url = URL.createObjectURL(new Blob([text], { type })), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1500); }
  const safeName = text => text.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 70);
  function getAppliedResult() { if (dirty || !result) calculate(); if (dirty || !result || !$('error').hidden) throw Error('입력 오류를 확인한 뒤 다시 계산해주세요.'); return result; }
  $('calculator').addEventListener('submit', e => { e.preventDefault(); calculate(); });
  $('calculator').addEventListener('input', () => { clearError(); $('message').hidden = true; markDirty(); });
  $('calculator').addEventListener('change', () => { clearError(); markDirty(); });
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
  document.querySelector('.brand').addEventListener('click', e => { e.preventDefault(); showView('basic'); });
  $('openGuide').addEventListener('click', () => $('guide').showModal());
  $('closeGuide').addEventListener('click', () => $('guide').close());
  $('startGuide').addEventListener('click', () => { $('guide').close(); showView('basic'); });
  $('saveProject').addEventListener('click', () => { clearError(); try { const c = read(); download(safeName(c.name) + '_간편프로젝트.json', JSON.stringify(Easy.projectPack(c), null, 2), 'application/json'); notify('전체 입력을 프로젝트 파일로 저장했습니다.'); } catch (e) { showError(e); } });
  $('saveParameters').addEventListener('click', () => { clearError(); try { download('스태커크레인_파라미터.json', JSON.stringify(Easy.parameterPack(read()), null, 2), 'application/json'); notify('파라미터를 별도 파일로 저장했습니다. 다른 프로젝트에서도 설정 불러오기로 재사용할 수 있습니다.'); } catch (e) { showError(e); } });
  for (const [button, input] of [['loadProject', 'projectFile'], ['loadParameters', 'parameterFile']]) $(button).addEventListener('click', () => { $(input).value = ''; $(input).click(); });
  async function fileJson(input) { const f = input.files[0]; if (!f) return null; if (f.size > 1e6) throw Error('1 MB 이하의 프로젝트 또는 파라미터 JSON 파일을 선택하세요.'); try { return JSON.parse(await f.text()); } catch { throw Error('JSON 파일을 읽을 수 없습니다. 저장한 파일을 다시 선택하세요.'); } }
  $('projectFile').addEventListener('change', async () => { clearError(); try { const data = await fileJson($('projectFile')); if (!data) return; const c = Easy.projectUnpack(data); write(c); result = null; markDirty(); calculate(); notify('프로젝트를 불러왔습니다. 저장된 계산 조건과 효율을 적용했습니다.'); } catch (e) { showError(e); } });
  $('parameterFile').addEventListener('change', async () => { clearError(); try { const data = await fileJson($('parameterFile')); if (!data) return; const c = Easy.applyParameters(read(defaultParameterInputs()), data); write(c); markDirty(); showView('parameters'); notify('파라미터를 불러왔습니다. 기본 입력을 유지했으며, 계산 버튼을 누르면 결과에 반영됩니다.'); } catch (e) { showError(e); } });
  $('resetParameters').addEventListener('click', () => { clearError(); try { const c = read(defaultParameterInputs()); write(c); markDirty(); notify('파라미터를 간편판 예시 기본값으로 되돌렸습니다. 창고 크기·속도·요구량은 유지했습니다.'); } catch (e) { showError(e); } });
  $('applyCase').addEventListener('click', () => {
    clearError(); try {
      const c = read({ method: 'cells', pointMode: 'cell' });
      const ports = Model.casePorts(c);
      for (const [k, v] of Object.entries(ports)) $('input-' + k).value = v;
      if ([1, 3, 4].includes(c.femCase)) $('input-outZ').value = $('input-ioZ').value;
      markDirty(); $('group-ports').open = true; notify('선택한 CASE의 기본 X·Y 좌표를 적용했습니다. 포크 위치 Z와 실제 도면 치수를 확인하세요.');
    } catch (e) { showError(e); }
  });
  $('saveMarkdown').addEventListener('click', () => { try { const r = getAppliedResult(); download(safeName(r.config.name) + '_간편계산서.md', '간편판 v' + Easy.VERSION + ' · 평균 물동량 검토\n\n' + STCReport.markdown(r), 'text/markdown;charset=utf-8'); } catch (e) { showError(e); } });
  $('printReport').addEventListener('click', () => { try { const r = getAppliedResult(); const popup = window.open('', '_blank'); if (!popup) throw Error('보고서를 열려면 브라우저의 팝업 허용을 설정하세요.'); popup.document.open(); popup.document.write(STCPrint.document(r, null, { includeSimulation: false })); popup.document.close(); } catch (e) { showError(e); } });
  write(config); document.body.dataset.dirty = 'false';
})();

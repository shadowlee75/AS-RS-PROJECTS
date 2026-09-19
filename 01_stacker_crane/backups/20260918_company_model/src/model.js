(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./motion.js'));
  else root.STCModel = factory(root.STCMotion);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
  'use strict';
  const VERSION = '0.3.2', SCHEMA = 'stc/project@1';
  const defaults = {
    name: '스태커크레인 설계 검토', length: 60, height: 20, bays: 30, levels: 10, sides: 2, rackDepth: 'single', rearStroke: null, firstLevelHeight: null, levelPitch: null,
    ioX: 0, ioY: 0, ioZ: null, outX: null, outY: null, outZ: null, ports: [], method: 'cells', femCase: 1, pointMode: 'cell',
    vx: 3, ax: 0.5, dx: 0.6, vy: 1, ay: 0.5, dy: 0.5,
    stroke: 1.2, vf: 0.6, af: 0.8, df: 0.8, transferLift: .11, forkDwell: 1, position: 0.5, control: 0.5, loadedFactor: 1,
    inbound: 35, outbound: 35, peak: 1.2, cranes: 1, targetUtil: 0.8,
    A: null, Ft: null, Ew: null, basis: '', basisNote: '',
    mode: 'dc', dcRatio: 50, ratioBasis: 'cycles', routes: [], storage: 'random', retrieval: 'fifo', arrival: 'takt', jitter: 0.1,
    initialFill: 0.5, inBuffer: 8, outBuffer: 8, takeaway: 0,
    hours: 2, warmup: 10, seed: 20260909, unit: 'PLT', speedUnit: 'm/min'
  };
  const fields = {
    dcRatio: ['듀얼 작업 비율', '%', 0, 100, 1],
    length: ['랙 길이', 'm', 0.1, 500, 1], height: ['랙 높이', 'm', 0.1, 100, 1],
    bays: ['Bay 수', '개', 1, 200, 1], levels: ['Level 수', '단', 1, 30, 1],
    firstLevelHeight: ['1단 랙 이재 높이', 'm · 바닥 기준 Y', 0, 100, 0.01], levelPitch: ['단간격', 'm · 이재 높이 간격', 0.001, 100, 0.01],
    sides: ['보관면 수', '면', 1, 2, 1], ioX: ['IN · X 주행', 'm', -500, 500, 0.1], ioY: ['IN · Y 승강', 'm', -100, 100, 0.1],
    ioZ: ['IN · Z 포크', 'm', -10, 10, 0.1], outX: ['OUT · X 주행', 'm', -500, 500, 0.1], outY: ['OUT · Y 승강', 'm', -100, 100, 0.1], outZ: ['OUT · Z 포크', 'm', -10, 10, 0.1],
    femCase: ['FEM CASE', '', 1, 6, 1],
    vx: ['주행 최대속도', 'speed', 0.001, 20, 0.1], ax: ['주행 가속도', 'm/s²', 0.001, 20, 0.1], dx: ['주행 감속도', 'm/s²', 0.001, 20, 0.1],
    vy: ['승강 최대속도', 'speed', 0.001, 10, 0.1], ay: ['승강 가속도', 'm/s²', 0.001, 20, 0.1], dy: ['승강 감속도', 'm/s²', 0.001, 20, 0.1],
    stroke: ['포크 편도 스트로크 · 앞열', 'm', 0.001, 10, 0.1], rearStroke: ['뒷열 포크 편도 스트로크', 'm', 0.001, 20, 0.1], vf: ['포크 최대속도', 'speed', 0.001, 5, 0.1],
    af: ['포크 가속도', 'm/s²', 0.001, 20, 0.1], df: ['포크 감속도', 'm/s²', 0.001, 20, 0.1],
    transferLift: ['캐리지 이재 승하강량', 'mm', 0, 1, .001],
    forkDwell: ['이재 후 안착 대기', 's/이재', 0, 120, 0.1], position: ['정위치 시간', 's/이동', 0, 120, 0.1],
    control: ['제어 지연', 's/사이클', 0, 120, 0.1], loadedFactor: ['적재 속도·가감속 비율', 'ratio', 0.1, 1, 0.05],
    inbound: ['평균 입고 요구량', 'unit/h', 0, 5000, 1], outbound: ['평균 출고 요구량', 'unit/h', 0, 5000, 1],
    peak: ['피크 계수', '배', 1, 5, 0.1], cranes: ['독립 통로 / 크레인', '대', 1, 100, 1], targetUtil: ['목표 설계 부하율', 'ratio', 0.1, 1, 0.05],
    A: ['가용도 A', 'ratio', 0.01, 1, 0.01], Ft: ['교통계수 Fₜ', 'ratio', 0.01, 1, 0.01], Ew: ['작업효율 E𝑤', 'ratio', 0.01, 1, 0.01],
    jitter: ['일정간격 변동폭', 'ratio', 0, 0.95, 0.05], initialFill: ['초기 랙 충전률', 'ratio', 0, 1, 0.05],
    inBuffer: ['입고 버퍼 용량', '개', 1, 10000, 1], outBuffer: ['출고 버퍼 용량', '개', 1, 10000, 1],
    takeaway: ['출고 반출 간격', 's/개 · 0=즉시', 0, 3600, 1],
    hours: ['측정 시간', 'h', 0.05, 24, 0.25], warmup: ['준비운전 제외 시간', 'min', 0, 240, 1], seed: ['난수 시드', '', 0, 4294967295, 1]
  };
  const enums = { rackDepth: ['single', 'double'], method: ['cells', 'fem'], pointMode: ['cell', 'theory'], mode: ['sc-return', 'sc-stay', 'dc', 'mixed'], ratioBasis: ['cycles', 'loads'], storage: ['random', 'nearest'], retrieval: ['fifo', 'random', 'nearest'],
    arrival: ['takt', 'poisson'], basis: ['', 'assumption', 'vendor', 'measured', 'ideal'], unit: ['PLT', 'BOX', 'TOTE'], speedUnit: ['m/s', 'm/min'] };
  const integers = new Set(['femCase', 'bays', 'levels', 'sides', 'cranes', 'inBuffer', 'outBuffer', 'seed']);
  const portKeys = ['ioX', 'ioY', 'ioZ', 'outX', 'outY', 'outZ'];
  const nullable = ['A', 'Ft', 'Ew', 'ioZ', 'outX', 'outY', 'outZ', 'firstLevelHeight', 'levelPitch', 'rearStroke'];
  const depthCount = c => c.rackDepth === 'double' ? 2 : 1;
  const depthStroke = (c, depth = 1) => depth === 2 && depthCount(c) === 2 ? (c.rearStroke ?? c.stroke * 2) : c.stroke;
  const depthName = c => depthCount(c) === 2 ? '더블딥' : '싱글딥';
  const sameLane = (a, b) => a.side === b.side && a.bay === b.bay && a.level === b.level;
  const depthNote = '더블딥 분석은 앞열·뒷열 50:50, 접근 가능 조건의 평균입니다. 시뮬레이션은 뒷열부터 입고하고 앞열이 비어 있을 때만 뒷열에 접근합니다. FIFO는 접근 가능한 재고 내에서 적용하며 SKU 지정 출고·화물 재배치는 포함하지 않습니다.';
  function migrate(input) {
    // v0.1 used a common I/O and the full configured fork stroke.
    return { ...input, ioZ: input.ioZ ?? null, outX: input.outX ?? null, outY: input.outY ?? null, outZ: input.outZ ?? null,
      ports: input.ports ?? [], method: input.method ?? 'cells', femCase: input.femCase ?? 1,
      firstLevelHeight: input.firstLevelHeight ?? null, levelPitch: input.levelPitch ?? null, pointMode: input.pointMode ?? 'cell',
      transferLift: input.transferLift === undefined ? defaults.transferLift : input.transferLift,
      dcRatio: input.dcRatio === undefined ? 50 : input.dcRatio, ratioBasis: input.ratioBasis ?? 'cycles', routes: input.routes ?? [],
      rackDepth: input.rackDepth === undefined ? 'single' : input.rackDepth, rearStroke: input.rearStroke === undefined ? null : input.rearStroke };
  }
  function validate(input) {
    if (!input || typeof input !== 'object') throw Error('설정 객체가 필요합니다.');
    input = migrate(input);
    const c = {};
    for (const key of Object.keys(defaults)) {
      const value = input[key];
      if (key in fields) {
        if (nullable.includes(key) && value === null) { c[key] = null; continue; }
        const [label, unit, min, max] = fields[key];
        if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integers.has(key) && !Number.isInteger(value))) {
          const displayUnit = unit === 'speed' ? (input.speedUnit === 'm/min' ? 'm/min' : 'm/s') : unit;
          const scale = key === 'transferLift' ? 1000 : displayUnit === 'm/min' ? 60 : 1;
          const number = v => String(Number(v.toPrecision(12)));
          const suffix = unit === 'speed' || key === 'transferLift' ? ' ' + displayUnit : '';
          let message = label + ': ' + number(min * scale) + ' ~ ' + number(max * scale) + suffix + (integers.has(key) ? ' 범위의 정수' : ' 범위의 숫자') + '를 입력하세요.';
          if (unit === 'speed') {
            message += Number.isFinite(value) ? ' 현재 입력: ' + number(value * scale) + suffix + '.' : ' 값이 비어 있거나 숫자가 아닙니다.';
            if (displayUnit === 'm/s' && value > max && value / 60 >= min && value / 60 <= max)
              message += ' ' + number(value) + ' m/min을 뜻한다면 ' + number(value / 60) + ' m/s를 입력하거나, 단위를 m/min으로 바꾼 후 ' + number(value) + '을 다시 입력하세요.';
          }
          const error = Error(message); error.field = key; throw error;
        }
      } else if (key === 'routes') {
        if (!Array.isArray(value) || value.length > 600) throw Error('복합 포트 조합은 전체 600행, STC별 6행까지 입력할 수 있습니다.');
        c.routes = value.map((row, i) => {
          if (!row || typeof row !== 'object') throw Error('복합 포트 ' + (i + 1) + '행을 확인하세요.');
          const fail = message => { throw Error('복합 포트 ' + (i + 1) + '행: ' + message); };
          if (!Number.isInteger(row.aisle) || row.aisle < 1 || row.aisle > input.cranes) fail('STC 번호는 1~' + input.cranes + ' 범위입니다.');
          if (typeof row.id !== 'string' || !/^[A-Za-z0-9_-]{1,24}$/.test(row.id)) fail('조합 ID는 영문·숫자·_·- 1~24자입니다.');
          if (!Number.isInteger(row.femCase) || row.femCase < 1 || row.femCase > 6) fail('CASE는 1~6 정수입니다.');
          if (typeof row.weight !== 'number' || !Number.isFinite(row.weight) || row.weight <= 0 || row.weight > 100) fail('배분율은 0 초과~100%입니다.');
          const copy = { aisle: row.aisle, id: row.id, femCase: row.femCase, weight: row.weight };
          for (const k of portKeys) {
            if (row[k] == null) { copy[k] = null; continue; }
            if (typeof row[k] !== 'number' || !Number.isFinite(row[k]) || row[k] < fields[k][2] || row[k] > fields[k][3]) fail(k + ' 좌표 범위를 확인하세요.');
            copy[k] = row[k];
          }
          return copy;
        }); continue;
      } else if (key === 'ports') {
        if (!Array.isArray(value) || value.length > 100) throw Error('STC별 포트 설정은 최대 100행입니다.');
        c.ports = value.map((row, i) => {
          if (!row || typeof row !== 'object') throw Error('STC ' + (i + 1) + ' 포트 행이 올바르지 않습니다.');
          const copy = {};
          if (row.femCase != null) {
            if (!Number.isInteger(row.femCase) || row.femCase < 1 || row.femCase > 6) throw Error('STC ' + (i + 1) + ' CASE는 1~6 정수입니다.');
            copy.femCase = row.femCase;
          }
          for (const k of portKeys) {
            if (row[k] == null) { copy[k] = null; continue; }
            if (typeof row[k] !== 'number' || !Number.isFinite(row[k]) || row[k] < fields[k][2] || row[k] > fields[k][3]) throw Error('STC ' + (i + 1) + ' ' + k + ' 좌표는 ' + fields[k][2] + '~' + fields[k][3] + ' m 범위여야 합니다.');
            copy[k] = row[k];
          }
          return copy;
        }); continue;
      } else if (key in enums) {
        if (!enums[key].includes(value)) throw Error(key + '에 지원하지 않는 값이 있습니다.');
      } else if (typeof value !== 'string' || value.length > 300) throw Error(key + ': 300자 이내의 문자열이 필요합니다.');
      c[key] = value;
    }
    if (!c.name.trim()) throw Error('프로젝트명을 입력하세요.');
    if (depthCount(c) === 2 && depthStroke(c, 2) <= c.stroke) {
      const error = Error('뒷열 포크 편도 스트로크는 앞열 스트로크보다 커야 합니다. 통로 중심부터 뒷열 화물 중심까지의 총 거리를 입력하세요.');
      error.field = 'rearStroke'; throw error;
    }
    const layout = rackLayout(c);
    if (layout.top > c.height + 1e-9) {
      const error = Error('최상단 랙 이재 높이 ' + Number(layout.top.toFixed(6)) + ' m가 랙 높이 ' + c.height + ' m를 초과합니다. 1단 높이 + (단수−1) × 단간격을 확인하세요.');
      error.field = layout.first > c.height ? 'firstLevelHeight' : 'levelPitch'; throw error;
    }
    if (c.ports.length > c.cranes) throw Error('포트 행 수가 STC 수보다 많습니다. STC별 포트 표를 갱신하세요.');
    for (let i = 0; i < c.cranes; i++) {
      const local = aisleConfig(c, i);
      const rows = c.routes.filter(row => row.aisle === i + 1);
      if (rows.length > 6 || new Set(rows.map(row => row.id)).size !== rows.length) throw Error('STC ' + (i + 1) + ': 조합은 최대 6개이며 ID가 중복되면 안 됩니다.');
      if (rows.length && Math.abs(rows.reduce((s, row) => s + row.weight, 0) - 100) > 1e-6) throw Error('STC ' + (i + 1) + ': 복합 포트 배분율 합계를 100%로 입력하세요.');
      for (const route of routeConfigs(local)) {
      for (const kind of ['in', 'out']) {
        const p = M.port(route.config, kind);
        if (Math.abs(p.z) > depthStroke(c, depthCount(c)))
          throw Error('STC ' + (i + 1) + ' ' + kind.toUpperCase() + ': |Z|는 포크 스트로크 이하여야 합니다. X·Y는 랙 외부 좌표를 허용합니다.');
      }
      if (c.method === 'fem') femPoints(route.config);
      }
    }
    if (c.bays * c.levels * c.sides * depthCount(c) * c.cranes > 120000) throw Error('전체 랙 셀은 120,000개 이내로 입력하세요. 모든 STC와 깊이를 포함한 셀을 함께 재현하기 위한 한도입니다.');
    if ((c.inbound + c.outbound) * c.peak * (c.hours + c.warmup / 60) > 100000)
      throw Error('전체 예상 작업이 100,000건을 넘습니다. 측정 시간이나 수요를 줄이세요.');
    if ((c.inbound + c.outbound) * c.peak / c.cranes * (c.hours + c.warmup / 60) > 30000)
      throw Error('통로당 예상 작업이 30,000건을 넘습니다. 측정 시간이나 수요를 줄이세요.');
    return c;
  }
  function rng(seed) {
    let value = seed >>> 0;
    return function () { value += 0x6D2B79F5; let t = value; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function aisleConfig(c, index) {
    const local = { ...c, ports: [], routes: (c.routes || []).filter(r => r.aisle === index + 1).map(r => ({ ...r, aisle: 1 })) }, overrides = c.ports?.[index] || {};
    if (overrides.femCase != null) {
      local.femCase = overrides.femCase;
      Object.assign(local, casePorts({ ...local, ioX: 0, ioY: 0, outY: 0 }));
      if ([1, 3, 4].includes(local.femCase)) local.outZ = local.ioZ;
    }
    for (const key of portKeys) if (overrides[key] != null) local[key] = overrides[key];
    return local;
  }
  function routeConfigs(c) {
    const rows = (c.routes || []).filter(row => row.aisle === 1);
    if (!rows.length) return [{ id: 'BASE', weight: 1, femCase: c.femCase, config: { ...c, routes: [] } }];
    return rows.map(row => {
      const config = { ...c, ports: [], routes: [], femCase: row.femCase };
      Object.assign(config, casePorts({ ...config, ioX: 0, ioY: 0, outY: 0 }));
      if ([1, 3, 4].includes(config.femCase)) config.outZ = config.ioZ;
      for (const key of portKeys) if (row[key] != null) config[key] = row[key];
      return { id: row.id, weight: row.weight / 100, femCase: row.femCase, config };
    });
  }
  function portKey(c, kind) { const p = M.port(c, kind); return kind + ':' + [p.x, p.y, p.z].join(','); }
  function mix(c) {
    const total = c.inbound + c.outbound, n = c.bays * c.levels * c.sides;
    const limit = n < 2 ? 0 : total > 0 ? Math.min(c.inbound, c.outbound) / Math.max(c.inbound, c.outbound) : 1;
    const specified = c.dcRatio / 100;
    const requested = c.mode === 'mixed' ? (c.ratioBasis === 'loads' ? specified / (2 - specified) : specified) : c.mode === 'dc' ? 1 : 0;
    const p = Math.min(requested, limit), paired = total * p / (1 + p);
    const singlesIn = Math.max(0, c.inbound - paired), singlesOut = Math.max(0, c.outbound - paired), singles = singlesIn + singlesOut;
    return { requested, limit, p, loadRatio: 2 * p / (1 + p), limited: requested > limit + 1e-9,
      wIn: singles > 1e-9 ? singlesIn / singles : total > 0 ? c.inbound / total : .5 };
  }
  function address(cell, aisle = 0) {
    return 'STC' + String(aisle + 1).padStart(2, '0') + '-' + (cell.side < 0 ? 'A' : 'B') + '-' + String(cell.bay).padStart(3, '0') + '-' + String(cell.level).padStart(2, '0') + (cell.depth ? '-D' + cell.depth : '');
  }
  const caseNames = ['공용 포트 · 하단 모서리', 'IN·OUT · 하단 양 끝', '공용 포트 · 좌측 높이 이동', '공용 포트 · 하단 X 이동', 'IN 하단 · OUT 상부', 'IN 상부 · OUT 하단'];
  const caseConditions = ['E=A=(0,0)', 'E=(0,0), A=(L,0)', 'E=A=(0,h), 0<h≤H', 'E=A=(x,0), 0<x≤L', 'E=(0,0), A=(0,h), 0<h≤H', 'E=(0,h), A=(0,0), 0<h≤H'];
  function casePorts(c) {
    const k = Number(c.femCase), L = c.length, H = c.height;
    const h = (c.ioY > 0 ? c.ioY : (c.outY > 0 ? c.outY : H / 2));
    const x = c.ioX > 0 ? c.ioX : L / 2;
    const xy = k === 1 ? [0, 0, 0, 0] : k === 2 ? [0, 0, L, 0] : k === 3 ? [0, h, 0, h] : k === 4 ? [x, 0, x, 0] : k === 5 ? [0, 0, 0, h] : [0, h, 0, 0];
    return { ioX: xy[0], ioY: xy[1], outX: xy[2], outY: xy[3] };
  }
  function femPortMatch(c) {
    const L = c.length, H = c.height, E = M.port(c, 'in'), A = M.port(c, 'out'), k = c.femCase;
    const eq = (a, b) => Math.abs(a - b) < 1e-8, zero = a => eq(a, 0), same = eq(E.x, A.x) && eq(E.y, A.y) && eq(E.z, A.z);
    const good = [same && zero(E.x) && zero(E.y), zero(E.x) && zero(E.y) && eq(A.x, L) && zero(A.y),
      same && zero(E.x) && E.y > 0 && E.y <= H, same && zero(E.y) && E.x > 0 && E.x <= L,
      zero(E.x) && zero(E.y) && zero(A.x) && A.y > 0 && A.y <= H,
      zero(E.x) && E.y > 0 && E.y <= H && zero(A.x) && zero(A.y)][k - 1];
    return good;
  }
  function femReference(c) {
    const L = c.length, H = c.height, E = M.port(c, 'in'), A = M.port(c, 'out'), k = c.femCase;
    if (!femPortMatch(c)) throw Error('FEM CASE ' + k + ' 이론 좌표 비교의 포트 조건: ' + caseConditions[k - 1] + ([1, 3, 4].includes(k) ? ' · 공용 포트의 Z도 같아야 합니다.' : '') + ' 외부 포트는 「실제 화물 중심」으로 계산하세요.');
    const point = (x, y, name) => ({ x, y, z: -c.stroke, side: -1, name });
    let p1 = point(L / 5, 2 * H / 3, 'P1'), p2 = point(2 * L / 3, H / 5, 'P2');
    if (k === 3) {
      p1.y = E.y <= H / 2 ? 2 * H / 3 + E.y / 3 : E.y / 3;
      p2.y = E.y <= H / 2 ? H / 5 + E.y / 3 : 7 * H / 15 + E.y / 3;
    }
    if (k === 4) {
      p1.x = E.x <= L / 2 ? L / 5 + E.x / 3 : 7 * L / 15 + E.x / 3;
      p2.x = E.x <= L / 2 ? 2 * L / 3 + E.x / 3 : E.x / 3;
    }
    if (k === 5 || k === 6) { const h = k === 5 ? A.y : E.y; p1.y += h / 6; p2.y += h / 6; }
    const mirrored = [point(L - p1.x, p1.y, 'P1′'), point(L - p2.x, p2.y, 'P2′')];
    return { case: k, name: caseNames[k - 1], condition: caseConditions[k - 1], E, A,
      inbound: [p1, p2], outbound: k === 2 ? mirrored : [p1, p2], dcPairs: k === 2 ? [[p1, p2], mirrored] : [[p1, p2]],
      alpha: H / L * c.vx / c.vy };
  }
  function nearestCell(rack, point, excludedId = null) {
    let nearest = null, distance = Infinity;
    for (const cell of rack) {
      if (cell.id === excludedId) continue;
      const d = (cell.x - point.x) ** 2 + (cell.y - point.y) ** 2 + (cell.z - point.z) ** 2;
      if (d < distance - 1e-10) { distance = d; nearest = cell; }
    }
    return nearest;
  }
  function femPoints(c) {
    const matches = femPortMatch(c), mode = c.pointMode ?? 'cell';
    let referenceConfig = c;
    if (!matches && mode === 'cell') {
      // CASE coordinates remain a reference template. Actual ports below are never moved to that template.
      const limited = { ...c, ioX: Math.max(0, Math.min(c.length, c.ioX)), ioY: Math.max(0, Math.min(c.height, c.ioY)), outY: Math.max(0, Math.min(c.height, M.port(c, 'out').y)) };
      referenceConfig = { ...c, ...casePorts(limited), ioZ: -c.stroke, outZ: -c.stroke };
    }
    const reference = femReference(referenceConfig), input = M.port(c, 'in'), output = M.port(c, 'out');
    const mirroredLayout = !matches && input.x >= c.length && output.x >= c.length;
    if (mirroredLayout) {
      const seen = new Set();
      for (const p of [...reference.inbound, ...reference.outbound]) if (!seen.has(p)) { p.x = c.length - p.x; seen.add(p); }
      reference.E.x = c.length - reference.E.x; reference.A.x = c.length - reference.A.x;
    }
    const rack = cells(c);
    const snapPair = points => {
      let previous = null;
      return points.map(p => {
        const candidates = depthCount(c) === 2 && previous !== null && c.bays * c.levels * c.sides > 1 ? rack.filter(cell => !sameLane(cell, rack[previous])) : rack;
        const cell = nearestCell(candidates, p, rack.length > 1 ? previous : null); previous = cell.id;
        return { ...cell, name: p.name, reference: { ...p }, adjustment: Math.hypot(cell.x - p.x, cell.y - p.y, cell.z - p.z) };
      });
    };
    const inbound = mode === 'theory' ? reference.inbound : snapPair(reference.inbound);
    const outbound = c.femCase === 2 ? (mode === 'theory' ? reference.outbound : snapPair(reference.outbound)) : inbound;
    return { ...reference, E: input, A: output, inbound, outbound, dcPairs: c.femCase === 2 ? [inbound, outbound] : [inbound],
      mode, portMatch: matches, mirroredLayout, referencePorts: { in: reference.E, out: reference.A },
      theoretical: { inbound: reference.inbound, outbound: reference.outbound } };
  }
  function rackLayout(c) {
    const pitch = c.levelPitch ?? c.height / c.levels, first = c.firstLevelHeight ?? pitch / 2;
    const heights = Array.from({ length: c.levels }, (_, l) => first + l * pitch), top = heights.at(-1);
    const boundaries = [first - pitch / 2, ...heights.map(y => y + pitch / 2)];
    return { first, pitch, top, heights, boundaries };
  }
  function cells(c) {
    const layout = rackLayout(c);
    const result = [];
    for (let side = 0; side < c.sides; side++) for (let b = 0; b < c.bays; b++) for (let l = 0; l < c.levels; l++) for (let depth = 1; depth <= depthCount(c); depth++) {
      result.push({ id: result.length, bay: b + 1, level: l + 1, side: side === 0 ? -1 : 1, ...(depthCount(c) === 2 ? { depth } : {}),
        x: (b + 0.5) * c.length / c.bays, y: layout.heights[l], z: (side === 0 ? -1 : 1) * depthStroke(c, depth) });
    }
    return result;
  }
  function envelope(c) {
    const layout = rackLayout(c), points = [];
    for (let i = 0; i < c.cranes; i++) for (const r of routeConfigs(aisleConfig(c, i))) points.push(M.port(r.config, 'in'), M.port(r.config, 'out'));
    const xMin = Math.min(0, ...points.map(p => p.x)), xMax = Math.max(c.length, ...points.map(p => p.x));
    const yMin = Math.min(0, layout.boundaries[0], ...points.map(p => p.y)), yMax = Math.max(c.height, layout.boundaries.at(-1), layout.top + (c.transferLift ?? .11), ...points.map(p => p.y + (c.transferLift ?? .11)));
    return { xMin, xMax, yMin, yMax, width: xMax - xMin, height: yMax - yMin };
  }
  function calculate(input) {
    const c = validate(input), rack = cells(c), n = rack.length;
    const travelTime = (cfg, a, b, loaded) => { const t = M.move(cfg, a, b, loaded).duration; return t + (t > 0 ? cfg.position : 0); };
    let between = 0, m2 = 0, samples = 0;
    const depths = depthCount(c), dcPossible = n > depths, exact = n * (n - depths) <= 60000;
    function add(i, j) {
      const value = travelTime(c, rack[i], rack[j], false);
      samples++; const delta = value - between; between += delta / samples; m2 += delta * (value - between);
    }
    if (c.method === 'cells' && dcPossible) {
      if (exact) { for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (depths === 2 ? !sameLane(rack[i], rack[j]) : i !== j) add(i, j); }
      else { const random = rng(9851); for (let k = 0; k < 30000; k++) {
        const i = Math.floor(random() * n), start = Math.floor(i / depths) * depths;
        let j = Math.floor(random() * (n - depths)); if (j >= start) j += depths; add(i, j);
      } }
    }
    const total = c.inbound + c.outbound;
    const mixing = mix(c), p = mixing.p;
    const paired = total * p / (1 + p), singlesIn = c.inbound - paired, singlesOut = c.outbound - paired;
    const singles = singlesIn + singlesOut;
    const corrected = [c.A, c.Ft, c.Ew].every(Number.isFinite) && c.basis !== '';
    const factor = corrected ? c.A * c.Ft * c.Ew : null, cache = new Map();
    function one(cfg) {
      const E = M.port(cfg, 'in'), A = M.port(cfg, 'out'), fem = c.method === 'fem' ? femPoints(cfg) : null;
      const variants = point => depths === 1 ? [point] : [1, 2].map(depth => point.id == null ? { ...point, depth, z: point.side * depthStroke(cfg, depth) } : { ...point, ...rack.find(cell => sameLane(cell, point) && cell.depth === depth) });
      const inPoints = fem ? fem.inbound.flatMap(variants) : rack, outPoints = fem ? fem.outbound.flatMap(variants) : rack;
      const ins = inPoints.map(cell => M.plan(cfg, 'in', E, cell, null, true));
      const outs = outPoints.map(cell => M.plan(cfg, 'out', A, null, cell, true));
      const mean = plans => plans.reduce((s, v) => s + v.duration, 0) / plans.length;
      const scIn = mean(ins), scOut = mean(outs);
      // Residual SC jobs after pairing determine the correct directional weighting.
      const wIn = singles > 1e-9 ? singlesIn / singles : total > 0 ? c.inbound / total : .5;
      const sc = wIn * scIn + (1 - wIn) * scOut;
      const averagePart = (plans, type) => plans.reduce((sum, plan) => sum + plan.actions.filter(a => a.type === type).reduce((s, a) => s + a.duration, 0), 0) / plans.length;
      const scParts = {};
      for (const type of ['move', 'position', 'fork', 'control']) scParts[type] = wIn * averagePart(ins, type) + (1 - wIn) * averagePart(outs, type);
      let dc = null, dcPlans = [];
      if (dcPossible) {
        if (fem) { dcPlans = fem.dcPairs.flatMap(pair => variants(pair[0]).flatMap(a => variants(pair[1]).map(b => M.plan(cfg, 'dc', E, a, b, true)))); dc = mean(dcPlans); }
        else {
          const loadedIn = rack.reduce((s, cell) => s + travelTime(cfg, E, cell, true), 0) / n;
          const loadedOut = rack.reduce((s, cell) => s + travelTime(cfg, cell, A, true), 0) / n;
          dc = loadedIn + between + loadedOut + travelTime(cfg, A, E, false)
            + M.fork(cfg, Math.abs(E.z)).duration + M.fork(cfg, Math.abs(A.z)).duration + 2 * rack.reduce((sum, cell) => sum + M.fork(cfg, Math.abs(cell.z)).duration, 0) / n + cfg.control;
        }
      }
      const cycle = (1 - p) * sc + p * (dc || 0), theory = 3600 * (1 + p) / cycle;
      const available = factor === null ? null : theory * factor;
      return { scIn, scOut, sc, dc, cycle, theory, available, scParts, fem,
        dcTimes: dcPlans.map(v => v.duration), returnTime: travelTime(cfg, A, E, false), ports: { in: E, out: A } };
    }
    const aisles = [];
    for (let i = 0; i < c.cranes; i++) {
      const cfg = aisleConfig(c, i), routes = routeConfigs(cfg).map(route => {
        const key = JSON.stringify([route.femCase, M.port(route.config, 'in'), M.port(route.config, 'out')]);
        if (!cache.has(key)) cache.set(key, one(route.config));
        return { ...cache.get(key), id: route.id, weight: route.weight, femCase: route.femCase, aisle: i + 1 };
      });
      const average = key => routes.reduce((s, r) => s + r.weight * (r[key] || 0), 0);
      const combined = { ...routes[0], routes, aisle: i + 1, transition: 0 };
      if (routes.length > 1 || c.mode === 'mixed') {
        // Independent route/direction selection, closed SC/DC cycles; expected empty repositioning between cycles.
        const inWeight = p + (1 - p) * mixing.wIn, outWeight = (1 - p) * (1 - mixing.wIn);
        for (const a of routes) for (const b of routes) for (const [from, wa] of [['in', inWeight], ['out', outWeight]]) for (const [to, wb] of [['in', inWeight], ['out', outWeight]])
          combined.transition += a.weight * b.weight * wa * wb * travelTime(cfg, a.ports[from], b.ports[to], false);
        for (const key of ['scIn', 'scOut', 'sc', 'dc', 'returnTime']) combined[key] = key === 'dc' && !dcPossible ? null : average(key);
        combined.scParts = Object.fromEntries(Object.keys(combined.scParts).map(key => [key, routes.reduce((s, r) => s + r.weight * r.scParts[key], 0)]));
        combined.cycle = average('cycle') + combined.transition;
        combined.theory = 3600 * (1 + p) / combined.cycle;
        combined.available = factor === null ? null : combined.theory * factor;
      }
      aisles.push(combined);
    }
    const first = aisles[0], theoryTotal = aisles.reduce((s, a) => s + a.theory, 0);
    const capacity = factor === null ? null : theoryTotal * factor, demand = total * c.peak;
    const util = capacity === null ? null : demand / capacity;
    const worstUtil = factor === null ? null : Math.max(...aisles.map(a => demand / c.cranes / a.available));
    // Conservative count for additional independent aisles under equal demand splitting.
    const required = factor === null ? null : Math.ceil(demand / (Math.min(...aisles.map(a => a.available)) * c.targetUtil));
    const allRoutes = aisles.flatMap(a => a.routes);
    return { ...first, config: c, p, mix: mixing, allRoutes, demand, factor, capacity, util, worstUtil, required, theoryTotal, aisles,
      cells: n, totalCells: n * c.cranes, fork: M.fork(c).duration,
      dcSampling: { method: c.method === 'fem' ? 'FEM 대표 경로' : exact ? '전수 열거' : '고정 시드 표본',
        samples: c.method === 'fem' ? first.dcTimes.length : samples, se: !exact && samples > 1 ? Math.sqrt(m2 / (samples - 1) / samples) : 0 },
      reference: (c.method === 'fem' ? 'FEM 9.851 (06.2003) CASE ' + [...new Set(allRoutes.map(a => a.femCase))].join('/') + (c.pointMode === 'cell' ? ' 기준 실제 화물 중심 · 설계 계산' : ' 이론 대표점 비교') + (allRoutes.some(a => !a.fem.portMatch) ? ' · 실제 외부/자유 포트 적용' : '') : '균일 셀 선택 · SC-return/DC 공학 모델')
        + (aisles.some(a => a.routes.length > 1) ? ' · 복합 배치: 배분율 가중 시간 + 독립 조합 전환 공차시간 추정 (설계 확장)' : '')
        + (depths === 2 ? ' · 더블딥 앞열/뒷열 균등 평균 (설계 확장, 재배치 제외)' : '')
        + (c.mode === 'sc-stay' ? ' · SC-stay는 SC-return 참고값, DES 확인' : '') };
  }
  function sensitivity(result) {
    const rows = [];
    if (result.factor === null) return rows;
    for (const key of ['A', 'Ft', 'Ew']) for (const delta of [-0.1, -0.05, 0.05, 0.1]) {
      const value = Math.min(1, result.config[key] * (1 + delta));
      const capacity = result.capacity * value / result.config[key];
      const minAvailable = Math.min(...result.aisles.map(a => a.available)) * value / result.config[key];
      rows.push({ key, delta, value, capacity, required: Math.ceil(result.demand / (minAvailable * result.config.targetUtil)) });
    }
    return rows;
  }
  function pack(config) { return { schemaVersion: SCHEMA, moduleVersion: VERSION, kernelVersion: M.VERSION, deviceType: 'stacker-crane', savedAt: new Date().toISOString(), units: 'm,m/s,m/s²,s', config: validate(config) }; }
  function unpack(data) {
    if (!data || data.schemaVersion !== SCHEMA || data.deviceType !== 'stacker-crane' || data.units !== 'm,m/s,m/s²,s') throw Error('지원하는 STC 프로젝트 JSON과 단위 규격이 아닙니다.');
    if (typeof data.moduleVersion !== 'string' || !['0.1', '0.2', '0.3'].includes(data.moduleVersion.split('.').slice(0, 2).join('.')))
      throw Error('프로그램 주·부 버전이 다릅니다. 버전 변환 후 불러오세요.');
    return validate(data.config);
  }
  return { VERSION, SCHEMA, defaults, fields, enums, nullable, portKeys, depthCount, depthStroke, depthName, sameLane, depthNote, migrate, aisleConfig, routeConfigs, portKey, mix, address, caseNames, caseConditions, casePorts, femPortMatch, femReference, femPoints, nearestCell, rackLayout, envelope, validate, rng, cells, calculate, sensitivity, pack, unpack };
});

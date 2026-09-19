(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core/model.js'));
  else root.STCEasy = factory(root.STCModel);
})(globalThis, function (Model) {
  'use strict';
  const VERSION = '1.0.0';
  const defaults = { ...Model.defaults, name: '스태커크레인 간편 검토', inbound: 20, outbound: 20, peak: 1, operatingEfficiency: 85, targetUtil: .85, loadedFactor: 1 };
  const fields = {
    name: ['프로젝트 이름', '', '예: A동 자동창고 검토', 'text'],
    length: ['랙 길이', 'm', '크레인 주행 방향의 랙 전체 길이'],
    height: ['랙 높이', 'm', '바닥부터 랙 상부까지의 높이'],
    bays: ['가로 보관 칸 수', '칸', '한 면의 가로 칸 수 · Bay'],
    levels: ['세로 보관 단 수', '단', '한 면의 높이 방향 단 수 · Level'],
    sides: ['보관면', '', '크레인 통로를 기준으로 선택', { 2: '양쪽 랙 · 2면', 1: '한쪽 랙 · 1면' }],
    rackDepth: ['보관 깊이', '', '한 위치에서 앞뒤로 보관하는 수', { single: '싱글딥 · 깊이 1개', double: '더블딥 · 깊이 2개' }],
    vx: ['주행 속도', 'm/min', '통로를 따라 수평으로 이동하는 속도'],
    vy: ['승강 속도', 'm/min', '화물을 위아래로 이동하는 속도'],
    vf: ['포크 속도', 'm/min', '포크를 내밀고 당기는 속도'],
    stroke: ['앞열 포크 편도 거리', 'm', '통로 중심부터 앞열 화물 중심까지'],
    cranes: ['스태커크레인 수', '대', '독립 통로마다 1대씩 설치'],
    inbound: ['시간당 입고 요구량', 'PLT/h', '모든 크레인이 합쳐서 입고할 수량'],
    outbound: ['시간당 출고 요구량', 'PLT/h', '모든 크레인이 합쳐서 출고할 수량'],
    mode: ['운전 방식', '', '단독은 화물 1개, 복합은 입고 1개 + 출고 1개', { 'sc-return': '단독 · 싱글(SC)', dc: '복합 우선 · 듀얼(DC)', mixed: '싱글·듀얼 비율 지정', 'sc-stay': '작업 위치 대기 · SC 복귀 참고값' }],
    dcRatio: ['듀얼 사이클 비율', '%', '50% = 싱글 1회 + 듀얼 1회'],
    operatingEfficiency: ['운전효율', '%', '처리량에 반영 · 85를 입력하면 이론값의 85%'],
    targetUtil: ['목표 설계 부하율', '%', '필요 대수 판단용 · 표시 처리량에는 곱하지 않음'],
    peak: ['피크 계수', '배', '혼잡 시간의 요구량 배수 · 1이면 추가 증가 없음'],
    loadedFactor: ['적재 시 속도·가감속 적용률', '%', '100 = 입력 사양 그대로 · 50 = 속도·가감속을 절반으로 적용'],
    ax: ['주행 가속도', 'm/s²', '주행 최고속도까지 빨라지는 정도'],
    dx: ['주행 감속도', 'm/s²', '주행을 멈출 때 감속하는 정도'],
    ay: ['승강 가속도', 'm/s²', '승강 최고속도까지 빨라지는 정도'],
    dy: ['승강 감속도', 'm/s²', '승강을 멈출 때 감속하는 정도'],
    af: ['포크 가속도', 'm/s²', '포크 최고속도까지 빨라지는 정도'],
    df: ['포크 감속도', 'm/s²', '포크를 멈출 때 감속하는 정도'],
    transferLift: ['캐리지 이재 승하강량', 'mm', '화물을 들어 올리거나 내려놓는 높이'],
    forkDwell: ['이재 후 안착 대기', '초/이재', '승하강 완료 후 추가로 기다리는 시간'],
    position: ['정위치 확인 시간', '초/이동', '주행·승강 이동이 끝날 때 추가하는 시간'],
    control: ['제어 지연', '초/사이클', '한 사이클마다 한 번 추가하는 시간'],
    firstLevelHeight: ['1단 화물 중심 높이', 'm', '빈칸이면 자동 · 바닥 기준 높이'],
    levelPitch: ['단간격', 'm', '빈칸이면 랙 높이 ÷ 단 수'],
    rearStroke: ['뒷열 포크 편도 거리', 'm', '통로 중심부터 뒷열까지 · 빈칸이면 앞열의 2배'],
    ioX: ['입고 포트 · 주행 위치 X', 'm', '랙 시작점을 0으로 입력 · 외부 포트는 음수도 가능'],
    ioY: ['입고 포트 · 높이 Y', 'm', '바닥을 0으로 입력'],
    ioZ: ['입고 포트 · 포크 위치 Z', 'm', '빈칸이면 앞열 거리의 음수 · 좌우 방향 포함'],
    outX: ['출고 포트 · 주행 위치 X', 'm', '빈칸이면 입고 포트 X와 동일'],
    outY: ['출고 포트 · 높이 Y', 'm', '빈칸이면 입고 포트 Y와 동일'],
    outZ: ['출고 포트 · 포크 위치 Z', 'm', '빈칸이면 앞열 거리의 음수 · 좌우 방향 포함'],
    method: ['평균 사이클 계산 방법', '', '전체 셀 또는 대표점을 사용해 평균 이동 계산', { cells: '전체 보관 셀 평균', fem: 'FEM CASE 대표점' }],
    femCase: ['FEM 배치 유형', '', '선택 후 아래 배치 좌표 적용 버튼으로 포트 설정', Object.fromEntries(Model.caseNames.map((n, i) => [i + 1, `CASE ${i + 1} · ${n}`]))],
    pointMode: ['대표점 위치', '', '실제 화물 중심을 기본으로 사용', { cell: '실제 화물 중심', theory: '이론 좌표 · 비교 검토용' }]
  };
  const basicGroups = [
    { id: 'rack', title: '창고 크기를 입력하세요', note: '도면의 랙 길이·높이와 보관 칸 수를 옮겨 적습니다.', keys: ['length', 'height', 'bays', 'levels', 'sides', 'rackDepth'] },
    { id: 'speed', title: '장비 속도를 입력하세요', note: '사양서의 속도를 m/min으로 입력합니다. 1 m/s = 60 m/min입니다.', keys: ['vx', 'vy', 'vf', 'stroke'] },
    { id: 'demand', title: '처리할 물량을 입력하세요', note: '입고와 출고를 합친 수량으로 처리능력을 비교합니다.', keys: ['cranes', 'inbound', 'outbound', 'mode', 'dcRatio'] }
  ];
  const parameterGroups = [
    { id: 'efficiency', title: '효율과 설계 여유', note: '운전효율은 처리량에, 목표 부하율은 필요 대수에 적용합니다.', keys: ['operatingEfficiency', 'targetUtil', 'peak'] },
    { id: 'movement', title: '적재 시 움직임과 가감속', note: '속도 입력값이 적재 사양이면 적용률을 100%로 두세요. 적용률을 낮추면 이동 시간이 길어집니다.', keys: ['loadedFactor', 'ax', 'dx', 'ay', 'dy', 'af', 'df'] },
    { id: 'delay', title: '이재 동작과 지연시간', note: '다른 조건이 같으면 대기·지연시간을 줄일수록 처리량이 증가합니다.', keys: ['transferLift', 'forkDwell', 'position', 'control'] },
    { id: 'geometry', title: '랙 상세 치수', note: '모르는 항목은 빈칸으로 두면 자동 계산값을 사용합니다.', keys: ['firstLevelHeight', 'levelPitch', 'rearStroke'] },
    { id: 'ports', title: '입고·출고 위치', note: '모든 크레인에 같은 배치를 적용합니다. 기본은 랙 하단의 공용 포트입니다.', keys: ['ioX', 'ioY', 'ioZ', 'outX', 'outY', 'outZ'] },
    { id: 'method', title: '계산 기준', note: '회사 프로그램과 비교할 때는 이 항목과 실제 포트 위치도 맞춰 확인하세요.', keys: ['method', 'femCase', 'pointMode'] }
  ];
  const parameterKeys = parameterGroups.flatMap(g => g.keys);
  const scale = key => ['vx', 'vy', 'vf'].includes(key) ? 60 : key === 'transferLift' ? 1000 : ['loadedFactor', 'targetUtil'].includes(key) ? 100 : 1;
  const display = (c, key) => c[key] === null ? '' : typeof c[key] === 'number' ? Number((c[key] * scale(key)).toPrecision(12)) : c[key];
  function fromDisplay(values, base = defaults) {
    const c = { ...base, speedUnit: 'm/min' };
    for (const [key, raw] of Object.entries(values)) {
      if (!(key in fields)) continue;
      if (key in Model.fields) {
        const value = String(raw).trim(), [label, , low, high] = Model.fields[key], f = scale(key);
        if (value === '' && Model.nullable.includes(key)) { c[key] = null; continue; }
        const number = value === '' ? NaN : Number(value);
        if (!Number.isFinite(number) || number < low * f || number > high * f) {
          const e = Error(`${fields[key][0]}: ${Number((low * f).toPrecision(8))}~${Number((high * f).toPrecision(8))} ${fields[key][1]} 범위의 값을 입력하세요.`); e.field = key; throw e;
        }
        c[key] = number / f;
      } else c[key] = raw;
    }
    return Model.validate(c);
  }
  function parameterPack(c) {
    c = Model.validate(c);
    return { schemaVersion: 'stc/easy-parameters@1', interfaceVersion: VERSION, units: 'm,m/s,m/s²,s', parameters: Object.fromEntries(parameterKeys.map(k => [k, c[k]])) };
  }
  function applyParameters(base, data) {
    if (!data || data.schemaVersion !== 'stc/easy-parameters@1' || data.units !== 'm,m/s,m/s²,s' || !data.parameters || Array.isArray(data.parameters)) throw Error('간편판에서 저장한 파라미터 JSON 파일을 선택하세요.');
    if (Object.keys(data.parameters).length !== parameterKeys.length || parameterKeys.some(k => !Object.hasOwn(data.parameters, k))) throw Error('파라미터 항목이 누락되었거나 지원하지 않는 파일입니다.');
    return Model.validate({ ...base, ...Object.fromEntries(parameterKeys.map(k => [k, data.parameters[k]])) });
  }
  function projectPack(c) { return { ...Model.pack(c), interface: 'stc/easy@1', interfaceVersion: VERSION }; }
  function projectUnpack(data) {
    const c = Model.unpack(data);
    if (c.routes.length || c.ports.some(p => Object.values(p).some(v => v !== null))) throw Error('STC별 개별 포트 또는 복합 배치가 있는 파일입니다. 이 파일은 기존 상세 프로그램에서 열어주세요. 간편판은 모든 STC에 같은 포트 배치를 사용합니다.');
    // Empty override rows have no physical effect. Removing them permits changing crane count.
    return { ...c, ports: [], speedUnit: 'm/min' };
  }
  function changed(a, b, keys = Object.keys(fields)) { return keys.filter(k => a[k] !== b[k]); }
  function comparisons(r) {
    const sc = Model.calculate({ ...r.config, mode: 'sc-return' });
    return [
      { label: '단독 · 싱글 SC', loads: 1, time: sc.sc, theory: 3600 / sc.sc },
      { label: '복합 · 듀얼 DC', loads: 2, time: r.dc, theory: r.dc ? 7200 / r.dc : null }
    ].map(v => ({ ...v, available: v.theory === null || r.factor === null ? null : v.theory * r.factor }));
  }
  return { VERSION, defaults, fields, basicGroups, parameterGroups, parameterKeys, scale, display, fromDisplay, parameterPack, applyParameters, projectPack, projectUnpack, changed, comparisons };
});

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./model.js'));
  else root.STCReport = factory(root.STCModel);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Model) {
  'use strict';
  const number = value => Number.isFinite(value) ? String(Math.round(value * 10000) / 10000) : '미산정';
  const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
  function csv(rows) {
    return '\uFEFF' + rows.map(row => row.map(value => {
      let text = String(value ?? '');
      if (typeof value === 'string' && /^[=+@\-\t\r]/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    }).join(',')).join('\r\n');
  }
  function hash(config) { let h = 2166136261; for (const ch of JSON.stringify(config)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, '0'); }
  function markdown(result, sim) {
    const c = result.config;
    const rows = ['# 스태커크레인 물동량 계산서', '', '- 프로젝트: ' + escape(c.name), '- 생성: ' + new Date().toISOString(),
      '- 모듈/운동 커널: ' + Model.VERSION + ' / ' + Model.pack(c).kernelVersion, '- 입력 식별자 (FNV-1a): ' + hash(c), '- 계산 방식: ' + result.reference, '',
      '## 1. 입력 요약', '', '- 속도는 선택한 표시 단위로 환산합니다. 프로젝트 JSON과 운동 계산은 SI 단위(m, m/s, m/s², s)를 유지합니다.', '', '| 입력 | 값 | 단위 |', '| --- | --- | --- |'];
    for (const key of Object.keys(Model.defaults).filter(key => key !== 'ports' && key !== 'routes')) {
      const field = Model.fields[key], speed = field?.[1] === 'speed';
      const value = key === 'motionModel' ? (c[key] === 'creep' ? '저속 접근 포함 · 회사식' : '정지 간 가감속') : key === 'rackDepth' ? Model.depthName(c) : c[key] === null ? (['firstLevelHeight', 'levelPitch', 'rearStroke'].includes(key) ? '자동' : '미입력') : key === 'transferLift' ? number(c[key] * 1000) : speed ? number(c[key] * (c.speedUnit === 'm/min' ? 60 : 1)) : c[key];
      rows.push('| ' + escape(field?.[0] || (key === 'motionModel' ? '운동시간 계산 방식' : key === 'rackDepth' ? '화물 보관 깊이' : key)) + ' | ' + escape(value) + ' | ' + escape(speed ? c.speedUnit : field?.[1] || '—') + ' |');
    }
    rows.push('', '### SC/DC 지정 비율', '',
      '- 운전 모드: ' + c.mode + '. 지정 SC ' + number(100 - c.dcRatio) + '% / DC ' + number(c.dcRatio) + '% (' + (c.ratioBasis === 'cycles' ? '운전 사이클 횟수 기준' : '처리 화물 개수 기준') + ', mixed 모드에서 적용).',
      '- 사이클 기준 목표 DC: ' + number(result.mix.requested * 100) + '% / 수요·셀 제약 상한: ' + number(result.mix.limit * 100) + '% / 분석 적용 DC: ' + number(result.p * 100) + '%.',
      '- 화물 기준 f를 선택하면 p=f/(2−f). 총 취급량 Q=3600×(1+p)/평균 사이클시간.',
      '- 실제 비율은 도착·재고·버퍼 조건에 따라 달라집니다. 같은 조합의 입·출고만 DC로 묶으며, 지정 비율 모드의 SC는 포트 복귀입니다.');
    rows.push('', '### 화물 보관 깊이', '', '- ' + Model.depthName(c) + ' · ' + result.cells + '셀/STC · 전체 ' + result.totalCells + '셀.', '- 앞열 포크 거리: ' + number(c.stroke) + ' m' + (Model.depthCount(c) === 2 ? ' / 뒷열: ' + number(Model.depthStroke(c, 2)) + ' m.' : '.'));
    if (Model.depthCount(c) === 2) rows.push('- ' + Model.depthNote, '- FEM 대표점 표는 앞열(D1) 기준이며, 계산은 동일 X·Y의 뒷열 이재시간도 평균에 포함합니다.');
    const layout = Model.rackLayout(c);
    rows.push('', '### 단별 랙 이재 높이', '', '- Y(k) = 1단 높이 + (k−1) × 단간격. 바닥 기준, 모든 STC 공통.',
      '- 적용 1단 높이: ' + number(layout.first) + ' m / 단간격: ' + number(layout.pitch) + ' m / 최상단: ' + number(layout.top) + ' m.',
      '- 빈 단간격은 H/단수, 빈 1단 높이는 단간격/2입니다. 실제 화물 중심과 기본 P1·P2 선정에 적용합니다. 비교용 이론 좌표는 H 기준입니다.',
      '', '| 단 | 이재 높이 Y (m) |', '| ---: | ---: |');
    layout.heights.forEach((y, i) => rows.push('| ' + (i + 1) + ' | ' + number(y) + ' |'));
    const bounds = Model.envelope(c);
    rows.push('', '- 랙·포트 포함 범위: X ' + number(bounds.xMin) + '~' + number(bounds.xMax) + ' m, Y ' + number(bounds.yMin) + '~' + number(bounds.yMax) + ' m.',
      '- 랙 X 범위는 0~' + number(c.length) + ' m이며 포트 위치에 따라 셀 간격을 늘리지 않습니다. X/Y 외부 좌표와 음수를 허용합니다.');
    rows.push('', '## 2. 사이클타임 분해', '', '| 항목 | 시간 (s) |', '| --- | ---: |',
      '| SC 주행·승강 (동시동작) | ' + number(result.scParts.move) + ' |', '| SC 정위치 | ' + number(result.scParts.position) + ' |',
      '| SC 포크 이재 2회 | ' + number(result.scParts.fork) + ' |', '| 제어 지연 / 사이클 | ' + number(c.control) + ' |',
      '| SC 합계 | ' + number(result.sc) + ' |', '| DC 합계 (이재 4회) | ' + number(result.dc) + ' |', '| DC 비율 / 전체 사이클 | ' + number(result.p) + ' |',
      '', '- 상차: 포크 OUT → 캐리지 UP ' + number(c.transferLift * 1000) + ' mm → 안착 대기 → 포크 IN.',
      '- 하차: 포크 OUT → 캐리지 DOWN ' + number(c.transferLift * 1000) + ' mm → 안착 대기 → 포크 IN.',
      '- 포크 이재 1회 = 편도 스트로크 운동시간 × 2 + 캐리지 이재 승하강 운동시간 + 안착 대기. SC 2회 / DC 4회이며 캐리지 운동시간을 별도로 중복 가산하지 않습니다.',
      c.motionModel === 'creep' ? '- 저속 접근 모드: 캐리지 이재시간=승하강량÷승강 저속. 이동 여유는 각 축의 운동시간에 포함되며 두 축 중 긴 시간을 적용합니다.' : '- 캐리지 이재에는 승강 Y 속도·가감속과 적재 비율을 적용합니다. 입력 Y와 P1·P2는 놓인 화물의 중심이며 적재 이동은 이재 승하강량만큼 높은 위치입니다.',
      '- 기존 승하강·안착 입력에 승하강 시간이 포함되어 있었다면 안착 대기만 남겨 입력합니다. 재고·완료량은 각 포크 IN 완료 시 집계합니다.',
      '- DC 셀 쌍: ' + result.dcSampling.method + ', n=' + result.dcSampling.samples + ', 사이클시간 표준오차=' + number(result.dcSampling.se) + ' s.',
      '', '## 3. 처리량과 요구 대비 여유', '', '| 항목 | 값 |', '| --- | ---: |',
      '| SC 100% 보정 참고 능력 | ' + number(result.factor === null ? null : 3600 / result.sc * result.factor) + ' ' + c.unit + '/h |', '| DC 100% 보정 참고 능력 | ' + number(result.factor === null || !result.dc ? null : 7200 / result.dc * result.factor) + ' ' + c.unit + '/h |', '| 1대 이론 총 취급량 | ' + number(result.theory) + ' ' + c.unit + '/h |', '| 1대 보정 총 취급량 | ' + number(result.available) + ' ' + c.unit + '/h |',
      '| 전체 독립 통로 보정능력 | ' + number(result.capacity) + ' ' + c.unit + '/h |', '| 피크 총 요구량 | ' + number(result.demand) + ' ' + c.unit + '/h |',
      '| 요구 대비 잔여능력 | ' + number(result.capacity === null ? null : result.capacity - result.demand) + ' ' + c.unit + '/h |',
      '| 설계 부하율 | ' + number(result.util) + ' |', '| 목표 부하율 적용 필요 독립 통로 | ' + number(result.required) + ' |',
      '', '## 4. 제약 검토', '', '- ' + Model.depthName(c) + ' / Single Fork, 균등 셀 배치, STC별 IN/OUT XYZ, 통로당 1대.',
      '- 독립 통로 확장은 균등 부하 배분·공통 상하류 병목 없음의 조건부 분석입니다.',
      '- 목표 부하율: ' + number(c.targetUtil) + '. ' + (result.util === null ? '보정계수 미선택으로 설계 판정 대기.' : result.worstUtil > c.targetUtil ? '목표 부하율 초과.' : '분석상 목표 부하율 이하.'),
      '- 입력 A·Ft·Ew 중 1.0인 계수는 해당 손실을 제외하는 이상 조건입니다.', '- SC-stay의 분석값은 SC-return 참고값이며 동작별 결과는 DES에서 확인합니다.',
      '', '## 5. 보정계수 민감도', '', '| 계수 | 상대변화 | 적용값 | 전체 보정능력 | 필요 통로 |', '| --- | ---: | ---: | ---: | ---: |');
    for (const row of Model.sensitivity(result)) rows.push('| ' + row.key + ' | ' + number(row.delta * 100) + '% | ' + number(row.value) + ' | ' + number(row.capacity) + ' | ' + row.required + ' |');
    if (result.factor === null) rows.push('', '계수 및 근거 선택 후 민감도를 계산합니다.');
    rows.push('', '## 6. 적용 모델과 검증 범위', '', c.motionModel === 'creep' ? '- 저속 접근 모델: 가속·정속·저속까지 감속·최소거리 접근. 마지막 저속 정지는 순간 정지로 근사합니다. 최소거리 이내는 저속 시간만 적용합니다. 극히 짧은 거리에서 회사 시간식과 물리적 가감속 형상이 맞지 않는 경우 운동도는 같은 시간의 단조 이동으로 표시합니다.' : '- 사용자 개발계획서 v1.2의 비대칭 가감속 정지-정지 운동식과 SC/DC 집계 규칙을 사용합니다.',
      '- FEM 선택 시 FEM 9.851 (06.2003) §4.1~4.6 대표점과 입력 운동·이재·지연 모델을 결합합니다. 현장 시험 및 규격 적합성 판정은 별도입니다.', '- 실제 장비 실측·기존 Python 골든 자료와의 현장 검증은 미완료입니다.',
      '- jerk 제한 S-curve, 고장, 더블딥 화물 재배치·SKU 지정 출고, Twin Fork, 공유레일 충돌은 포함하지 않습니다.',
      '', '## 7. 해석 시 주의', '', '평균 사이클타임만으로 달성 물동량과 대기시간을 확정할 수 없습니다. 이론 처리능력과 측정구간의 실제 완료량, 종료 대기 작업을 함께 검토합니다.');
    rows.push('', '## STC별 포트와 FEM 적용', '', '- 좌표: X=주행, Y=승강, Z=포크(각 통로 중심 기준). |Z|가 포트 이재 편도거리입니다.',
      '- DC는 IN → P1 → P2 → OUT → IN 공차 복귀를 포함합니다. 필요 대수는 현재 STC 중 가장 낮은 보정능력을 기준으로 산정합니다.',
      '- 단일 대수의 요약은 STC 1입니다. 전체 처리능력은 STC별 능력의 합입니다.',
      '', '| STC | IN XYZ m | OUT XYZ m | SC 입고 s | SC 출고 s | DC s | OUT→IN s | 이론 /h |', '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |');
    for (const a of result.aisles) {
      const point = p => [p.x, p.y, p.z].map(number).join(', ');
      rows.push('| ' + [a.aisle, point(a.ports.in), point(a.ports.out), number(a.scIn), number(a.scOut), number(a.dc), number(a.returnTime), number(a.theory)].join(' | ') + ' |');
    }
    rows.push('', '### 복합 포트 조합', '', '- 각 STC의 입고·출고 수요에 같은 배분율을 적용합니다. 같은 XYZ의 IN끼리, OUT끼리는 버퍼를 공유합니다.',
      '- 전환 공차시간은 복귀 사이클 간 조합·작업 방향을 독립 선택하는 추정값입니다. 실제 배차 이동·차단은 DES로 확인합니다. 복합 CASE는 FEM 참조 배치를 조합한 설계 확장입니다.',
      '', '| STC | 조합 | CASE | 배분 % | IN XYZ m | OUT XYZ m | SC 입고 s | SC 출고 s | DC s |',
      '| --- | --- | --- | ---: | --- | --- | ---: | ---: | ---: |');
    for (const a of result.allRoutes) rows.push('| ' + [a.aisle, a.id, a.femCase, number(a.weight * 100), [a.ports.in.x, a.ports.in.y, a.ports.in.z].map(number).join(', '), [a.ports.out.x, a.ports.out.y, a.ports.out.z].map(number).join(', '), number(a.scIn), number(a.scOut), number(a.dc)].join(' | ') + ' |');
    rows.push('', '| STC | 전환 공차 s/cycle | 혼합 평균 s/cycle | 이론 /h |', '| --- | ---: | ---: | ---: |');
    for (const a of result.aisles) rows.push('| ' + [a.aisle, number(a.transition), number(a.cycle), number(a.theory)].join(' | ') + ' |');
    if (result.fem) {
      rows.push('', '- 출처: FEM 9.851 (06.2003), §4.1~4.6 / 적용 CASE: ' + [...new Set(result.allRoutes.map(a => a.femCase))].join(', '),
        '- 조합별 CASE 참조 조건: ' + result.allRoutes.map(a => a.aisle + '/' + a.id + ': ' + Model.caseConditions[a.femCase - 1]).join(' · '), '- α=' + number(result.fem.alpha) + '; 권고 범위 0.5 < α < 2. ' + (result.fem.alpha <= .5 || result.fem.alpha >= 2 ? '범위 밖: 대표점 근사 적용 검토 필요.' : '범위 이내.'),
        '- SC 입고/출고는 각 대표점의 완전 복귀 사이클 평균. CASE 2 DC는 기본/대칭 경로의 평균.',
        '- 적용 위치: ' + (c.pointMode === 'cell' ? '실제 화물 중심. 가까운 셀을 결정한 후 그 중심 XYZ를 계산·운동 그래프·배치도·3D에 공통 적용합니다. 동일 셀로 겹치면 P2는 다른 셀 중 가장 가까운 중심을 선택합니다.' : c.pointMode === 'continuous' ? '연속 대표점과 입력 외부 포트의 이동거리로 계산합니다. 회사 입력의 셀 배치는 균등 배치 개략도입니다.' : '이론 좌표 비교. CASE 포트 조건과 원래 연속 좌표를 사용합니다.'),
        ...(result.allRoutes.some(a => !a.fem.portMatch) ? ['- 실제 포트는 CASE 참조 배치와 다릅니다. 아래 참조 배치로 대표 셀을 선정하고, 입력한 실제 포트까지의 운동시간을 계산하는 설계 확장입니다. 원 규정 배치의 이론 계산과 구분합니다.'] : []),
        '', '| STC | 점 | 적용 X m | 적용 Y m | 적용 Z m | ' + (c.pointMode === 'cell' ? '적용 화물 셀' : '가까운 셀 (참고)') + ' | 이론 XYZ (비교) |', '| --- | --- | ---: | ---: | ---: | --- | --- |');
      for (const a of result.allRoutes) for (const p of [...a.fem.inbound, ...(a.femCase === 2 ? a.fem.outbound : [])]) {
        const near = p.id == null ? Model.nearestCell(Model.cells(c), p) : p, ref = p.reference || p;
        rows.push('| ' + [a.aisle + ' / ' + a.id + ' / CASE ' + a.femCase, p.name, number(p.x), number(p.y), number(p.z), Model.address(near, a.aisle - 1), [ref.x, ref.y, ref.z].map(number).join(', ')].join(' | ') + ' |');
      }
      if (result.allRoutes.some(a => !a.fem.portMatch)) {
        rows.push('', '| STC | 셀 선정 참조 IN XYZ | 셀 선정 참조 OUT XYZ | 좌우 반전 |', '| --- | --- | --- | --- |');
        for (const a of result.allRoutes) rows.push('| ' + [a.aisle + ' / ' + a.id, [a.fem.referencePorts.in.x, a.fem.referencePorts.in.y, a.fem.referencePorts.in.z].map(number).join(', '), [a.fem.referencePorts.out.x, a.fem.referencePorts.out.y, a.fem.referencePorts.out.z].map(number).join(', '), a.fem.mirroredLayout ? '적용' : '없음'].join(' | ') + ' |');
      }
    }
    if (sim) {
      rows.push('', '## 시뮬레이션 실행 결과 · 실제 실행 STC ' + (sim.cranes || 1) + '대 합계', '', '- seed: ' + sim.seed,
        '- 현재/종료 시각: ' + number(sim.time) + ' / ' + number(sim.horizon) + ' s', '- 준비운전: ' + c.warmup + ' min, 현재 측정시간: ' + number(sim.measuredTime) + ' s',
        '- 실행 상태: ' + (sim.time >= sim.horizon ? '종료' : '진행 중 / 부분 결과'),
        '- 고장 없는 DES. 분석 보정계수 추가 차감 없음. 수요 = 전체 평균 × 피크 / 통로 수.',
        '- 총 취급량 / 입고 / 출고 취급 / 외부 출하: ' + [sim.throughput, sim.inboundRate, sim.outboundRate, sim.shippingRate].map(number).join(' / ') + ' ' + c.unit + '/h',
        '- 측정구간 입고/출고 완료: ' + sim.measured.in + ' / ' + sim.measured.out,
        '- 측정구간 완료 SC/DC 사이클: ' + sim.measuredCycles.sc + ' / ' + sim.measuredCycles.dc + ' · 실제 DC 사이클 비율 ' + number(sim.mix?.actual == null ? null : sim.mix.actual * 100) + '%.',
        '- 전체 생성 / 완료 / 대기 / 진행: ' + [sim.created.in + sim.created.out, sim.completed.in + sim.completed.out, sim.queued, sim.inProgress].join(' / '),
        '- 평균/P95/최대 대기: ' + [sim.meanWait, sim.p95Wait, sim.maxWait].map(number).join(' / ') + ' s (측정구간 배차 작업 n=' + sim.waitSamples + ')',
        '- 미배차 최장 경과시간: ' + number(sim.oldestPending) + ' s', '- 입고 버퍼 초과 / 출고 차단: ' + number(sim.overflowTime) + ' / ' + number(sim.stateTime.blocked) + ' s',
        '- 재고 부족 / 랙 만재 대기: ' + number(sim.starvedTime) + ' / ' + number(sim.fullTime) + ' s',
        '- 재고 보존: ' + sim.initialInventory + ' + ' + sim.completed.in + ' − ' + sim.completed.out + ' = ' + sim.stock + ' (랙) + ' + sim.outboundOnCrane + ' (출고 운반 중), 검산=' + sim.conservation,
        '- 작업 보존 검산: ' + sim.jobsConserved, '', '| 상태 | 측정시간 (s) |', '| --- | ---: |');
      if (sim.aisles) {
        rows.push('', '| STC | seed | 입고 완료 | 출고 완료 | 재고 | 대기 | 처리량 /h | 보존 |', '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |');
        for (const a of sim.aisles) rows.push('| ' + [a.aisle, a.seed, a.completed.in, a.completed.out, a.stock, a.queued, number(a.throughput), a.conservation && a.jobsConserved].join(' | ') + ' |');
        rows.push('', '| 상태 | 전체 STC 시간 합 (s) |', '| --- | ---: |');
      }
      for (const [key, value] of Object.entries(sim.stateTime)) rows.push('| ' + key + ' | ' + number(value) + ' |');
    }
    return rows.join('\n') + '\n';
  }
  return { csv, hash, markdown };
});

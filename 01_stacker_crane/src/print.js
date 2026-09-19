(function (root) {
  'use strict';
  const Model = root.STCModel, M = root.STCMotion, C = root.STCCharts, R = root.STCReport;
  const esc = C.esc, n = (value, digits = 3) => Number.isFinite(value) ? C.fmt(value, digits) : '미산정';
  const labels = { rackDepth: { single: '싱글딥', double: '더블딥' }, method: { cells: '전체 셀 평균', fem: 'FEM CASE 기준' }, pointMode: { cell: '실제 화물 중심', theory: '이론 좌표 비교' },
    mode: { 'sc-return': 'SC - I/O 복귀', 'sc-stay': 'SC - 제자리 대기', dc: 'DC - 최대 페어링', mixed: 'SC/DC - 지정 비율' },
    ratioBasis: { cycles: '운전 사이클 횟수', loads: '처리 화물 개수' },
    basis: { '': '미선택', assumption: '설계 가정', vendor: '벤더 사양', measured: '실측', ideal: '이상 조건' },
    storage: { random: '무작위', nearest: '가까운 셀' }, retrieval: { fifo: '선입선출', random: '무작위', nearest: '가까운 셀' },
    arrival: { takt: '일정 간격', poisson: 'Poisson' } };
  const stateNames = { idle: '대기', loaded: '적재 이동', empty: '공차 이동', fork: '포크 이재', position: '정위치', control: '제어 지연', blocked: '출고 차단' };
  const table = (heads, rows, cls = '') => '<table class="' + cls + '"><thead><tr>' + heads.map(h => '<th>' + esc(h) + '</th>').join('') +
    '</tr></thead><tbody>' + rows.map(row => '<tr>' + row.map(v => '<td>' + esc(v) + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
  const note = text => '<p class="note">' + esc(text) + '</p>';
  const chunk = (rows, size) => Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, (i + 1) * size));
  const xyz = p => [p.x, p.y, p.z].map(v => n(v)).join(' / ');
  function documentHtml(result, snapshot, options = {}) {
    const c = result.config, unit = c.unit + '/h', generated = new Date().toLocaleString('ko-KR', { hour12: false });
    const sim = options.includeSimulation === false ? null : snapshot;
    const simStatus = options.includeSimulation === false && snapshot ? '보고서에서 제외' : !sim ? '미실행' :
      sim.time >= sim.horizon ? '완료' : sim.measuredTime > 0 ? '진행 중 - 부분 결과' : '준비운전 중 - 측정 전';
    const pages = [];
    function section(title, content, cls = '') { pages.push('<section class="report-section ' + cls + '"><h2>' + esc(title) + '</h2>' + content + '</section>'); }
    const inputRows = keys => keys.map(key => {
      const field = Model.fields[key], raw = c[key], isSpeed = field?.[1] === 'speed';
      const value = labels[key] ? labels[key][raw] : raw === null ? (['firstLevelHeight', 'levelPitch', 'rearStroke'].includes(key) ? '자동' : '미입력') : key === 'transferLift' ? n(raw * 1000, 0) :
        typeof raw === 'number' ? n(raw * (isSpeed && c.speedUnit === 'm/min' ? 60 : 1), Number.isInteger(raw) && !isSpeed ? 0 : 3) : raw;
      return [field?.[0] || ({ rackDepth: '화물 보관 깊이', mode: '운전 모드', ratioBasis: '비율 기준', storage: '입고 셀 선택', retrieval: '출고 셀 선택', arrival: '작업 도착', basis: '보정 근거', method: '계산 방식', pointMode: 'P1/P2 위치' })[key] || key,
        value, isSpeed ? c.speedUnit : field?.[1] === 'unit/h' ? unit : field?.[1] === 'ratio' ? '비율' : field?.[1] || '-'];
    });
    const judgement = result.factor === null ? '판정 보류 - 운전효율 또는 세부 계수·근거를 입력해야 설계 능력을 산정할 수 있습니다.' :
      result.worstUtil > c.targetUtil ? '목표 부하율 초과 - 입력한 설비 조건과 필요 대수를 검토하세요.' : '분석상 목표 부하율 이하입니다.';
    const kpis = [['피크 총 요구량', n(result.demand, 1), unit], ['전체 이론 능력', n(result.theoryTotal, 1), unit],
      ['전체 보정 능력', n(result.capacity, 1), unit], ['목표 부하율 적용 필요 대수', n(result.required, 0), '대']];
    // Cover is compact and the subsequent specification tables retain every calculation input.
    const denseCover = c.name.length > 100 || [options.documentNo, options.recipient, options.author, options.reviewer].join('').length > 150;
    pages.push('<section class="report-section cover' + (denseCover ? ' dense' : '') + '"><div class="eyebrow">STC STUDIO / CALCULATION REPORT</div><h1>스태커크레인<br>물동량 계산 보고서</h1><p class="project-name">' + esc(c.name) + '</p>' +
      table(['문서 정보', '내용'], [['문서번호', options.documentNo || '-'], ['제출처', options.recipient || '-'], ['작성자 / 검토자', (options.author || '-') + ' / ' + (options.reviewer || '-')], ['생성일시', generated]]) +
      '<div class="summary-grid">' + kpis.map(([label, value, suffix]) => '<div><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong><small>' + esc(suffix) + '</small></div>').join('') + '</div>' +
      '<div class="judgement">' + esc(judgement) + '</div>' +
      table(['검토 항목', '적용값'], [['계산 기준', result.reference], ['설비 구성', c.cranes + '대 / 통로당 ' + result.cells + '셀 / 전체 ' + result.totalCells + '셀'],
        ['피크 입고 / 출고 요구량', n(c.inbound * c.peak, 1) + ' / ' + n(c.outbound * c.peak, 1) + ' ' + unit],
        ['목표 / 최대 STC 부하율', n(c.targetUtil * 100, 1) + '% / ' + n(result.worstUtil === null ? null : result.worstUtil * 100, 1) + (result.worstUtil === null ? '' : '%')],
        ['시뮬레이션 결과', simStatus], ['모듈 / 운동 커널', Model.VERSION + ' / ' + M.VERSION], ['입력 식별자', R.hash(c)]] ) +
      note('이론 능력과 보정 능력은 설계 계산입니다. 실행한 시뮬레이션 결과 및 적용 조건을 함께 검토합니다. 이 보고서의 수치는 PDF 보고서 생성 시점의 적용 설정을 기준으로 합니다.') + '</section>');
    const layout = Model.rackLayout(c);
    section('1. 설비 및 동작 사양',
      '<h3>랙 구성</h3>' + table(['항목', '값', '단위'], inputRows(['rackDepth', 'length', 'height', 'bays', 'levels', 'sides', 'firstLevelHeight', 'levelPitch', 'cranes'])) +
      note('적용 1단 높이 ' + n(layout.first) + ' m / 단간격 ' + n(layout.pitch) + ' m / 최상단 ' + n(layout.top) + ' m. Y(k)=1단 높이+(k-1)×단간격.') +
      '<h3>주행·승강·포크 운동</h3>' + table(['축', '최대속도 (' + c.speedUnit + ')', '가속도 (m/s²)', '감속도 (m/s²)'],
        [['주행 X', c.vx, c.ax, c.dx], ['승강 Y', c.vy, c.ay, c.dy], ['포크 Z', c.vf, c.af, c.df]].map(([name, v, a, d]) => [name, n(v * (c.speedUnit === 'm/min' ? 60 : 1)), n(a), n(d)])) +
      table(['이재 및 지연 항목', '값', '단위'], inputRows([...(Model.depthCount(c) === 2 ? ['stroke', 'rearStroke'] : ['stroke']), 'transferLift', 'forkDwell', 'position', 'control', 'loadedFactor'])) +
      (Model.depthCount(c) === 2 ? note('적용 뒷열 스트로크: ' + n(Model.depthStroke(c, 2)) + ' m. ' + Model.depthNote) : '') +
      note('상차: 포크 OUT → 캐리지 UP ' + n(c.transferLift * 1000, 0) + ' mm → 안착 대기 → 포크 IN. 하차: 포크 OUT → 캐리지 DOWN ' + n(c.transferLift * 1000, 0) + ' mm → 안착 대기 → 포크 IN.') +
      note('승하강 중 포크는 완전 신장 상태로 정지합니다. 캐리지 이재에는 승강 속도·가감속과 적재 비율을 적용합니다. 랙·포트 Y 및 P1/P2는 놓인 화물 중심이며 적재 이동 시 이재 승하강량만큼 높아집니다.'));
    section('2. 운영 조건 및 계산 기준',
      '<h3>요구량 및 설계 보정</h3>' + table(['항목', '값', '단위'], inputRows(['inbound', 'outbound', 'peak', 'targetUtil', 'operatingEfficiency', 'A', 'Ft', 'Ew', 'basis'])) +
      note('적용 보정: ' + Model.correctionText(result) + '. 운전효율 직접 입력 시 세부 A·Ft·Ew는 사용하지 않습니다.') +
      note('보정 근거 상세: ' + (c.basisNote || '미입력')) +
      '<h3>운전 및 시뮬레이션 입력</h3>' + table(['항목', '값', '단위'], inputRows(['mode', 'storage', 'retrieval', 'arrival', 'jitter', 'initialFill', 'inBuffer', 'outBuffer', 'takeaway', 'hours', 'warmup', 'seed'])) +
      note('방법: ' + result.reference + '. 총 취급량=입고+출고, DC 1회=화물 2개 취급. 전체 셀 평균은 균일 셀 선택, FEM은 CASE 참조점과 입력 이재 모델을 결합합니다.'), c.basisNote.length > 80 ? 'dense' : '');
    section('SC/DC 지정 비율 및 혼합 계산',
      table(['항목', '값'], [['운전 모드', labels.mode[c.mode]], ['지정 SC / DC', n(100 - c.dcRatio, 2) + '% / ' + n(c.dcRatio, 2) + '% (' + labels.ratioBasis[c.ratioBasis] + ', 지정 비율 모드에서 적용)'],
      ['사이클 기준 목표 / 제약 상한 / 분석 DC', [result.mix.requested, result.mix.limit, result.p].map(v => n(v * 100, 2) + '%').join(' / ')],
      ['실제 완료 SC / DC 사이클', sim ? sim.measuredCycles.sc + ' / ' + sim.measuredCycles.dc : '미실행'],
      ['측정구간 실제 DC 사이클 비율', sim?.mix.actual == null ? '측정 전' : n(sim.mix.actual * 100, 2) + '%']]) +
      note('화물 기준 f는 p=f/(2−f)로 환산합니다. Q=3600×(1+p)/평균 사이클시간. 지정 비율 모드의 SC는 포트 복귀이며, 같은 조합의 입고·출고만 DC로 묶습니다. 실제 비율은 도착·재고·버퍼에 따라 달라집니다.') +
      table(['STC', '조합 수', '전환 공차 (s/cycle)', '혼합 평균 (s/cycle)'], result.aisles.slice(0, 8).map(a => [a.aisle, a.routes.length, n(a.transition), n(a.cycle)])) +
      note('복합 포트 전환 공차시간은 조합과 SC 입출고 방향의 독립 선택 가정입니다. 실제 배차의 이동·버퍼 차단은 DES에서 확인합니다.'));
    chunk(result.aisles.slice(8), 18).forEach((rows, i) => section('STC별 혼합 계산 (계속 ' + (i + 1) + ')',
      table(['STC', '조합 수', '전환 공차 (s/cycle)', '혼합 평균 (s/cycle)'], rows.map(a => [a.aisle, a.routes.length, n(a.transition), n(a.cycle)]))));
    chunk(result.allRoutes, 8).forEach((routes, i) => section('복합 입·출고 포트 조합' + (i ? ' (계속)' : ''),
      table(['STC / 조합', 'CASE', '배분 %', 'IN XYZ m', 'OUT XYZ m'], routes.map(a => [a.aisle + ' / ' + a.id, a.femCase, n(a.weight * 100), xyz(a.ports.in), xyz(a.ports.out)])) +
      table(['STC / 조합', 'SC 입고 s', 'SC 출고 s', 'DC s'], routes.map(a => [a.aisle + ' / ' + a.id, n(a.scIn), n(a.scOut), n(a.dc)])) +
      note('배분율은 STC별 입고·출고 요구량에 동일하게 적용합니다. 동일 XYZ의 IN끼리, OUT끼리는 버퍼를 공유합니다. 복합 CASE 구성은 참조 배치를 조합한 설계 확장입니다.')));
    const bounds = Model.envelope(c);
    const portGroups = [result.aisles.slice(0, 4), ...chunk(result.aisles.slice(4), 10)];
    portGroups.forEach((aisles, i) => section('3. STC별 포트와 계산 결과' + (portGroups.length > 1 ? ' (' + (i + 1) + '/' + portGroups.length + ')' : ''),
      note('XYZ 단위 m. X=주행, Y=승강, Z=각 통로 중심에서 포크 방향. 빈 개별값의 상속을 반영한 실제 적용 좌표입니다.') +
      table(['STC', '첫 조합 IN X / Y / Z (m)', '첫 조합 OUT X / Y / Z (m)'], aisles.map(a => [a.aisle, xyz(a.ports.in), xyz(a.ports.out)])) +
      '<h3>사이클타임 및 처리능력</h3>' + table(['STC', 'SC 입고 (s)', 'SC 출고 (s)', 'DC (s)', '이론 (' + unit + ')', '보정 (' + unit + ')'],
        aisles.map(a => [a.aisle, n(a.scIn), n(a.scOut), n(a.dc), n(a.theory, 2), n(a.available, 2)]), 'compact') +
      note('단일 대수 요약은 STC 1 기준, 전체 능력은 STC별 능력의 합입니다. 필요 대수는 현재 STC 중 가장 낮은 보정 능력과 목표 부하율을 사용합니다.') +
      (i === 0 ? table(['STC 1 사이클 분해', '시간 / 값'], [['SC 주행·승강 동시 이동', n(result.scParts.move) + ' s'], ['SC 정위치', n(result.scParts.position) + ' s'],
        ['SC 포크 이재 2회 (캐리지 승하강 포함)', n(result.scParts.fork) + ' s'], ['제어 지연', n(c.control) + ' s'], ['SC 합계 / DC 합계', n(result.sc) + ' / ' + n(result.dc) + ' s'], ['분석 DC 비율', n(result.p * 100, 1) + '%']]) : '') +
      note('랙·포트 및 이재 포함 범위: X ' + n(bounds.xMin) + ' ~ ' + n(bounds.xMax) + ' m, Y ' + n(bounds.yMin) + ' ~ ' + n(bounds.yMax) + ' m.')));
    if (result.fem) {
      const rows = result.allRoutes.flatMap(a => [...a.fem.inbound, ...(a.femCase === 2 ? a.fem.outbound : [])].map(p => [a.aisle + ' / ' + a.id + ' / CASE ' + a.femCase, p.name,
        Model.address(p.id == null ? Model.nearestCell(Model.cells(c), p) : p, a.aisle - 1), xyz(p), xyz(p.reference || p)]));
      const groups = chunk(rows, 16);
      groups.forEach((rows, i) => section('4. FEM 대표점 적용' + (groups.length > 1 ? ' (' + (i + 1) + '/' + groups.length + ')' : ''),
        (Model.depthCount(c) === 2 ? note('대표점 표는 앞열(D1) 기준입니다. 계산은 동일 X·Y의 앞열·뒷열 50:50 평균이며 뒷열 |Z|=' + n(Model.depthStroke(c, 2)) + ' m입니다.') : '') +
        note('FEM 9.851 (06.2003) §4.1~4.6 참조 CASE: ' + [...new Set(result.allRoutes.map(a => a.femCase))].join(', ') + '. 각 조합의 CASE로 대표점을 선정합니다.') +
        note('적용 위치: ' + labels.pointMode[c.pointMode] + '. α=' + n(result.fem.alpha) + ' (권고 0.5<α<2' + (result.fem.alpha <= .5 || result.fem.alpha >= 2 ? ', 범위 밖' : ', 범위 이내') + ').') +
        table(['STC', '점', c.pointMode === 'cell' ? '적용 화물 셀' : '가까운 셀 (참고)', '적용 XYZ (m)', '이론 XYZ (m)'], rows, 'compact') +
        note(result.allRoutes.some(a => !a.fem.portMatch) ? '실제 포트가 CASE 참조 배치와 다른 설계 확장입니다. CASE 기준으로 셀을 선정하고 실제 외부/자유 포트까지의 이동시간을 계산했습니다.' : 'CASE 참조 포트 조건과 일치합니다.') +
        note('SC는 대표점별 복귀 사이클 평균, DC는 IN → P1 → P2 → OUT → IN입니다. CASE 2는 기본·대칭 경로를 평균합니다.')));
      const extended = result.allRoutes.filter(a => !a.fem.portMatch);
      chunk(extended, 16).forEach((aisles, i) => section('FEM 셀 선정 참조 포트' + (i ? ' (계속)' : ''),
        table(['STC', '참조 IN XYZ (m)', '참조 OUT XYZ (m)', '좌우 반전'], aisles.map(a => [a.aisle + ' / ' + a.id, xyz(a.fem.referencePorts.in), xyz(a.fem.referencePorts.out), a.fem.mirroredLayout ? '적용' : '없음'])) +
        note('이 표는 대표 셀 선정을 위한 참조 배치입니다. 실제 포트는 STC별 포트 표의 값을 사용합니다.')));
    }
    if (options.includeGraphs !== false && options.plan && options.motionConfig) {
      const diagram = C.rack(options.motionConfig, options.inPoint, options.outPoint);
      section('선택 경로 배치도', note('STC ' + ((options.aisle || 0) + 1) + ' / ' + (options.routeDescription || '선택 경로')) + diagram +
        note('배치도는 선택한 STC의 화물 중심과 입력 포트 위치를 표시합니다. 표의 전체 STC 계산 결과와 구분되는 단일 경로 예시입니다.'));
      const graphs = C.motion(options.plan, 'va', c.speedUnit).replace(/font-size="([0-9.]+)"/g, (_, size) => 'font-size="' + Math.max(14, Number(size)) + '"')
        .replace(/viewBox="0 0 500 174"/g, 'viewBox="0 0 500 194"').replace(/y="173"/g, 'y="188"');
      section('선택 경로 가감속 선도', note('STC ' + ((options.aisle || 0) + 1) + ' / ' + (options.routeDescription || '선택 경로') + ' / 전체 ' + n(options.plan.duration) + ' s') + graphs +
        note('주행 X, 승강 Y, 포크 Z의 속도·가속도입니다. 음수는 반대 방향입니다. 캐리지 이재 UP/DOWN 구간에서는 포크가 정지합니다. 그래프는 선택 경로 계산값이며 운영 시뮬레이션의 실측값이 아닙니다.'));
    }
    if (sim) section('시뮬레이션 결과',
      '<div class="judgement">실행 상태: ' + esc(simStatus) + '</div>' +
      table(['항목', '결과'], [['현재 / 종료 시각', n(sim.time, 1) + ' / ' + n(sim.horizon, 1) + ' s'], ['준비운전 / 측정 경과', n(c.warmup, 1) + ' min / ' + n(sim.measuredTime, 1) + ' s'],
        ['전체 STC 총 취급량', (sim.measuredTime > 0 ? n(sim.throughput, 2) : '측정 전') + ' ' + unit], ['입고 / 출고 / 외부 출하', [sim.inboundRate, sim.outboundRate, sim.shippingRate].map(v => sim.measuredTime > 0 ? n(v, 2) : '측정 전').join(' / ') + ' ' + unit],
        ['측정구간 입고 / 출고 완료', sim.measured.in + ' / ' + sim.measured.out + ' 개'], ['평균 / P95 / 최대 대기', [sim.meanWait, sim.p95Wait, sim.maxWait].map(v => n(v, 1)).join(' / ') + ' s'],
        ['미배차 최장 경과', n(sim.oldestPending, 1) + ' s'], ['종료/현재 대기 작업', sim.queued + ' 건'], ['재고 보존', sim.initialInventory + ' + ' + sim.completed.in + ' - ' + sim.completed.out + ' = ' + sim.stock + ' + ' + sim.outboundOnCrane + ' / ' + (sim.conservation ? '정상' : '오류')],
        ['작업 보존', (sim.created.in + sim.created.out) + ' = ' + (sim.completed.in + sim.completed.out) + ' + ' + sim.queued + ' + ' + sim.inProgress + ' / ' + (sim.jobsConserved ? '정상' : '오류')]]) +
      table(['상태', '전체 STC 시간 합 (s)'], Object.entries(sim.stateTime).map(([key, value]) => [stateNames[key] || key, n(value, 1)])) +
      note('P95 대기는 측정구간에 배차된 작업 표본 기준이며 미배차 작업은 포함하지 않습니다. 고장 없는 DES로 분석 보정계수를 다시 차감하지 않습니다. 진행 중 결과는 최종 달성 물동량으로 사용하지 않습니다.'));
    if (sim?.aisles) chunk(sim.aisles, 20).forEach((aisles, i) => section('STC별 시뮬레이션 결과' + (i ? ' (계속)' : ''),
      note('전체 운전 입고/출고 완료 수량과 측정구간 처리량을 표시합니다. 실행 상태: ' + simStatus) +
      table(['STC', '시드', '입고 완료', '출고 완료', '재고', '대기', '처리량 (' + unit + ')', '보존'], aisles.map(a => [a.aisle, a.seed, a.completed.in, a.completed.out, a.stock, a.queued, a.measuredTime > 0 ? n(a.throughput, 2) : '측정 전', a.conservation && a.jobsConserved ? '정상' : '오류']), 'compact')));
    section('적용 조건 및 민감도',
      '<h3>계산식과 적용 범위</h3>' +
      note('동시 이동시간=max(주행시간, 승강시간). 이동이 있을 때 정위치 시간 1회, 제어 지연은 사이클당 1회입니다. 이재 1회=포크 OUT+캐리지 승하강+안착 대기+포크 IN이며 SC 2회, DC 4회입니다.') +
      note('SC 주행·승강은 각 포트 복귀 사이클 기준입니다. DC는 서로 다른 셀을 사용하고 OUT→IN 공차 복귀를 포함합니다. SC-stay 분석값은 SC-return 참고값이며 실제 제자리 대기는 DES에서 확인합니다.') +
      note('보정 능력=이론 능력×운전효율(%)÷100. 운전효율 미입력 시 A×Ft×Ew를 대신 적용합니다. 필요 대수=ceil(피크 총 요구량/(현재 STC 중 최저 보정 능력×목표 부하율)). 목표 부하율은 표시 처리량에 곱하지 않습니다. 사이클 시간과 DES 결과에는 운전효율을 추가 적용하지 않습니다.') +
      note('DC 셀 쌍 산정: ' + result.dcSampling.method + ', n=' + result.dcSampling.samples + ', 사이클시간 표준오차=' + n(result.dcSampling.se) + ' s. 적재 비율은 주행·승강 속도와 가감속에 함께 적용합니다.') +
      note('Single / Double Deep, Single Fork, 균등 랙, 통로당 1대입니다. creep, jerk 제한 S-curve, 고장, 더블딥 화물 재배치·SKU 지정 출고, Twin Fork, 공유레일 충돌은 포함하지 않습니다. 현장 실측 및 규격 적합성 판정은 별도입니다.') +
      '<h3>보정계수 민감도</h3>' +
      (result.factor === null ? note('운전효율 또는 세부 계수·근거 미입력으로 민감도를 산정하지 않았습니다.') : table(['계수', '변경률', '적용값', '전체 보정 능력 (' + unit + ')', '필요 대수'],
        Model.sensitivity(result).map(r => [r.key === 'operatingEfficiency' ? '운전효율' : r.key, n(r.delta * 100, 0) + '%', n(r.value) + (r.key === 'operatingEfficiency' ? '%' : ''), n(r.capacity, 2), r.required]))) +
      note('세부 계수 방식에서 A·Ft·Ew 중 1.0은 해당 손실을 제외하는 조건입니다. 이론 능력, 종료 대기 작업, 재고 부족·만재 및 버퍼 차단을 함께 검토합니다.'));
    const title = c.name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 70) + '_물동량계산_보고서';
    return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>' + esc(title) + '</title><style>' + styles + '</style></head><body>' +
      '<nav class="print-toolbar"><div><b>제출용 PDF 보고서</b><p>PDF 저장 / 인쇄 → 대상: PDF로 저장 → 용지: A4. 브라우저 머리글·바닥글은 끄세요.</p></div><button id="printPdf">PDF 저장 / 인쇄</button><button id="closeReport">닫기</button></nav>' +
      '<main>' + pages.join('') + '</main><script>document.getElementById("printPdf").addEventListener("click",function(){window.print();});document.getElementById("closeReport").addEventListener("click",function(){window.close();});</script></body></html>';
  }
  const styles = `
    @page { size:A4; margin:14mm 14mm 17mm; @bottom-left { content:"STC Studio / 물동량 계산 보고서"; font:8pt "Malgun Gothic",sans-serif; color:#627480; } @bottom-right { content:counter(page) " / " counter(pages); font:8pt Arial,sans-serif; color:#627480; } }
    *{box-sizing:border-box}body{margin:0;background:#e8edf1;color:#192f3d;font:9pt/1.55 "Malgun Gothic","Segoe UI",sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    main{width:210mm;margin:20px auto;padding:14mm;background:white}.print-toolbar{padding:15px 24px;background:#123342;color:white;display:flex;align-items:center;gap:12px;position:sticky;top:0;z-index:1}.print-toolbar div{flex:1}.print-toolbar p{font-size:11px;margin:4px 0 0}.print-toolbar button{padding:10px 16px;border:0;border-radius:5px;cursor:pointer;background:#d7f0e9;color:#153f43;white-space:nowrap}
    .report-section{break-before:page;margin-bottom:18mm}.report-section:first-child{break-before:auto}.report-section:last-child{margin-bottom:0}h1{font-size:27pt;line-height:1.4;margin:10mm 0 5mm;letter-spacing:-.6pt}h2{font-size:16pt;margin:0 0 7mm;padding-bottom:3mm;border-bottom:2px solid #16828a;break-after:avoid}h3{font-size:10.5pt;margin:5mm 0 2mm;break-after:avoid}.eyebrow{font-size:8pt;letter-spacing:2px;color:#16828a}.project-name{font-size:13pt;font-weight:bold;margin:0 0 7mm;overflow-wrap:anywhere}
    table{border-collapse:collapse;width:100%;margin:3mm 0 4mm;table-layout:fixed;font-size:8.5pt}thead{display:table-header-group}th{background:#edf3f5;color:#31576b;text-align:left;font-weight:bold}th,td{border:1px solid #d5e0e5;padding:2.1mm 2.4mm;vertical-align:top;overflow-wrap:anywhere;white-space:normal;font-variant-numeric:tabular-nums}tr{break-inside:avoid}table.compact{font-size:8pt}table.compact th,table.compact td{padding:2mm 1.6mm}.note{font-size:8.5pt;color:#506b79;line-height:1.65;margin:3mm 0;overflow-wrap:anywhere;orphans:3;widows:3}p{orphans:3;widows:3}
    .judgement{background:#edf6f3;border-left:3px solid #16828a;padding:3mm 4mm;margin:4mm 0;font-weight:bold;break-inside:avoid}.summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm;margin:6mm 0}.summary-grid>div{border:1px solid #d2e0e4;padding:4mm 3mm;break-inside:avoid}.summary-grid span{display:block;font-size:8pt;min-height:10mm}.summary-grid strong{display:block;font-size:18pt;color:#087f80;overflow-wrap:anywhere}.summary-grid small{font-size:8pt;color:#617985}
    .dense th,.dense td{padding-top:1.4mm;padding-bottom:1.4mm}.dense h3{margin-top:3mm}.cover.dense h1{font-size:23pt;margin:4mm 0 3mm}.cover.dense .project-name{font-size:10pt;margin-bottom:4mm}.cover.dense .summary-grid{margin:4mm 0}.cover.dense .summary-grid>div{padding:3mm}.cover.dense .summary-grid span{min-height:8mm}
    svg{width:100%;height:auto;display:block;overflow:visible}.axis-chart-card{margin:0 0 5mm;break-inside:avoid}.axis-chart-heading h3{font-size:11pt;margin:0 0 2mm}.axis-chart-heading output{display:none}.chart-pair{display:grid;grid-template-columns:1fr 1fr;gap:5mm}.chart-title{font-size:8pt;color:#426574;margin-bottom:1mm}.dot{display:inline-block;width:2mm;height:2mm;margin-right:2mm;border-radius:50%}.dot.x{background:#139caa}.dot.y{background:#d38b30}.dot.f{background:#577eda}
    @media print{body{background:white}.print-toolbar{display:none}main{width:auto;margin:0;padding:0}.report-section{margin-bottom:0}}
    @media screen and (max-width:850px){main{width:100%;padding:20px;margin:0}.print-toolbar{position:static;flex-wrap:wrap}.print-toolbar div{flex-basis:100%}.summary-grid{grid-template-columns:1fr 1fr}.chart-pair{grid-template-columns:1fr}}
  `;
  root.STCPrint = { document: documentHtml };
})(globalThis);

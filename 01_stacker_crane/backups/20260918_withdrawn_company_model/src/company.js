(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./model.js'));
  else root.STCCompany = factory(root.STCModel);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Model) {
  'use strict';
  // SMC stcfem2 line format, verified with the supplied INQUIRY_인도 file.
  // Reject unsupported layouts instead of silently importing a different model.
  function parse(text, previous = Model.defaults) {
    const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
    while (lines.length && lines.at(-1).trim() === '') lines.pop();
    if (lines.length !== 87) throw Error('회사 입력 파일은 87행 형식이어야 합니다. JSON은 일반 불러오기를 사용하세요.');
    const n = (i, blank = false) => {
      const s = lines[i].trim();
      if (blank && !s) return 0;
      if (!s || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(s) || !Number.isFinite(Number(s))) throw Error('회사 파일 ' + (i + 1) + '행의 숫자를 확인하세요.');
      return Number(s);
    };
    const positive = (i, label) => { const v = n(i); if (v <= 0) throw Error(label + '은 0보다 커야 합니다.'); return v; };
    if (n(84) !== 1 || n(85) !== 0 || n(86) !== 1) throw Error('현재 회사 파일 변환은 CASE 1 · Single fork · 역번지 0을 지원합니다.');
    const bayCount = n(2), width = positive(5, '번지 폭'), home = n(8), pallets = n(66), cranes = n(65);
    if (!Number.isInteger(bayCount) || bayCount < 2 || !Number.isInteger(pallets) || pallets < 1 || pallets > 2 || !Number.isInteger(cranes) || cranes < 1 || home < 0) throw Error('번지 수·번지당 팔레트·대수·홈 피치를 확인하세요.');
    if ([3, 4, 6, 7].some(i => n(i, true) !== 0)) throw Error('현재 회사 파일 변환은 균일한 1개 번지 구간을 지원합니다.');
    const heights = lines.slice(9, 60).map((_, i) => n(i + 9));
    const firstZero = heights.indexOf(0), active = firstZero < 0 ? heights : heights.slice(0, firstZero);
    if (active.length < 2 || active.some(v => v <= 0 || v !== active[0]) || (firstZero >= 0 && heights.slice(firstZero).some(v => v !== 0))) throw Error('현재 회사 파일 변환은 2단 이상의 균일한 단간격을 지원합니다.');
    if (n(67) !== 0 || n(68) !== 0) throw Error('CASE 1 파일의 입출고대 거리·높이는 0이어야 합니다.');
    if (n(71) !== n(72) || n(74) !== n(75)) throw Error('현재 회사 파일 변환은 승강·포크 각각의 초고속과 고속이 같은 사양을 지원합니다.');
    const vx = positive(69, '주행 고속') / 60, vy = positive(72, '승강 고속') / 60, vf = positive(75, '포크 고속') / 60;
    const ax = vx / positive(77, '주행 가속시간'), ay = vy / positive(78, '승강 가속시간'), af = vf / positive(79, '포크 가속시간');
    const cfg = { ...Model.defaults, name: [lines[0].trim(), lines[1].trim()].filter(Boolean).join(' · '),
      length: (bayCount - 1) * width / 1000, height: (active.length - 1) * active[0] / 1000,
      bays: bayCount * pallets, levels: active.length, sides: 2, firstLevelHeight: 0, levelPitch: active[0] / 1000,
      ioX: -home / 1000, ioY: 0, outX: -home / 1000, outY: 0, cranes,
      method: 'fem', femCase: 1, pointMode: 'continuous', motionModel: 'creep',
      vx, ax, dx: ax, vy, ay, dy: ay, vf, af, df: af,
      stroke: positive(60, '포크 스트로크') / 1000, transferLift: n(61) / 1000,
      lowVx: n(70) / 60, lowVy: n(73) / 60, lowVf: n(76) / 60,
      approachX: n(62) / 1000, approachY: n(63) / 1000, approachF: n(64) / 1000,
      moveAllowance: n(82), forkDwell: n(83), position: 0, control: 0, loadedFactor: 1,
      A: 1, Ft: 1, Ew: n(81) / 100, basis: 'vendor', mode: 'sc-return', dcRatio: 0,
      basisNote: '회사 입력 파일: CASE 1, Single fork. 운전효율을 Ew에 적용(A=Ft=1). 홈 피치는 공용 IN/OUT에 동일 적용. 랙 길이·높이는 첫 번지·첫 단 기준 이동범위이며, 3D 셀은 균등 배치 개략도. 요구량은 별도 사용자 입력.'
    };
    // Arrival demand is not stored by the company program.
    for (const k of ['inbound', 'outbound', 'peak', 'targetUtil']) cfg[k] = previous[k] ?? Model.defaults[k];
    return Model.validate(cfg);
  }
  return { parse };
});

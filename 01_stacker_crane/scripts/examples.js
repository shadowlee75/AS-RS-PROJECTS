const fs = require('node:fs');
const path = require('node:path');
const Model = require('../src/model.js');
const base = path.resolve(__dirname, '../examples'); fs.mkdirSync(base, { recursive: true });
const examples = [
  ['01_일반랙_예시.json', { name: '일반 랙 30×10 · 예시' }],
  ['02_과부하_대기열.json', { name: '과부하 대기열 · 예시', inbound: 90, outbound: 90, peak: 1, inBuffer: 4, mode: 'dc' }],
  ['03_출고버퍼_차단.json', { name: '출고 반출 지연 · 예시', inbound: 70, outbound: 70, peak: 1, outBuffer: 2, takeaway: 120 }],
  ['04_소형랙_재고부족.json', { name: '소형 랙 재고 부족 · 예시', length: 12, height: 6, bays: 4, levels: 3, sides: 1, inbound: 10, outbound: 40, peak: 1, initialFill: .25, hours: 1 }]
];
for (let femCase = 1; femCase <= 6; femCase++) {
  const c = { ...Model.defaults, method: 'fem', femCase, ioY: [3, 5, 6].includes(femCase) ? 8 : 0 };
  examples.push(['FEM_CASE_' + femCase + '.json', { ...c, ...Model.casePorts(c), name: 'FEM CASE ' + femCase + ' · ' + Model.caseNames[femCase - 1] }]);
}
examples.push(['05_STC3대_개별XYZ포트.json', { name: 'STC 3대 · 개별 IN OUT XYZ', cranes: 3, bays: 12, levels: 6, hours: 1, warmup: 0, inbound: 120, outbound: 120, peak: 1,
  ports: [{ ioX: 0, ioY: 0, ioZ: -.8, outX: 60, outY: 0, outZ: 1 }, { ioX: 12, ioY: 2, ioZ: -.6, outX: 48, outY: 10, outZ: -1.1 }, { ioX: 30, ioY: 4, ioZ: 1, outX: 0, outY: 0, outZ: -.6 }] }]);
examples.push(['06_1단높이_단간격.json', { name: '1단 높이 0.5m · 단간격 2m · STC 2대', firstLevelHeight: .5, levelPitch: 2, cranes: 2 }]);
examples.push(['07_외부포트_P1P2_화물중심.json', { name: '외부 포트와 P1·P2 화물 중심 · 기능 예시', method: 'fem', femCase: 6, pointMode: 'cell', length: 33.9, height: 17, bays: 6, levels: 6,
  firstLevelHeight: 1.3, levelPitch: 2.5, cranes: 2, ioX: -3, ioY: 9.6, outX: -3, outY: 1.6, inbound: 70, outbound: 70, peak: 1,
  ports: [{}, { ioX: 38, ioY: 9.6, outX: 38, outY: 1.6 }], basisNote: '기능 설명용 가정값입니다. 첨부 도면의 세로 치수·포트 X·STC 대수를 확정한 설정이 아닙니다.' }]);
for (const [name, patch] of examples) fs.writeFileSync(path.join(base, name), JSON.stringify(Model.pack({ ...Model.defaults, ...patch }), null, 2) + '\n');
console.log('Saved ' + examples.length + ' example projects.');

# 왕복식 수직 리프트 물동량 계산기

v1.0.0 · 2026-09-16 · 루트 배포 파일: `리프트_실행.html`

독립 승강로 1~8대, 2~20층, 팔레트·박스·토트에 대한 해석 계산과 사건 기반 시뮬레이션. Three.js r128과 OrbitControls를 포함한 오프라인 단일 HTML.

## 실행 및 검사

```powershell
npm.cmd run build
npm.cmd test
npm.cmd run test:browser
```

Node.js 빌드에는 외부 패키지가 필요 없다. 브라우저 검증은 기존 `06_conveyor/node_modules/playwright`와 설치된 Edge를 사용한다. 별도 설치 위치는 `LIFT_PLAYWRIGHT_PATH` 환경변수로 지정한다.

## 구조

| 모듈 | 역할 |
| --- | --- |
| src/motion.js | 기존 검증된 속도곡선 해석기의 solve/at를 재사용, 승강 전용 노출 |
| src/model.js | 입력 계약, 검증, 적재 상한, OD·시간대, 해석, JSON |
| src/engine.js | 결정적 이산 사건, 배차, 배치, 이재부·버퍼, planned stop, 지표·snapshot |
| src/worker.js | UI를 막지 않는 운전·개선안 계산 |
| src/scene.js | 실제 운동곡선과 이벤트 이력에서 Three.js 장면 재생 |
| src/xlsx.js | 기존 LOOP 프로그램의 오프라인 XLSX 전송 코드 재사용 |
| src/io.js | 8시트 Excel 스키마, CSV, 보고서, 포트·완료 이력 계약 |
| src/app.js | 입력 편집, 검증, 결과 무효화, worker 취소, 재생 |

## 모델 계약

- 내부 단위 m, m/s, m/s², s, kg, handling-unit. 엑셀은 열 제목에 명시한 m/min 및 min 단위로 변환한다.
- `LiftModel.pack/unpack`: `vertical-lift/project@1`, `deviceType: vertical_lift`.
- `LiftEngine.Simulation.advanceTo(t)`: 시계를 단조 증가시켜 단계 실행한다. 현재 시각 이전이나 종료 이후 요청은 거절한다.
- `LiftEngine.run(config)`, `metrics(run, t)`, `snapshot(run,t)`.
- `LiftIO.plugin`: validateConfig / calculate / createModel / getPorts / collectMetrics / serialize / migrate / buildReport.
- `externalCoSimulation: false`: 포트·설정·후단 인계 이력 교환용 계약. 외부 시계와 cargo ownership handshake를 구현했다고 주장하지 않는다.

상차가 끝나야 입력 공간을 비우고, 하차를 시작하기 전에 출력 공간을 예약한다. 후단 반출 중 화물은 출력 버퍼를 점유한다. 배치 수량은 물리 공간/하중뿐 아니라 출발·도착 버퍼 상한을 넘지 않는다. 동일한 층·방향 자원에서 여러 리프트가 동시에 상하차하지 않는다.

모든 도착을 난수 시드와 시간대 누적 강도로 생성한다. 같은 비율의 시간대를 쪼개도 도착 수열을 재시작하지 않는다. 가용도 계수는 해석에만 적용하며 DES 이벤트에 다시 곱하지 않는다.

3D 조작: 왼쪽 드래그 회전, **휠 버튼 누른 채 드래그 화면 이동**, 휠 굴리기 확대/축소. 도어·이재는 개념 표현, 승강 위치는 운동 해석값이다.

## 배포 및 자료

- `../리프트_사용매뉴얼.md`, `../리프트_사용매뉴얼.html`
- `../리프트_물동량계산_참고자료_20260916.md`
- `examples/`: 5개 입력 예제
- `qa/`: 핵심 시험, 브라우저 검증, 이미지, 빌드 해시

제한: 단일 캐리어/승강로, 전 층 서비스, 동일 OD 배치, 즉시 일시정지 근사. 복층 캐리어·중간 목적지 정차·연속식·저크·구조/안전인증/전력 계산은 포함하지 않는다. 전체 창고 최적화 대신 7개 지정 조건을 같은 수요·시드로 비교한다.

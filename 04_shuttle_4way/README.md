# 04 · 4-way Shuttle Studio

층고정 4-way 셔틀 + 화물 리프트의 물동량 계산, 이산사건 시뮬레이션, 오프라인 Three.js 3D 프로그램입니다. v0.1.0 / 2026-09-11.

- [실행 HTML](../셔틀_실행.html)
- [사용 매뉴얼](../셔틀_사용매뉴얼.md)
- [검증 결과](qa/검증결과_v0.1.0.md)
- [기존 모델 비교 범위](qa/기존모델_비교.md)

## 실행

배포 HTML 하나를 Edge 또는 Chrome으로 엽니다. 외부 CDN·서버·설치가 필요 없습니다. Three.js r128과 OrbitControls, MIT 라이선스를 파일 안에 포함합니다.

프로젝트 JSON은 SI 단위이며 실행 중인 상태는 저장하지 않습니다. 완료 로그 CSV와 반복 실험 JSON은 별도로 내보냅니다. 화면의 PDF 버튼은 인쇄 가능한 HTML 미리보기를 엽니다.

## 구성

| 파일 | 역할 |
|---|---|
| src/motion.js | 연속 위치·속도 가감속 커널 |
| src/model.js | 입력 검증, X/Z 경로, 리프트 동작, 층별 업무량 분석 |
| src/engine.js | 시드 도착·재고·TU 소유권, 이산사건, 유한 버퍼, 자원 예약 |
| src/scene.js | 실제 엔진 좌표와 재고에 연결한 다층 3D, 2D 대체 표시 |
| src/view.js | 표·차트·2D 배치 |
| src/report.js | SI 계산서, 인쇄 보고서, CSV |
| src/app.js | 입력·탭·재생·프로젝트·Worker 조합 실험 |
| src/template.html / style.css | UI와 스타일 |
| vendor/ | Three.js·OrbitControls 원본과 SHA-256·라이선스 |
| tests/invariants.js | 소스·배포본 공용 계산 및 DES 검증 |
| examples/ | 7개 프로젝트 JSON과 작업이력 CSV |
| qa/ | 검증 JSON, 화면 캡처, 결과 문서 |

## 재빌드·검증

Node.js가 있으면 런타임 패키지 설치 없이 빌드·핵심 검증을 실행할 수 있습니다.

~~~powershell
node scripts/build.js
node tests/invariants.js
node scripts/shipcheck.js
node scripts/examples.js
node scripts/legacy-check.js
~~~

legacy-check는 기존 4_4Way Shuttle/4way_shuttle_calculator_v2.html을 읽습니다. 외부 작업공간에서는 인수로 해당 HTML 경로를 전달하세요.

브라우저 검증은 Playwright와 Edge를 사용합니다. 설치된 Playwright 경로를 SHUTTLE_PLAYWRIGHT_PATH 환경변수로 지정할 수 있습니다. 미지정이면 일반 playwright 패키지를 불러옵니다.

~~~powershell
node scripts/browser-check.js
~~~

검증 환경은 Node 24.18.1 / Windows / Edge 138.0.3351.95입니다. 브라우저 테스트는 headless Edge에서 SwiftShader를 사용하며, WebGL 및 Worker 비활성 대체 실행도 확인합니다.

## 계산·제어 범위

각 셔틀은 한 층에서 1개 화물을 운반합니다. X/Z 순차 이동과 정위치·전환을 실제 경로 단계로 계산합니다. 각 작업은 전용 주차칸에서 출발해 복귀합니다.

자원 예약은 교차로 노드·연결 구간·통로·인계 도크를 대상으로 전체 경로를 사전 예약합니다. 경합 시 시작 시각 전체를 이동하며 주차칸에서 기다립니다. 0.05초의 예약 경계 여유가 있습니다. 연속 추종·본선 대기·차량 층이동은 모델링하지 않습니다.

리프트는 독립 샤프트, 지상 공통 I/O, 모든 층 서비스 방식입니다. 층 버퍼 연결부는 리프트 인계시간에 포함합니다. 화물 질량은 정격 적합성 검사에 사용하며 속도·가속도는 입력된 공차/적재 사양을 따릅니다.

분석은 균일한 저장 셀 위치와 입력 층별·방향별 물량 비율을 유지하는 자원 업무량 기준입니다. 실제 경합과 재고 상태는 DES가 계산합니다. 필요 대수는 무경합 참고값이며 보장 용량이 아닙니다.

## 변경 이력

v0.1.0: 4-way 셔틀 경로, TU 리프트, SC/DC, 층별 수요·필요 대수, 재고·버퍼, 3D, 작업이력, 운동 그래프, 대수 조합 실험, JSON·CSV·MD·인쇄 보고서.



## 3D 화면 이동 · 2026-09-16

3D 화면 안에서 **마우스 휠 버튼(가운데 버튼)을 누른 채 드래그**하면 화면이 상하좌우로 이동합니다. 휠을 굴리면 확대·축소하고, 좌클릭 드래그는 회전, 우클릭 드래그는 이동입니다. 장비 선택은 좌클릭으로 합니다. 변경된 실행 HTML을 새로 열면 적용됩니다.

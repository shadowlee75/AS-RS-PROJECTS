# Loop RGV Studio

오프라인 단일 HTML 계산기, 버전 0.2.1.

- [실행 파일](../LoopRGV_실행.html)
- [사용 매뉴얼](../LoopRGV_사용매뉴얼.md)
- [검증 결과](qa/검증결과_v0.1.0.md)
- [기존 모델 비교](qa/기존모델_비교.md)

## 구현 범위

단방향 폐루프, 정·역방향, 최대 64대, 실제 OD, 공차·적재 가감속, 곡선·사용자 속도 제한, 저속 접근, 본선 이재, 유한 출고 버퍼, 선행차 추종과 고정 블록 예약을 지원합니다. 오프라인 Three.js 3D는 차량 위치·방향·상하차 상태에 연결되어 있으며 카메라 회전·추적·차량 선택을 제공합니다.

분석은 독립 OD 혼합의 공차 근사 또는 균일 위치 1랩 개략 모델입니다. η 경험식의 근거를 명시하고 A·Ew·η를 분석에만 적용합니다. 고정 시간격자 기반 교통·이벤트 결합 시뮬레이션은 별도의 관측량을 제공합니다. 대수별 실험은 공통 도착 시드, 반복 평균·Student t 95% CI와 실제 측정 범위만 표시합니다.

추월·대피선·분기·이중루프·배터리·고장·현장 PLC는 포함하지 않습니다. 제동·추종은 앞 차량의 현재 위치를 정지 장애물로 취급하는 보수 제어입니다.

## 파일 구성

| 파일 | 역할 |
|---|---|
| src/motion.js | 연속 경계속도 운동 커널, v1.0.0 |
| src/model.js | SI 입력·검증, 폐루프 좌표·경로, 경험식 분석 |
| src/engine.js | 결정적 도착, 교통·배차·이재·버퍼·블록, 통계 |
| src/view.js | SVG 배치·분석·운동 그래프 |
| src/scene.js | Three.js 폐루프·차량·화물·카메라 |
| src/report.js | CSV·Markdown·인쇄용 HTML |
| src/xlsx.js, src/excel.js | 오프라인 XLSX 입출력, 8개 시트의 전체 조건 매핑·검증 |
| src/app.js | 입력 편집·단위 전환·재생·실험 Worker |
| src/template.html, src/style.css | 화면 구조와 반응형 스타일 |
| vendor/ | Three.js r128, OrbitControls, MIT 라이선스와 SHA-256 |
| examples/ | 5개 프로젝트 JSON과 작업이력 CSV |
| tests/invariants.js | 소스와 배포 HTML에 공통 실행하는 검증 |
| scripts/ | 빌드와 QA 스크립트 |
| qa/ | 검증 기록·스크린샷·재현 결과 |

## 빌드와 검사

Node.js 18 이상으로 프로젝트 폴더에서 실행합니다. 실행 프로그램 자체에는 Node가 필요하지 않습니다.

~~~powershell
node --test tests/core.test.js tests/excel.test.js tests/large-input.test.js tests/tables.test.js
node scripts/build.js
node scripts/shipcheck.js
node scripts/examples.js
node scripts/legacy-check.js
~~~

build는 벤더 해시를 검사하고 라이선스·스타일·스크립트 13개를 상위 폴더의 LoopRGV_실행.html 안에 넣습니다. shipcheck는 실제 HTML에서 스크립트를 추출해 소스 SHA-256 일치·구문·외부 자원 의존성·동일 검증 39개를 확인합니다. 시뮬레이션 모듈 검사에서는 Math.random 사용을 차단해 도착 시드의 재현성을 확인합니다.

브라우저 검증은 Edge와 Playwright가 필요합니다. Playwright를 개발 환경에 설치하거나 기존 패키지 폴더를 지정합니다.

~~~powershell
$env:LOOP_PLAYWRIGHT_PATH = 'C:\경로\node_modules\playwright'
node scripts/browser-check.js
~~~

연결된 Browser 런타임에 사용 가능한 브라우저가 없어 로컬 Headless Edge를 대체 검증 수단으로 사용했습니다. 테스트는 WebGL을 포함해 40항목을 검사합니다. 원격 HTTP 요청은 차단합니다. Worker·WebGL 비지원 대체 동작도 확인합니다.

## 데이터 및 재현

JSON 스키마는 rgv-loop/project@1, deviceType은 rgv_loop입니다. 내부 단위는 m·m/s·s·m/s²입니다. UI 단위와 이재 표시 모드 전환은 물리량을 유지합니다. 저장 대상은 입력과 이력이며 실행 중 상태는 저장하지 않습니다.

교통은 하나의 고정 시각 격자에서만 전진합니다. 재생·탐색·분할 계산 호출 횟수가 달라도 같은 시각 결과는 같습니다. 차량 크기·블록·최대속도에 따라 실제 격자는 입력값보다 작아질 수 있습니다. 같은 시각의 0초 이재·즉시 반출 이벤트는 정산 후 스냅샷을 표시합니다. 동일 위치의 완전 무시간 OD는 거절합니다.

출고 화물은 목적지 하차에서 완료되고 외부 반출에서 출하됩니다. 배치 반출은 수량×반출 간격 후 배치 전체를 반출합니다. 이벤트의 다음 격자 반영 때문에 누적 지연이 있을 수 있습니다.

진전이 5초 이상 없고 모든 차량이 정지했으며 예정 이재·반출도 없을 때 교착 징후를 표시합니다. 초기 배차 순간의 0속도를 교착으로 보지 않습니다.

## 기존 자료와의 관계

기존 2. Loop RGV 폴더의 HTML 입력 구성·OD 좌표를 참조하고, 통합 플랫폼의 연속 운동 커널과 새 다차량 시뮬레이션을 사용했습니다. 레거시 계산의 시간 분기·공차 1/N·경험 대기값을 그대로 재사용하지 않았습니다. 기존 Python 35개 검증 원본은 확보되지 않아 실행하지 않았습니다. 비교 스크립트는 실제 기존 HTML의 defaults 및 계산 함수를 직접 추출해 경계값을 재현합니다.

참조 개발계획과 PRD의 규격 표기는 계산 도구의 범위 설명이며 규격 적합성 검증을 의미하지 않습니다. 현장 성능과 기계·제어 안전 검증은 이번 자동 검증 범위에 포함되지 않습니다.


## v0.2.0 엑셀 입력조건 교환

상단 엑셀 저장 / 엑셀 불러오기로 전체 기본조건, 설비스테이션, OD물동량, 시간대비율, 제한속도, 작업이력, 실험조건을 교환합니다. 안내를 포함해 8개 시트입니다. 숫자·문자형 셀, 선택 목록, 비율 서식, 첫 행 고정과 필터를 제공합니다.

워크북 스키마는 rgv-loop/workbook@1입니다. 엑셀 단위는 m, m/min, m/s², s이며 이재는 항상 총 시간입니다. 화면 단위·상세 표시로 가져올 때 변환합니다. 전체 입력 검증을 통과해야 화면에 적용하고 기존 실행 결과를 초기화합니다. 실패하면 현재 입력과 결과를 유지합니다. 수식·매크로·암호화는 받지 않습니다. 일반 Excel에서 다시 저장한 deflate 압축 및 sharedStrings 형식을 읽습니다. 실행 시 외부 라이브러리나 서버 요청이 없습니다.

검증: node scripts/excel-browser-check.js. 실제 Microsoft Excel 재저장 검사는 scripts/excel-interop-check.ps1 실행 후 node scripts/excel-browser-check.js --interop. 결과는 qa/excel-20260915/에 있습니다.

파일 형식 참고: https://learn.microsoft.com/en-us/office/open-xml/spreadsheet/structure-of-a-spreadsheetml-document 및 https://developer.mozilla.org/en-US/docs/Web/API/DecompressionStream . XLSX 전송 코드는 동일 프로젝트 AGV/AMR의 구현을 참고하고 길이·CRC·셀 수 검증을 보완했습니다.

## v0.2.2 입력 범위와 오류 안내

스테이션 30개 → 200개, 측정시간 4시간 → 24시간으로 확대했습니다. Model.LIMITS를 엑셀과 모델 검증이 함께 사용합니다. 기존 계산 규모·예상 작업 수 한도는 유지합니다. 누락 스테이션은 ID별로 합쳐 표시하고 수정할 시트·행과 방법을 안내합니다. 등록되지 않은 스테이션의 위치·사양은 자동 생성하지 않습니다.

59개 모델·엑셀 검사, 100개 스테이션/8시간 전체 시뮬레이션, 200개 스테이션/24시간 구성과 3D 렌더, 실패 시 이전 상태 보존을 확인했습니다. 상세 결과: qa/large-input-20260915/.

스테이션이 많은 2D 배치도에서는 모든 지점 표시를 유지하고 겹치는 이름만 생략합니다. 각 지점에 마우스를 올리면 ID·이름·위치를 확인할 수 있습니다.


## v0.2.2 스테이션 연동 입력표

P번호·D번호가 모두 등록되면 같은 번호 OD를 0개/h로 자동 추가합니다. 기존 유효 OD ID·물동량은 유지합니다. 스테이션 ID 변경은 OD·작업이력 참조에도 반영합니다. 스테이션 삭제 시 연관 OD는 제외 목록으로 보관하며 작업이력에서 사용 중인 스테이션은 먼저 이력을 정리해야 합니다.

빈 시간대 표는 준비운전과 측정 1시간 간격으로 생성합니다. 자동 모드에서 운전시간을 바꾸면 구간을 갱신하고 기존 배율을 유지합니다. 시작·끝 직접 편집은 수동 모드로 전환합니다. 같은 배율의 연속 시간대는 작업 도착을 연속 생성하여 100% 표 분할 전후 난수 도착이 같습니다. 생성 모드는 JSON과 엑셀에 저장되고 이전 파일도 지원합니다.

엑셀의 누락 스테이션 OD는 정리 검토 화면에서 원본 행·물동량을 확인하고 정리·적용할 수 있습니다. 제외 OD CSV 보관과 취소를 지원합니다. 숫자·단위·작업이력 오류는 계속 거절합니다. 자동 생성은 프로그램 불러오기 시 수행합니다.

검증: node --test tests/core.test.js tests/excel.test.js tests/large-input.test.js tests/tables.test.js 및 node scripts/auto-tables-browser-check.js. 자료: qa/auto-tables-20260915/.

# Conveyor Flow Studio

팔레트·박스·토트 컨베이어의 물동량, 병목, 유한 버퍼, 3D 운전 재생을 제공하는 독립 실행 모듈입니다.

- 실행: [../컨베이어_실행.html](../컨베이어_실행.html)
- 설명서: [../컨베이어_사용매뉴얼.md](../컨베이어_사용매뉴얼.md)
- 연동 계약: [연동규격.md](연동규격.md)
- 검증 결과: [검증결과.md](검증결과.md)

## 개발 명령

Node.js 18 이상에서 다음 명령을 사용합니다. 배포 HTML 실행에는 Node가 필요하지 않습니다.

```powershell
node scripts/build.js
node --test tests/core.test.js
node scripts/serve.js
```

개발 서버 주소는 `http://127.0.0.1:8766`입니다. HTML은 `file://` 직접 실행도 지원합니다.

UI 검증은 Playwright 1.56.1 및 설치된 Edge를 사용합니다.

```powershell
npm.cmd ci --ignore-scripts
node scripts/browser-check.js
```

가상 드라이브에서 npm 압축 해제가 실패하면 로컬 디스크에서 설치한 Playwright의 절대 모듈 경로를 지정할 수 있습니다.

```powershell
$env:CONVEYOR_PLAYWRIGHT_PATH = 'C:\local-qa\node_modules\playwright'
node scripts/browser-check.js
```

## 파일 구조

| 경로 | 책임 |
|---|---|
| src/model.js | 프로젝트, 검증, 단위, 경로, 운동 프로파일, 해석 능력 |
| src/engine.js | 이진힙 사건 큐, 유한 버퍼, 예약, 시드 난수, 통계, 재생 스냅샷 |
| src/worker.js | 계산과 민감도 비교의 Worker 실행 |
| src/io.js | 프로젝트 보조 입출력, CSV, 보고서, 포트, 플러그인 공개 API |
| src/scene.js | Three.js 3D와 Canvas 2D 편집·폴백 |
| src/app.js | 화면 입력, 계산, 재생, 다운로드, 비교 |
| src/template.html, src/style.css | 독립 실행 UI |
| scripts/build.js | 단일 HTML 생성, 구문 검사, vendor 해시, 예제 생성 |
| scripts/browser-check.js | Edge 오프라인 UI 검증 |
| tests/core.test.js | 계산 및 계약 불변량 검증 |
| vendor | 기존 AGV/AMR 모듈과 같은 Three.js r128, OrbitControls, MIT 라이선스 |
| examples | 7개 재현 프로젝트 JSON |
| qa | 빌드 해시, 브라우저 결과, 스크린샷, 검증 산출물 |

계산 코드는 DOM·WebGL을 참조하지 않습니다. 3D는 계산된 기록을 소비하며 처리량을 계산하지 않습니다. 다른 기존 장비 프로그램의 원본·실행파일은 수정하지 않습니다.

이 프로젝트는 기존 로컬 설비 프로그램과 같은 단일 HTML 배포 방식입니다. 외부 호스팅, 외부 인증, 외부 데이터 저장은 사용하지 않습니다.


## 3D 화면 이동 · 2026-09-16

3D 화면 안에서 **마우스 휠 버튼(가운데 버튼)을 누른 채 드래그**하면 화면이 상하좌우로 이동합니다. 휠을 굴리면 확대·축소하고, 좌클릭 드래그는 회전, 우클릭 드래그는 이동입니다. 장비 선택은 좌클릭으로 합니다. 변경된 실행 HTML을 새로 열면 적용됩니다.

# STC EASY v1.0.0

초보자를 위한 별도 오프라인 스태커크레인 계산 프로그램입니다.

- 실행: 상위 폴더 `스태커크레인_간편실행.html`
- 안내: 상위 폴더 `스태커크레인_간편사용안내.md`
- 기존 실행 파일과 `01_stacker_crane` 소스는 수정하지 않습니다.
- `src/core/`는 기존 v0.3.4 계산·운동·보고서 모듈의 동일한 복사본입니다.
- `src/easy.js`: 표시 단위, 기본/상세 입력 정의, 파라미터 프리셋, 기존 프로젝트 호환 검증.
- `src/app.js`, `template.html`, `style.css`: 간편판 인터페이스.

Node.js 18 이상에서 `npm.cmd test`, `npm.cmd run build`, `npm.cmd run verify`를 실행합니다. `verify`는 기존 42개 파일의 SHA-256, 복사한 코어, 실행 HTML의 오프라인 구조와 내장 계산을 검증합니다. 원본이 후속 작업에서 개정되면 무결성 기록과 복사본을 명시적으로 갱신해야 합니다.

브라우저 점검은 `npm.cmd run browser-check`입니다. 연결된 Browser가 없는 환경에서 별도의 로컬 Playwright로 테스트합니다. `STC_PLAYWRIGHT_PATH`로 설치 경로를 지정할 수 있습니다. 결과와 화면은 `qa/`에 저장합니다.

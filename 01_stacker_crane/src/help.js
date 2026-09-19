(function () {
  'use strict';
  // Contextual help stays in the UI; calculation, saved projects and reports use their existing data.
  const entries = {
    name: ['프로젝트명', '현재 설비 검토의 이름입니다. 프로젝트 저장 파일과 계산서·PDF 보고서의 제목에 사용합니다.', '예: 자동차 차체 버퍼 STC 물동량 검토. 이름을 바꾼 뒤 계산 및 설정 적용을 누르세요.'],
    length: ['랙 길이', '랙의 왼쪽 끝부터 오른쪽 끝까지 주행 X 방향 길이를 m로 입력합니다. 번지 중심은 (번지 번호−0.5) × 랙 길이 ÷ Bay 수입니다.', '예: 길이 33.9 m, 6 Bay이면 번지 간격은 5.65 m, 1번 화물 중심 X는 2.825 m입니다. 외부 포트 위치는 IN/OUT X에 별도로 입력합니다.'],
    height: ['랙 높이', '랙의 높이 H를 m로 입력합니다. 최상단 이재 높이 = 1단 높이 + (단수−1) × 단간격이 H 이하여야 합니다.', '단간격이 비어 있으면 H ÷ Level 수를 사용합니다. FEM 이론 대표점은 H를 기준으로 산출합니다.'],
    bays: ['Bay 수 · 번지수', '한 보관면에서 주행 방향으로 나열된 번지 개수입니다. 1~200 범위의 정수를 입력합니다. 1부터 입력한 Bay 수까지 동일 간격의 셀을 생성합니다.', '전체 저장 셀 수 = Bay 수 × Level 수 × 보관면 수 × 깊이(싱글 1 / 더블 2) × STC 수. 3D와 셀 주소도 같은 개수를 사용합니다.'],
    levels: ['Level 수 · 단수', '높이 방향으로 쌓인 랙의 단수입니다. 단 번호는 아래부터 1, 2, 3…으로 표시합니다.', '각 단의 Y는 1단 랙 이재 높이와 단간격으로 정합니다. 모든 STC에 같은 단수와 높이를 적용합니다.'],
    rackDepth: ['화물 보관 깊이', '싱글딥은 한 위치에 1개, 더블딥은 앞열 D1과 뒷열 D2에 각각 1개를 보관합니다. 보관면 수 및 SC/DC 운전 모드와 별개입니다.', '더블딥을 선택한 뒤 주행·승강·포크에서 뒷열 스트로크를 확인하고 계산 및 설정 적용을 누르세요.'],
    rearStroke: ['뒷열 포크 편도 스트로크', '통로 중심부터 뒷열 화물 중심까지의 총 거리(m)입니다. 앞열보다 커야 하며, 빈칸은 앞열의 2배를 적용합니다.', '더블딥에서만 적용합니다. 추가 연장 거리 대신 총 도달 거리를 입력하세요. 예: 앞열 1.2 m, 뒷열 2.5 m.'],
    cellDepth: ['셀 깊이', 'D1은 앞열, D2는 뒷열입니다. 더블딥일 때 선택할 수 있습니다.', '셀 주소 끝의 D1/D2로 구별하며 셀 위치 확인을 누르면 해당 화물을 표시합니다.'],
    previewDepth: ['입고 깊이', '운동 그래프의 입고 셀 깊이를 선택합니다. FEM 대표 경로에서도 적용됩니다.', '물동량 분석은 앞열·뒷열 균등 평균이며 그래프는 선택한 깊이의 한 경로입니다.'],
    previewOutDepth: ['출고 깊이', '운동 그래프의 출고 셀 깊이를 선택합니다.', '같은 번지·단·면의 앞열·뒷열을 하나의 DC 입고·출고로 선택할 수 없습니다.'],
    sides: ['보관면 수', '통로 한쪽만 보관하면 1, 양쪽에 랙이 있으면 2를 입력합니다.', '1면은 A면(Z 음수), 2면은 A면과 B면(Z 양수)을 생성합니다. 포트 Z도 각 통로 중심을 기준으로 입력합니다.'],
    firstLevelHeight: ['1단 랙 이재 높이', '바닥 기준으로 1단에 화물이 놓인 중심 위치의 Y를 m로 입력합니다. 캐리지 상차 UP 110 mm는 이 높이에 별도로 반영합니다.', '빈칸은 단간격 ÷ 2입니다. 예: 1단 0.5 m, 단간격 2 m이면 각 단 높이는 0.5 / 2.5 / 4.5 m입니다.'],
    levelPitch: ['단간격', '인접한 두 단의 화물 이재 중심 사이 수직 거리입니다. 모든 단에 같은 간격을 m로 적용합니다.', '빈칸은 랙 높이 ÷ Level 수입니다. 최상단 높이가 랙 높이를 넘으면 설정 적용이 차단됩니다.'],
    ioX: ['IN · X 주행 좌표', '입고 포트의 X를 m로 입력합니다. 랙 왼쪽 끝은 0, 오른쪽 끝은 랙 길이입니다. 음수와 랙 길이보다 큰 값으로 외부 포트를 지정할 수 있습니다.', '예: 랙 길이 33.9 m에서 X=−3은 왼쪽 외부 3 m, X=38은 오른쪽 외부 4.1 m입니다. 기본값은 개별값이 없는 STC에 적용합니다.'],
    ioY: ['IN · Y 승강 좌표', '입고 포트에 놓인 화물 중심의 바닥 기준 Y를 m로 입력합니다. 상차 후 캐리지는 여기서 이재 승하강량만큼 올라갑니다.', '예: 입고 이재 높이 9.6 m이면 9.6을 입력합니다. 기준면 아래 음수와 랙 높이보다 높은 외부 포트도 허용합니다.'],
    ioZ: ['IN · Z 포크 좌표', '각 STC 통로 중심에서 입고 포트까지 포크 방향 거리를 m로 입력합니다. A면 방향은 음수, B면 방향은 양수입니다.', '빈칸은 −포크 스트로크입니다. 예: 스트로크 1.2 m에서 Z=−1이면 포크 편도 이동은 1 m입니다. |Z|는 선택한 보관 방식의 최대 스트로크 이하여야 합니다.'],
    outX: ['OUT · X 주행 좌표', '출고 포트의 X를 m로 입력합니다. 음수는 랙 왼쪽 외부, 랙 길이보다 큰 값은 오른쪽 외부입니다.', '기본 OUT X를 비우면 해당 STC의 IN X를 따릅니다. IN과 OUT이 다르면 DC 사이클에 OUT→IN 공차 복귀가 포함됩니다.'],
    outY: ['OUT · Y 승강 좌표', '출고 포트에 내려놓은 화물 중심의 바닥 기준 Y를 m로 입력합니다. 하차 시 캐리지는 이 높이까지 DOWN합니다.', '기본 OUT Y를 비우면 해당 STC의 IN Y를 따릅니다. 예: 출고 이재 높이 1.6 m이면 1.6을 입력합니다.'],
    outZ: ['OUT · Z 포크 좌표', '각 통로 중심에서 출고 포트까지의 포크 방향 거리입니다. A면은 음수, B면은 양수이며 단위는 m입니다.', '빈 기본 OUT Z는 −포크 스트로크입니다. 실제 하차 포크 이동거리는 |Z|이고 스트로크를 넘을 수 없습니다.'],
    method: ['처리량 계산 방법', '전체 셀 평균은 실제 랙 셀을 기준으로 평균 사이클을 계산합니다. 자유로운 포트 배치 검토에 사용할 수 있습니다.', 'FEM CASE 기준은 선택한 CASE의 대표 경로를 사용합니다. P1·P2 적용 위치에서 실제 화물 중심 또는 비교용 이론 좌표를 선택하세요. 운영 중 재고와 대기는 3D 시뮬레이션에서 확인합니다.'],
    femCase: ['FEM CASE 1~6', '참조 배치: CASE 1 공용 하단 모서리 / CASE 2 IN·OUT 하단 양 끝 / CASE 3 공용 포트 높이 이동 / CASE 4 공용 포트 X 이동 / CASE 5 IN 하단·OUT 상부 / CASE 6 IN 상부·OUT 하단.', 'CASE 선택만으로 입력 포트가 바뀌지는 않습니다. 참조 배치로 좌표를 바꾸려면 CASE 포트 배치 적용을 누릅니다. 실제 포트가 참조 조건과 다르면 실제 화물 중심 모드에서 설계 확장으로 계산합니다.'],
    pointMode: ['P1 · P2 적용 위치', '실제 화물 중심 모드는 CASE 참조점에서 가까운 랙 셀의 화물 중심을 선택합니다. 번지·단·면과 적용 XYZ가 결과 표에 표시됩니다.', 'FEM 이론 좌표 비교는 연속 좌표를 사용하고 CASE의 포트 조건을 검사합니다. 외부 포트와 실제 랙 셀을 검토할 때는 기본인 실제 화물 중심을 사용하세요.'],
    speedUnit: ['속도 입력·표시 단위', '주행·승강·포크 속도와 운동 그래프, 실시간 표시, 계산서의 속도 단위를 함께 바꿉니다. 기본은 m/min입니다.', '180 m/min = 3 m/s. 단위 변경 시 기존 숫자를 환산하므로 사양서 단위를 먼저 선택한 뒤 수치를 입력하세요. 가속도·감속도는 계속 m/s²이며 프로젝트 JSON 속도는 m/s입니다.'],
    stroke: ['포크 편도 스트로크', '포크가 통로 중심에서 랙 화물 중심까지 한쪽으로 나가는 거리입니다. 단위는 m이며 OUT과 IN 각각에 이 거리를 사용합니다.', '앞열 화물의 Z는 A면 −스트로크, B면 +스트로크입니다. 더블딥 뒷열은 뒷열 스트로크를 사용합니다. IN/OUT 포트는 개별 |Z|만큼 움직이며 최대 스트로크 이내여야 합니다.'],
    transferLift: ['캐리지 이재 승하강량', '상차: 포크 OUT → 캐리지 UP → 포크 IN. 하차: 포크 OUT → 캐리지 DOWN → 포크 IN. 기본값은 110 mm입니다.', '승하강 중 포크는 완전히 나온 상태로 멈춥니다. 이재 시간은 승강 Y 속도·가감속과 적재 비율로 계산하고, 적재 이동 높이는 놓인 화물 중심보다 이 값만큼 높습니다.'],
    forkDwell: ['이재 후 안착 대기', '캐리지 UP/DOWN 완료 후 포크 IN 시작 전의 추가 정지 시간입니다. 단위는 초/이재입니다.', '110 mm 승하강 시간은 별도로 계산합니다. 기존 총 이재 대기값에 승하강 시간이 포함되어 있다면 안착 대기만 남겨 입력하세요.'],
    position: ['정위치 시간', '주행·승강 이동이 실제로 발생한 구간의 끝에 정위치 확인 시간을 한 번 추가합니다. 단위는 초/이동입니다.', '주행과 승강은 동시에 출발하므로 이동 구간 시간은 두 축 중 긴 시간 + 정위치 시간입니다.'],
    control: ['제어 지연', '상위 제어 명령·통신 등 사이클당 추가 지연을 초로 입력합니다.', 'SC 또는 DC 한 사이클에 한 번 적용합니다. 이동별 정위치 시간과 이재별 안착 대기는 해당 입력에서 따로 계산합니다.'],
    loadedFactor: ['적재 속도·가감속 비율', '화물이 있을 때 주행·승강 최대속도, 가속도, 감속도에 함께 곱하는 비율입니다. 1은 공차와 동일, 0.8은 각각 80%입니다.', '캐리지 이재 승하강에도 적용합니다. 포크 속도는 포크 입력값을 사용합니다. 설비의 적재 시 사양을 기준으로 정하세요.'],
    inbound: ['평균 입고 요구량', '전체 STC가 합쳐서 처리해야 할 평균 입고 화물 수를 시간당 수량으로 입력합니다.', '입고 35, 피크 계수 1.2, STC 2대이면 시뮬레이션의 통로당 입고 수요는 35 × 1.2 ÷ 2 = 21개/h입니다.'],
    outbound: ['평균 출고 요구량', '전체 STC의 평균 출고 요구량을 시간당 수량으로 입력합니다. 총 취급 요구량은 입고 + 출고입니다.', 'DC 한 사이클은 입고 1건과 출고 1건을 처리합니다. 입출고 수요가 다르면 페어링되지 않는 나머지 작업은 SC로 처리합니다.'],
    peak: ['피크 계수', '평균 입고·출고 요구량 각각에 곱하는 수요 배수입니다. 설계 피크와 시뮬레이션 도착 수요에 사용합니다.', '예: 입고 35 + 출고 35, 피크 1.2이면 총 피크 요구량은 84개/h입니다. 평균 기준만 검토하려면 1을 입력합니다.'],
    cranes: ['독립 통로 / 크레인 수', '통로당 STC 1대인 독립 통로 수입니다. 입력한 대수만큼 같은 랙 구조와 개별 시뮬레이션을 생성하고 전체 수요를 균등 배분합니다.', '포트는 아래 STC별 표에서 다르게 지정할 수 있습니다. 각 통로의 결과를 합산하며 공유 레일에서 여러 STC가 충돌·대기하는 설비는 모델 범위에 포함되지 않습니다.'],
    operatingEfficiency: ['운전효율 (%)', '시간당 보정 처리량에 적용할 효율을 1~100%로 입력합니다. 85%는 85로 입력합니다. 보정 처리량 = 이론 처리량 × 효율 ÷ 100입니다.', '직접 입력하면 A·Ft·Ew 대신 사용하며 근거 선택은 필수가 아닙니다. 빈칸이면 기존 세부 계수와 근거를 사용합니다. 사이클 시간과 DES 결과는 바뀌지 않습니다.'],
    targetUtil: ['목표 설계 부하율', '필요 대수와 부하 판정에 사용할 처리 여유를 정합니다. 표시 처리량에 곱하는 운전효율과 별도입니다. 0.8이면 보정 처리능력의 80% 이내로 피크 요구량을 배분합니다.', '필요 대수 = 올림(총 피크 요구량 ÷ 1대 보정 능력 ÷ 목표 부하율). 포트 조건이 다르면 현재 STC 중 가장 낮은 능력을 기준으로 산정합니다.'],
    unit: ['화물 단위', '요구량과 처리량에 표시할 PLT, BOX, TOTE를 선택합니다. PLT는 팔레트, BOX는 박스, TOTE는 토트입니다.', '화물 1개를 취급 1건으로 집계합니다. 단위를 바꾸어도 포크 사양이나 한 번에 드는 수량이 자동으로 달라지지는 않습니다.'],
    mode: ['운전 모드', 'DC는 입고·출고 작업을 페어링합니다. SC 복귀는 작업 후 I/O로 돌아오며 SC 위치 대기는 작업 완료 위치에서 다음 작업을 기다립니다.', '시뮬레이션에서 DC는 양쪽 작업과 사용 가능한 셀이 있을 때 실행하며 그 외에는 SC 위치 대기로 처리합니다. 분석 카드의 SC 위치 대기 값은 SC 복귀 참고값이고 실제 운영 차이는 시뮬레이션에서 계산합니다.'],
    A: ['가용도 A', '계획 시간 중 설비를 사용할 수 있는 비율을 분석 처리능력에 반영합니다. 예: 0.95는 95%입니다.', '벤더 사양·실측·설계 가정에 따라 근거를 기록하세요. A × Fₜ × E𝑤를 이론 처리량에 한 번 곱하며 시뮬레이션 결과에 추가로 곱하지 않습니다.'],
    Ft: ['교통계수 Fₜ', '이론 처리량에서 운영 흐름의 손실을 반영하기 위한 분석 보정 비율입니다. 적용 근거가 있는 값을 입력하세요.', '세 계수는 곱으로 적용됩니다. 같은 손실을 다른 계수에 중복 반영하지 않도록 근거 메모에 범위를 적으세요. 미입력 시 보정 능력·필요 대수는 미산정입니다.'],
    Ew: ['작업효율 E𝑤', '운영 작업효율을 반영하는 분석 보정 비율입니다. 예: 0.9는 이론 능력에 작업효율 90%를 적용합니다.', '설비 조건에 맞는 근거를 선택하세요. 예시 계수는 설계 가정이며 고정된 FEM 규정값을 뜻하지 않습니다.'],
    basis: ['계수 근거', 'A, Fₜ, E𝑤를 정한 근거를 설계 가정, 벤더 사양, 실측, 이상 조건 중 선택합니다.', '보정 능력과 필요 대수를 판정하려면 세 계수와 근거를 지정하세요. 근거 종류와 메모가 계산서·보고서에 함께 기록됩니다.'],
    basisNote: ['근거 메모', '보정계수의 출처와 적용 조건을 적습니다. 예: 사양서 번호·개정일, 측정일·측정 조건, 설계 가정의 이유.', '최대 300자입니다. 프로젝트 JSON과 계산서·PDF에 저장됩니다.'],
    hours: ['측정 시간', '준비운전 이후 통계를 집계할 시간을 h로 입력합니다. 2는 2시간, 0.5는 30분입니다.', '전체 실행 길이는 준비운전 시간 + 측정 시간입니다. 진행 중 결과는 현재까지의 부분 측정 결과로 표시합니다.'],
    warmup: ['준비운전 제외 시간', '초기 재고·대기 상태가 운영 흐름에 적응하도록 먼저 실행할 시간을 분으로 입력합니다. 이 시간은 통계 측정에서 제외합니다.', '준비운전 중 재고와 진행 작업은 측정 구간으로 이어집니다. 준비운전에서 시작해 측정 중 완료된 작업도 측정 완료량에 포함됩니다.'],
    seed: ['난수 시드', '작업 도착 변동, 초기 재고와 무작위 셀 선택을 재현하는 정수입니다. 같은 조건과 시드이면 같은 실행 결과를 얻습니다.', '여러 STC에는 서로 다른 시드를 배분합니다. 반복 실험에서는 반복마다 기본 시드를 1씩 증가시킵니다.'],
    initialFill: ['초기 랙 충전률', '시작 시 랙에 채워 둘 화물 비율입니다. 0은 빈 랙, 0.5는 50%, 1은 가득 찬 랙입니다.', '각 STC의 셀 수 × 충전률을 내림한 개수만큼 재고를 배치합니다. 빈 랙은 초기 출고 대기, 가득 찬 랙은 초기 입고 대기에 영향을 줍니다.'],
    inBuffer: ['입고 버퍼 용량', '각 STC가 입고 대기 화물을 받아 두는 버퍼의 수용 개수입니다.', '용량을 넘는 입고 작업은 외부에서 기다립니다. 입고 버퍼 초과 상태와 대기 작업을 시뮬레이션 통계에서 확인할 수 있습니다.'],
    outBuffer: ['출고 버퍼 용량', '각 STC가 출고 화물을 내려놓을 수 있는 버퍼의 개수입니다.', '출고 버퍼가 가득 차면 크레인이 하차 전 기다립니다. 출고 반출 간격과 함께 설정해 하류 반출이 처리량에 미치는 영향을 확인하세요.'],
    takeaway: ['출고 반출 간격', '출고 버퍼에서 외부로 화물을 하나씩 반출하는 간격입니다. 단위는 초/개, 0은 즉시 반출입니다.', '예: 60초/개이면 버퍼에 화물이 있는 동안 분당 1개씩 반출합니다. 출고 취급은 STC 하차 완료, 출하량은 외부 반출 완료로 구분합니다.'],
    jitter: ['일정간격 변동폭', '작업 도착이 일정 간격 + 변동일 때 기본 도착 간격에 적용할 균등 변동 비율입니다.', '예: 기본 60초, 변동폭 0.1이면 54~66초 사이에서 간격을 정합니다. 0이면 일정 간격이며 Poisson 도착에는 이 값을 사용하지 않습니다.'],
    arrival: ['작업 도착 방식', '일정 간격 + 변동은 평균 간격 주변에서 설정한 변동폭을 적용합니다. Poisson 도착은 무작위 도착 간격을 사용합니다.', '평균 수요는 입고·출고 요구량 × 피크 계수 ÷ STC 수입니다. 같은 시드로 재실행하면 같은 도착 조건을 비교할 수 있습니다.'],
    storage: ['입고 셀 선택', '빈 셀 무작위는 사용 가능한 빈 셀 중 하나를 선택합니다. 가까운 셀은 IN 포트에서 이동시간이 짧은 셀을 우선합니다.', '번지·단·면의 실제 좌표와 주행·승강 동시 운동을 기준으로 셀을 선택합니다. 입고 예약 셀은 다른 입고에 중복 배정하지 않습니다.'],
    retrieval: ['출고 셀 선택', 'FIFO는 오래 보관된 화물을 먼저 출고합니다. 무작위는 보관 셀 중 하나, 가까운 셀은 이동시간 기준으로 재고 셀을 선택합니다.', '여기서는 출고할 재고 셀을 정합니다. 대기 작업 자체는 선착순으로 배차합니다.'],
    loadProject: ['프로젝트 불러오기', '저장한 프로젝트 JSON을 선택해 설비와 운영 조건을 불러오고 계산합니다. 이전 버전의 지원 설정도 변환해 읽습니다.', '현재 설정과 시뮬레이션 상태가 갱신됩니다. 현재 입력을 보관하려면 먼저 프로젝트 저장을 사용하세요.'],
    saveProject: ['프로젝트 저장', '현재 입력값을 검사한 뒤 설비·운영 조건을 JSON 파일로 저장합니다. STC별 포트와 선택한 속도 표시 단위도 포함합니다.', '시뮬레이션 진행 상태와 PDF의 문서번호·작성자 정보는 프로젝트 설정에 포함되지 않습니다.'],
    report: ['계산서 Markdown 저장', '적용된 입력과 계산 결과를 .md 문서로 내려받습니다. 텍스트 편집기나 Markdown 뷰어로 확인할 수 있습니다.', '입력이 변경되었다면 계산 및 설정 적용을 먼저 누르세요. 제출용 A4 문서는 PDF 보고서를 사용합니다.'],
    pdfReport: ['PDF 보고서', '적용된 계산 결과를 제출용 A4 보고서로 만듭니다. 문서번호·제출처·작성자·검토자를 선택 입력하고 그래프와 시뮬레이션 포함 여부를 정합니다.', '보고서 미리보기 → PDF 저장 / 인쇄 → 대상을 PDF로 저장, 용지를 A4로 선택하세요. 버튼을 누르면 재생을 멈추고 현재 시점 결과를 사용합니다.'],
    editPorts: ['STC별 포트 표 갱신', '현재 STC 수에 맞추어 개별 포트 입력 행을 다시 만듭니다. 남아 있는 행의 입력은 유지합니다.', '각 행은 해당 STC 한 대입니다. 바꾸고 싶은 좌표만 입력하고 나머지는 비우면 기본 좌표를 따릅니다. 오른쪽으로 가로 스크롤하면 OUT 열이 나옵니다.'],
    clearPorts: ['개별값 지우기', 'STC별 표에 입력한 좌표를 모두 비워 기본 IN/OUT 좌표를 사용하게 합니다.', '기본 포트 입력은 그대로이며 계산 및 설정 적용을 눌러 반영합니다.'],
    applyCase: ['CASE 포트 배치 적용', '선택한 CASE의 참조 배치로 모든 STC의 IN/OUT X·Y를 바꿉니다. 높이 이동은 입력된 포트 높이, X 이동은 기본 IN X를 참고하고 없으면 H/2 또는 L/2를 사용합니다.', '외부 포트를 유지하려면 CASE만 선택하고 직접 계산을 적용하세요. 이 버튼은 실제 입력 좌표를 변경합니다.'],
    assumedFactors: ['가정 예시 적용', '분석 보정계수에 프로그램의 설계 가정 예시와 근거를 채웁니다. 적용 후 각 값을 수정할 수 있습니다.', '프로젝트의 확정 사양으로 사용하려면 벤더 자료나 실측값과 대조하고 근거 메모를 갱신하세요.'],
    idealFactors: ['이상 조건 1.0', 'A, Fₜ, E𝑤를 모두 1로 하고 근거를 이상 조건으로 설정합니다. 세 계수에 따른 능력 감소가 없는 비교 조건입니다.', '계산 및 설정 적용을 누르면 보정 능력과 이론 능력이 같아집니다. 목표 설계 부하율은 별도로 적용합니다.'],
    calculate: ['계산 및 설정 적용', '현재 입력을 검사하고 물동량 계산, 실제 랙 셀, 전체 STC와 운동 경로를 갱신합니다.', '시뮬레이션과 반복 실험 결과는 초기화합니다. 오류가 있으면 해당 항목을 수정한 뒤 다시 적용하세요.'],
    resetDefaults: ['예시 설비로 초기화', '모든 설비·운영 입력을 프로그램의 기본 예시로 되돌리고 다시 계산합니다.', '기존 시뮬레이션과 실험 결과도 초기화합니다. 현재 사양을 보관하려면 먼저 프로젝트 JSON을 저장하세요.'],
    simPlay: ['시뮬레이션 재생 / 일시정지', '입력한 모든 STC의 입출고 작업과 포크·캐리지 동작을 동시에 재생합니다. 다시 누르면 현재 시각에서 일시정지합니다.', '각 통로의 실제 계산 결과를 합산합니다. 재생 속도는 배속에서 조절하며 계산용 설비 속도는 바뀌지 않습니다.'],
    simStep: ['다음 이벤트', '작업 도착, 진행 작업 완료 등 다음 시뮬레이션 이벤트 시점으로 이동합니다.', '이벤트 사이의 포크 OUT·승하강·IN 연속 동작은 재생이나 시간 슬라이더로 확인하세요.'],
    simFinish: ['종료까지 계산', '현재 설정의 준비운전과 측정 구간 끝까지 시뮬레이션을 계산합니다. 결과를 빠르게 확인할 때 사용합니다.', '애니메이션 배속과 무관하게 같은 이벤트 모델을 계산합니다. 완료 후 처리량·대기·재고와 작업 CSV를 확인할 수 있습니다.'],
    simReset: ['시뮬레이션 리셋', '현재 적용 설정과 난수 시드를 유지하고 시뮬레이션을 시작 시각으로 되돌립니다.', '실행 중인 작업과 통계는 초기화하고 초기 랙 충전률에 맞는 재고부터 다시 시작합니다.'],
    simSpeed: ['시뮬레이션 배속', '화면에서 흐르는 시뮬레이션 시간의 배율입니다. 50×이면 실제 1초 동안 시뮬레이션 약 50초가 진행합니다.', '설비 속도와 계산 결과를 바꾸지 않습니다. 고배속에서 동작이 빠르면 1×나 10×로 낮춰 포크와 캐리지를 확인하세요.'],
    simAisle: ['선택 STC', '셀 주소 확인과 실시간 축 정보를 볼 STC를 선택합니다.', '다른 STC도 동시에 계속 계산·재생합니다. 선택 STC 확대를 누르면 해당 통로를 중심으로 화면을 맞춥니다.'],
    cellSide: ['찾을 보관면', '확인할 셀의 A면 또는 B면을 선택합니다. A면은 Z 음수, B면은 Z 양수 방향입니다.', '보관면 수가 1이면 A면을 사용합니다. 번지와 단도 선택하고 셀 위치 확인을 누르세요.'],
    cellBay: ['찾을 번지 · Bay', '선택한 STC와 보관면에서 찾을 번지 번호를 입력합니다. 범위는 1~입력한 Bay 수입니다.', '셀 위치 확인을 누르면 주소와 화물 중심 XYZ, 현재 셀 상태를 표시합니다.'],
    cellLevel: ['찾을 단 · Level', '아래부터 센 단 번호를 입력합니다. 범위는 1~입력한 Level 수입니다.', '1단 높이와 단간격이 반영된 실제 셀 중심을 조회합니다. 셀 위치 확인을 눌러 선택을 반영하세요.'],
    findCell: ['셀 위치 확인', '선택 STC·보관면·번지·단에 해당하는 셀을 장면에서 표시합니다.', '셀 주소, 중심 XYZ, 빈 셀/보관 중/입고 예약/출고 예약 상태가 표시됩니다. 3D 셀을 직접 클릭해도 확인할 수 있습니다.'],
    viewSelected: ['선택 STC 확대', '선택한 STC 통로에 맞추어 카메라를 이동·확대합니다.', '확대 후에도 모든 STC는 계산됩니다. 전체 장면은 정면 또는 입체 버튼으로 다시 볼 수 있습니다.'],
    viewFront: ['정면 보기', '전체 랙과 STC를 정면 방향으로 보도록 카메라를 맞춥니다.', '번지와 단 위치를 확인할 때 사용합니다. 휠로 확대하고 휠 버튼 또는 우클릭 드래그로 이동할 수 있습니다.'],
    viewIso: ['입체 보기', '전체 STC와 양쪽 랙이 보이는 입체 시점으로 카메라를 맞춥니다.', '드래그로 회전, 휠로 확대, 휠 버튼 또는 우클릭 드래그로 이동할 수 있습니다.'],
    exportSim: ['완료 작업 CSV', '현재 시각까지 완료된 작업의 기록을 CSV로 내려받습니다. STC, 셀 주소와 처리 시간을 확인할 수 있습니다.', 'Excel에서 열 수 있도록 UTF-8 BOM을 포함합니다. 진행 중 또는 미배차 작업은 화면의 대기 현황에서 확인하세요.'],
    simSeek: ['시뮬레이션 시각 탐색', '전체 실행 구간에서 확인할 시각을 선택합니다. 준비운전과 측정 시간을 모두 포함합니다.', '이전 시각으로 돌아가면 동일 설정·시드로 해당 시점의 상태를 재현합니다. 랙 재고·진행 작업·통계도 함께 갱신합니다.'],
    motionAisle: ['운동 그래프 STC', '운동 경로에 사용할 STC를 선택합니다. 해당 STC의 개별 IN/OUT 포트 좌표를 사용합니다.', '경로와 셀 주소를 정한 뒤 지점 적용으로 그래프를 갱신하세요.'],
    motionSource: ['운동 그래프 경로', '실제 셀 선택은 입고·출고 주소를 직접 지정합니다. CASE 적용점은 현재 계산의 P1·P2를 사용합니다.', 'CASE 경로는 FEM 계산을 적용한 후 사용합니다. 이 그래프는 선택한 한 사이클의 동작을 확인하는 미리보기입니다.'],
    previewKind: ['미리보기 사이클', 'DC는 입고와 출고가 결합된 경로, SC 입고는 입고 후 복귀, SC 출고는 랙에서 포트까지의 출고 경로입니다.', '선택한 사이클의 이동·이재·지연을 시간 순서대로 재생합니다. 실제 수요와 재고에 따른 배차는 3D 시뮬레이션에서 확인하세요.'],
    femRoute: ['CASE 2 경로', 'CASE 2의 DC 대표 경로 중 기본 P1→P2 또는 대칭 P1′→P2′를 골라 운동 선도를 확인합니다.', '분석의 CASE 2 DC 시간은 두 경로의 평균입니다. 이 선택은 미리보기에서 확인할 한 경로를 정합니다.'],
    refreshMotion: ['지점 적용', '선택한 STC, 경로, 사이클과 입출고 셀 주소로 운동 미리보기를 다시 만듭니다.', '주행·승강·포크 그래프와 구간별 시간이 갱신됩니다. PDF 그래프에도 이 적용 경로가 사용됩니다.'],
    graphMode: ['그래프 표시', '속도 + 가속도는 가감속과 정속 구간, 위치 + 속도는 실제 이동 위치와 방향을 함께 보여줍니다.', '위치는 m, 속도는 선택 단위(m/min 또는 m/s), 가속도는 m/s²입니다. 음수는 해당 축의 반대 방향 운동을 나타냅니다.'],
    motionPlay: ['동작 재생 / 일시정지', '선택한 한 사이클의 시간 커서를 움직여 세 축의 운동과 이재 순서를 확인합니다. 다시 누르면 멈춥니다.', '주행·승강은 동시에 시작합니다. 포크 OUT 후 캐리지 UP/DOWN, 포크 IN 순서는 승강과 포크 그래프에서 확인하세요.'],
    motionReset: ['동작 처음으로', '운동 미리보기를 멈추고 시간 커서를 0초로 되돌립니다.', '현재 적용된 경로와 사이클은 유지합니다.'],
    motionSeek: ['운동 그래프 시각', '선택한 사이클 내 시각을 조절합니다. 세 축의 위치·속도·가속도와 현재 동작 구간을 같은 시각으로 표시합니다.', '그래프 위에 포인터를 올려서도 해당 시점을 확인할 수 있습니다.'],
    motionSpeed: ['동작 배속', '운동 미리보기의 재생 시간을 1×, 2×, 5×, 10×로 조절합니다.', '입력한 설비 속도와 사이클 시간은 그대로입니다. 캐리지 110 mm 이재를 자세히 보려면 1×를 사용하세요.'],
    repCount: ['모드별 반복 수', '각 운전 모드에 대해 5, 10, 20, 30회 중 반복 횟수를 정합니다. 10회이면 세 모드 합계 30번 실행합니다.', '반복마다 시드를 바꾸고 세 모드는 같은 수요 시드로 비교합니다. 반복 수가 늘면 계산 시간이 길어집니다.'],
    runExperiments: ['반복 실험 시작', 'SC 복귀, SC 위치 대기, DC 페어링을 동일한 설비·수요 조건으로 반복 실행합니다.', '처리량·P95 대기·종료 대기 작업의 평균과 95% 신뢰구간을 비교합니다. 현재 설정을 먼저 적용하세요.'],
    cancelExperiments: ['반복 실험 취소', '진행 중인 반복 실험을 중단합니다. 완료된 반복의 결과는 남습니다.', '표와 내보내기 결과를 볼 때 각 모드의 완료 반복 수를 함께 확인하세요.'],
    exportExperiments: ['실험 결과 JSON', '완료된 반복 실험의 모드별 결과를 JSON 파일로 내려받습니다.', '평균 결과와 반복 표본을 보관하거나 추가 분석할 때 사용합니다.'],
    pdfDocumentNo: ['보고서 문서번호', '제출처의 문서 관리 번호를 입력합니다. 예: STC-2026-001. 선택 입력이며 최대 80자입니다.', '보고서 표지에 표시합니다. 현재 앱 창에서는 유지되며 프로젝트 JSON에는 저장되지 않습니다.'],
    pdfRecipient: ['보고서 제출처', '보고서를 제출할 회사·부서·검토 조직을 입력합니다. 선택 입력이며 최대 80자입니다.', '설비 계산값에는 영향을 주지 않고 보고서의 문서 정보에 표시합니다.'],
    pdfAuthor: ['보고서 작성자', '작성자 이름이나 담당 부서를 입력합니다. 선택 입력이며 최대 60자입니다.', '보고서 문서 정보에 표시하며 현재 앱 창에서 유지됩니다.'],
    pdfReviewer: ['보고서 검토자', '검토자 이름이나 검토 부서를 입력합니다. 선택 입력이며 최대 60자입니다.', '입력한 검토자명을 보고서에 표시합니다.'],
    pdfIncludeGraphs: ['배치도·가감속 그래프 포함', '운동 그래프 탭에 적용된 STC와 경로의 배치도 및 주행·승강·포크 그래프를 보고서에 넣습니다.', '다른 경로를 제출하려면 이 창을 닫고 운동 그래프에서 지점 적용 후 PDF 보고서를 다시 여세요.'],
    pdfIncludeSim: ['시뮬레이션 결과 포함', 'PDF 보고서를 여는 시점의 전체 및 STC별 시뮬레이션 결과를 넣습니다. 준비운전·부분 결과·완료 상태를 구분해 표시합니다.', '아직 실행하지 않았으면 선택할 수 없습니다. 측정 완료 결과가 필요하면 먼저 종료까지 계산을 실행하세요.'],
    pdfCancel: ['보고서 설정 닫기', '보고서를 생성하지 않고 설정 창을 닫습니다.', '입력한 문서 정보는 현재 앱 창에 남아 다음 PDF 보고서 작성에 사용할 수 있습니다.'],
    createPdfReport: ['보고서 미리보기', '선택한 문서 정보와 포함 항목으로 별도 창에 A4 보고서를 엽니다.', '미리보기에서 PDF 저장 / 인쇄를 누른 뒤 PDF로 저장, A4를 선택하세요. 브라우저 기본 머리글·바닥글은 끄면 보고서 자체 번호만 표시됩니다.'],
    rackSection: ['랙 & 스테이션', '랙 치수와 번지·단·보관면, 기본 포트와 STC별 포트 좌표를 설정합니다. X=주행, Y=승강, Z=포크 방향입니다.', '화물과 P1·P2는 실제 셀 중심에 배치합니다. 외부 포트는 음수 또는 랙 길이·높이를 넘는 좌표로 입력할 수 있습니다.'],
    femSection: ['대표점 계산 기준', '전체 셀 평균 또는 FEM CASE 대표점 계산을 선택합니다. 실제 화물 중심과 이론 좌표 비교 모드를 구분합니다.', 'CASE를 선택하고 입력 포트 및 P1·P2 적용 좌표를 결과 표에서 확인하세요. 상세 계산 모델은 계산 근거 탭에 있습니다.'],
    driveSection: ['주행 · 승강 · 포크', '세 축의 최대속도·가속도·감속도와 포크 스트로크, 110 mm 캐리지 이재, 각 지연 시간을 입력합니다.', '기본 속도는 m/min, 가감속은 m/s²입니다. 상차 UP·하차 DOWN과 안착 대기를 분리해 계산합니다.'],
    flowSection: ['요구 물동량 & 운전', '전체 입고·출고 수요, 피크, 독립 STC 수와 SC/DC 운전 방식을 정합니다.', '총 취급량은 입고 + 출고입니다. 전체 수요를 통로별로 나누어 시뮬레이션하고 목표 부하율로 필요 대수를 산정합니다.'],
    factorSection: ['운전효율 및 보정', '운전효율에 85를 입력하면 이론 처리량의 85%를 보정 처리량으로 계산합니다. 빈칸이면 기존 A × Fₜ × E𝑤와 근거를 사용합니다. 두 방식은 중복 적용하지 않습니다.', '설비 사양·실측·설계 가정을 기록하세요. 시뮬레이션 결과에는 이 계수를 추가 적용하지 않습니다.'],
    simSection: ['시뮬레이션 조건', '측정·준비운전 시간, 초기 재고, 입출고 버퍼, 도착 변동과 셀 선택 규칙을 설정합니다.', '난수 시드로 실행을 재현할 수 있습니다. 입력 변경 후 계산 및 설정 적용을 누르면 현재 실행 결과가 초기화됩니다.'],
    overviewTab: ['물동량 계산', 'SC/DC 사이클 시간, 이론·보정 처리량, 필요 대수와 랙·포트·FEM 적용점을 확인합니다.', '먼저 왼쪽 설비·운영 조건을 입력하고 계산 및 설정 적용을 누르세요. 운전효율과 세부 계수가 모두 미입력일 때 이론값만 표시합니다.'],
    simulationTab: ['3D 시뮬레이션', '실제 셀 재고와 작업 도착에 따라 모든 STC의 입출고 동작을 재생합니다. 번지·단·면으로 셀을 조회할 수 있습니다.', '처리량뿐 아니라 대기, 버퍼 차단, 재고 부족도 확인하세요. 재생·다음 이벤트·종료까지 계산·시각 탐색을 지원합니다.'],
    motionTab: ['운동 그래프', '한 사이클에서 주행·승강·포크의 위치, 속도, 가속도를 같은 시간축으로 확인합니다.', '실제 셀 또는 FEM 적용 경로를 고르고 지점 적용을 누르세요. OUT→UP/DOWN 110 mm→IN 순서도 그래프에 표시합니다.'],
    experimentsTab: ['반복 실험', '동일 조건에서 SC 복귀, SC 위치 대기, DC를 여러 난수 시드로 비교합니다.', '모드별 평균·95% 신뢰구간과 종료 대기 작업을 함께 검토하고 결과를 JSON으로 저장할 수 있습니다.'],
    guideTab: ['계산 근거', '운동 시간 식, 이재 순서, SC/DC 처리량, 시뮬레이션 집계 범위와 FEM CASE 적용 방식의 설명입니다.', '결과를 해석할 때 지원 범위와 가정을 함께 확인하세요. 이 탭을 여는 동작은 입력이나 실행 결과를 바꾸지 않습니다.'],
    rackResult: ['랙과 기준 동작 경로', 'STC 1의 랙, IN/OUT 포트와 입출고 동선을 보여줍니다. P1·P2는 선택한 적용점입니다.', '실제 화물 중심 모드는 셀 중심, 이론 비교 모드는 연속 좌표를 표시합니다. 다른 STC의 포트와 시간은 STC별 계산 표에서 확인하세요.'],
    cycleResult: ['사이클 시간', '1대 기준 SC 입고·출고와 DC 시간, 이동·포크·캐리지 이재·대기 등의 구성을 표시합니다.', 'SC는 취급 1건, DC는 입고 1건 + 출고 1건입니다. 총 취급 처리량을 출고만의 수량과 혼동하지 않도록 요구량과 함께 확인하세요.'],
    heightsResult: ['단별 랙 이재 높이', '각 단의 Y = 1단 높이 + (단 번호−1) × 단간격입니다. 모든 STC에 같은 높이를 적용합니다.', '실제 랙 셀과 화물 중심, 운동 그래프, 시뮬레이션이 이 표의 높이를 공유합니다.'],
    femResult: ['CASE 적용 및 STC별 계산', '입력 포트, CASE 참조 포트, 적용 P1·P2 좌표와 셀 주소, STC별 SC/DC 시간을 확인합니다.', '외부 포트의 설계 확장은 CASE 참조 셀과 실제 입력 포트 간 이동을 계산합니다. 이론 좌표 비교와 구분하여 보고서에 적용 조건을 기록합니다.'],
    capacityResult: ['요구량과 처리능력', '전체 피크 입출고 수요와 STC 처리능력을 비교합니다. 운전효율 또는 세부 계수·근거를 입력하면 목표 부하율에 따른 필요 대수도 표시합니다.', '포트가 다르면 통로별 능력이 다를 수 있습니다. 필요 대수 산정에는 현재 STC 중 가장 낮은 보정 능력을 사용합니다.'],
    sensitivityResult: ['보정계수 민감도', '운전효율 또는 세부 보정계수를 상대적으로 ±5%, ±10% 바꾸었을 때 처리능력과 필요 대수가 얼마나 달라지는지 비교합니다.', '예: 0.8의 +10%는 0.88입니다. 계수의 불확실성이 설계 판단에 주는 영향을 검토하세요.'],
    liveResult: ['전체 STC 합계', '모든 통로의 실제 완료량, 측정 처리량과 재고를 합산합니다. 준비운전 이후의 통계를 사용합니다.', '초기 재고 + 입고 완료 − 출고 완료 = 랙 재고 + 크레인 위 출고 화물로 재고를 확인합니다. 외부 반출은 출하량으로 따로 표시합니다.'],
    fleetResult: ['STC별 실시간 작업', '각 STC의 현재 위치·동작·처리량과 작업 상태를 확인합니다.', '통로별 재고와 도착 시드가 달라 순간 처리량이 다를 수 있습니다. 전체 STC 합계는 이 실제 실행 결과를 합산합니다.'],
    queueResult: ['대기 작업 · 랙 재고', '실행 시간에 따른 전체 대기 작업 수와 랙 재고 변화를 보여줍니다.', '대기가 지속적으로 쌓이면 요구량, 입출고 비중, 버퍼·반출 간격과 초기 재고를 함께 확인하세요.'],
    stateResult: ['전체 크레인 상태 시간', '측정 구간에서 모든 STC가 이동·이재·대기·차단 등에 사용한 시간을 비교합니다.', '분모는 STC 대수 × 측정시간입니다. 차단도 크레인을 점유하므로 높은 가동률과 높은 처리량이 항상 같은 뜻은 아닙니다.'],
    waitResult: ['대기와 처리 현황', '평균·P95 대기는 측정 중 배차된 작업의 도착→배차 시간입니다. P95는 이 대기 표본의 95%가 그 값 이하라는 뜻입니다.', '아직 배차되지 않은 작업은 대기 건수와 최장 경과시간에 따로 표시합니다. 미완료 대기가 큰 경우 완료·배차된 표본의 평균만으로 판단하지 마세요.'],
    phasesResult: ['축별 가속 · 정속 · 감속 시간', '각 축이 가속, 정속, 감속에 사용한 시간과 도달 속도를 표시합니다. 짧은 거리는 최대속도에 도달하지 않는 삼각형 선도입니다.', '정지 출발·정지 도착 모델이며 주행·승강 중 먼저 도착한 축은 멈춥니다. 포크가 나온 상태의 캐리지 이재도 승강 축으로 계산합니다.'],
    comparisonResult: ['반복 비교 결과', '각 운전 모드에서 완료된 반복의 평균과 Student t 기반 95% 신뢰구간을 표시합니다.', '취소했다면 완료 반복 수가 모드별로 다를 수 있습니다. 처리량과 함께 P95 대기, 종료 대기 작업 수를 비교하세요.'],
    portsTable: ['STC별 개별 포트 표', '한 행이 STC 한 대이며 IN X·Y·Z와 OUT X·Y·Z를 m로 입력합니다. 오른쪽으로 가로 스크롤하면 OUT 열이 보입니다.', '개별 빈칸은 기본 입력을 따릅니다. 기본 OUT X·Y도 비어 있으면 해당 STC의 IN X·Y, 빈 기본 Z는 −스트로크를 사용합니다. 0은 자동값이 아닌 실제 좌표 0입니다.']
  };
  for (const [axis, name, speed, accel, decel, example] of [
    ['X', '주행', 'vx', 'ax', 'dx', '180 m/min = 3 m/s'],
    ['Y', '승강', 'vy', 'ay', 'dy', '60 m/min = 1 m/s'],
    ['Z', '포크', 'vf', 'af', 'df', '36 m/min = 0.6 m/s']
  ]) {
    entries[speed] = [name + ' 최대속도', axis + '축의 최대속도를 선택한 속도 단위로 입력합니다. 기본은 m/min이며 예: ' + example + '입니다.', '짧은 이동은 가속·감속만으로 끝나 최대속도에 도달하지 않을 수 있습니다. 실제 도달 속도와 시간은 운동 그래프에서 확인하세요.'];
    entries[accel] = [name + ' 가속도', axis + '축이 속도를 높이는 가속도의 크기입니다. 속도 표시 단위와 관계없이 m/s²로 입력합니다.', '예: 0.5 m/s²이면 1초마다 속도가 0.5 m/s 증가합니다. 감속도와 독립적으로 지정하며 순간 가속도 전환 모델을 사용합니다.'];
    entries[decel] = [name + ' 감속도', axis + '축이 멈추기 위해 속도를 줄이는 감속도의 크기를 양수로 입력합니다. 단위는 m/s²입니다.', '그래프의 가속도 부호는 실제 이동 방향과 가감속 구간에 따라 정해집니다. 입력값이 작으면 감속에 필요한 시간과 거리가 늘어납니다.'];
    entries['axis' + axis] = [name + ' ' + axis + '축', '최대속도, 가속도, 감속도로 ' + name + ' 운동 시간을 계산합니다. 속도 기본 단위는 m/min, 가감속은 m/s²입니다.', axis === 'Z' ? '이재는 포크 OUT → 캐리지 UP/DOWN → 포크 IN 순서입니다. 포트의 포크 이동거리는 |Z|, 랙은 스트로크를 사용합니다.' : '주행과 승강은 동시에 출발하고 더 오래 걸리는 축의 시간이 이동 구간을 결정합니다. 적재 시에는 설정한 적재 비율을 적용합니다.'];
  }
  for (const [prefix, name] of [['preview', '입고'], ['previewOut', '출고']]) {
    for (const [part, label, detail] of [['Bay', '번지', '1~설정한 Bay 수'], ['Level', '단', '1~설정한 Level 수'], ['Side', '면', 'A면은 Z 음수, B면은 Z 양수']]) {
      entries[prefix + part] = ['미리보기 ' + name + ' ' + label, '운동 그래프에서 사용할 ' + name + ' 셀의 ' + label + '을 지정합니다. ' + detail + '입니다.', '실제 셀 선택 경로에서 사용합니다. 지점 적용을 누르면 해당 화물 중심으로 이동·이재 시간을 다시 계산합니다.'];
    }
  }

  const panel = document.createElement('div');
  panel.id = 'contextHelp'; panel.className = 'help-popover'; panel.setAttribute('popover', 'manual');
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'false'); panel.setAttribute('aria-labelledby', 'contextHelpTitle');
  panel.hidden = true;
  panel.innerHTML = '<div class="help-popover-heading"><strong id="contextHelpTitle"></strong><button type="button" class="help-close" aria-label="도움말 닫기">×</button></div><div id="contextHelpBody"></div><p class="help-popover-hint">? 클릭으로 고정 · 바깥 클릭 또는 Esc로 닫기</p>';
  document.body.append(panel);
  const title = panel.querySelector('strong'), body = panel.querySelector('#contextHelpBody'), closeButton = panel.querySelector('button');
  let active = null, pinned = false, closeTimer, suppressFocus = false, positionFrame;
  const keep = () => clearTimeout(closeTimer);
  function close(restoreFocus = false) {
    keep(); const previous = active;
    if (previous) { previous.setAttribute('aria-expanded', 'false'); previous.removeAttribute('aria-describedby'); }
    if (panel.matches(':popover-open')) panel.hidePopover();
    panel.hidden = true; active = null; pinned = false;
    if (restoreFocus && previous?.isConnected) { suppressFocus = true; previous.focus({ preventScroll: true }); suppressFocus = false; }
  }
  function place() {
    if (!active) return;
    if (!active.isConnected || !active.getClientRects().length) { close(); return; }
    const viewport = window.visualViewport, left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
    const width = viewport?.width || innerWidth, height = viewport?.height || innerHeight, margin = 10;
    const anchor = active.getBoundingClientRect();
    if (anchor.bottom < top || anchor.top > top + height || anchor.right < left || anchor.left > left + width) { close(); return; }
    panel.style.maxWidth = Math.max(1, width - margin * 2) + 'px';
    panel.style.maxHeight = Math.max(1, height - margin * 2) + 'px';
    const box = panel.getBoundingClientRect();
    const x = Math.max(left + margin, Math.min(anchor.left, left + width - box.width - margin));
    let y = anchor.bottom + 8;
    if (y + box.height > top + height - margin) y = anchor.top - box.height - 8;
    y = Math.max(top + margin, Math.min(y, top + height - box.height - margin));
    panel.style.left = x + 'px'; panel.style.top = y + 'px';
  }
  function queuePlace(event) {
    if (!active || (event?.target instanceof Node && panel.contains(event.target))) return;
    cancelAnimationFrame(positionFrame); positionFrame = requestAnimationFrame(place);
  }
  function show(button, pin = false, focus = false) {
    keep();
    if (pinned && !pin) return;
    if (active !== button) {
      close(); active = button;
      const item = entries[button.dataset.help];
      title.textContent = item[0]; body.replaceChildren();
      for (const text of item.slice(1)) { const paragraph = document.createElement('p'); paragraph.textContent = text; body.append(paragraph); }
      // Keeping a modal's help inside that dialog preserves interactivity in the top layer.
      (button.closest('dialog') || document.body).append(panel);
      panel.hidden = false; if (panel.showPopover) panel.showPopover();
      button.setAttribute('aria-expanded', 'true'); button.setAttribute('aria-describedby', 'contextHelpBody');
    }
    pinned = pin;
    panel.dataset.pinned = String(pinned);
    panel.querySelector('.help-popover-hint').textContent = pinned ? '고정된 도움말 · 바깥 클릭 또는 Esc로 닫기' : '? 클릭으로 고정 · 바깥 클릭 또는 Esc로 닫기';
    place(); if (focus) closeButton.focus({ preventScroll: true });
  }
  function leave() {
    keep(); if (!pinned) closeTimer = setTimeout(() => {
      if (!panel.matches(':hover') && !panel.contains(document.activeElement) && document.activeElement !== active) close();
    }, 220);
  }
  function makeButton(key) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'help-button'; button.textContent = '?'; button.dataset.help = key;
    button.setAttribute('aria-label', entries[key][0] + ' 도움말'); button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-controls', panel.id); button.setAttribute('aria-expanded', 'false');
    button.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') show(button); });
    button.addEventListener('pointerleave', leave);
    button.addEventListener('focus', () => { if (!suppressFocus) show(button); });
    button.addEventListener('blur', leave);
    button.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      if (active === button && pinned) close(); else show(button, true, event.detail === 0);
    });
    return button;
  }
  function wrap(target, key, className) {
    if (target.parentElement.classList.contains(className)) return;
    const wrapper = document.createElement('span'); wrapper.className = className;
    target.before(wrapper); wrapper.append(target, makeButton(key));
  }
  function inline(target, key) {
    if (target && !target.querySelector('[data-help="' + key + '"]')) target.append(makeButton(key));
  }
  Object.assign(entries, {
    scRatio: ['싱글 작업 비율', '지정 비율 모드에서 SC 비율(%)을 입력합니다. DC는 100−SC로 자동 조정됩니다.', '사이클 기준 SC 1회는 화물 1개, DC 1회는 입고·출고 2개입니다.'],
    dcRatio: ['듀얼 작업 비율', '지정 비율 모드에서 DC 비율(%)을 입력합니다. SC는 100−DC입니다.', '수요 불균형과 셀 수에 따른 분석 상한을 적용합니다. 재고·도착·버퍼 때문에 실제 비율은 달라질 수 있습니다.'],
    ratioBasis: ['비율 기준', '운전 사이클 횟수 또는 처리 화물 개수를 선택합니다.', '화물 기준 DC 50%는 사이클 기준 DC 33.3%입니다. 분석과 실제 달성 표시는 사이클 기준입니다.'],
    editRoutes: ['복합 포트 구성', '한 STC에 CASE 1~6 포트 조합을 최대 6개 등록합니다. 조합별 STC 번호, ID, 배분율, CASE, 실제 XYZ를 입력합니다.', 'STC별 배분율 합계는 100%이며 입고·출고 수요에 동일하게 적용합니다. 등록된 STC는 조합 표의 포트만 사용합니다.'],
    motionRoute: ['운동 그래프 포트 조합', '선택 STC의 포트 조합을 고릅니다. 해당 CASE와 실제 포트로 SC/DC 경로를 계산합니다.', '서로 다른 조합의 입고·출고를 한 DC로 묶지 않습니다.'],
    mode: ['운전 모드', 'SC 복귀, SC 위치 대기, DC 최대 페어링, SC/DC 지정 비율을 선택합니다.', '지정 비율은 누적 배차 횟수로 조절하며 SC는 포트 복귀입니다. 같은 조합의 양쪽 작업과 셀이 없으면 가능한 SC를 처리합니다. 최대 페어링 모드의 잔여 SC는 위치 대기입니다.']
  });
  for (const key of Object.keys(entries)) {
    const target = document.getElementById(key); if (!target) continue;
    const label = target.labels?.[0];
    if (label) wrap(label, key, label.contains(target) ? 'help-check' : 'help-label');
    else if (target.matches('button')) wrap(target, key, 'help-action');
    else if (target.matches('input[type=range]')) target.after(makeButton(key));
    else if (target.matches('select')) wrap(target, key, 'help-select');
  }
  for (const [id, key] of Object.entries({ rackFields: 'rackSection', method: 'femSection', speedUnit: 'driveSection', flowFields: 'flowSection', factorFields: 'factorSection', simFields: 'simSection' })) {
    const summary = document.getElementById(id).closest('details').querySelector('summary');
    summary.querySelector('.chevron').before(makeButton(key));
  }
  document.querySelectorAll('[data-tab]').forEach(button => wrap(button, button.dataset.tab + 'Tab', 'help-action'));
  for (const axis of ['x', 'y', 'fork']) inline(document.getElementById(axis + 'Fields').previousElementSibling, 'axis' + ({ x: 'X', y: 'Y', fork: 'Z' })[axis]);
  for (const [id, key] of Object.entries({ rackDiagram: 'rackResult', cycleSummary: 'cycleResult', levelHeights: 'heightsResult', femSummary: 'femResult', capacityBars: 'capacityResult', sensitivityTable: 'sensitivityResult', liveKpis: 'liveResult', fleetTable: 'fleetResult', queueChart: 'queueResult', stateBars: 'stateResult', simDetails: 'waitResult', phaseTable: 'phasesResult', experimentResults: 'comparisonResult', experimentProgress: 'experimentsTab', previewDescription: 'motionTab' })) {
    inline(document.getElementById(id).closest('article').querySelector('h2'), key);
  }
  inline(document.getElementById('pdfOptionsTitle'), 'pdfReport');
  entries.individualCase = ['STC별 CASE', '기본을 선택하면 상단의 기본 CASE와 포트 좌표를 사용합니다. CASE 1~6을 선택하면 이 STC에 해당 참조 포트를 배치합니다.', '개별 XYZ를 입력하면 CASE 참조 좌표보다 우선합니다. 복합 포트 조합을 등록한 STC는 조합 표의 CASE와 좌표를 사용합니다.'];
  function mountPorts() {
    if (active && !active.isConnected) close();
    const headers = document.querySelectorAll('#portTable thead th');
    headers.forEach((header, index) => {
      if (index === 1) { inline(header, 'individualCase'); return; }
      const key = index ? 'individual-' + STCModel.portKeys[index - 2] : 'portsTable';
      if (index) {
        const source = entries[STCModel.portKeys[index - 2]];
        entries[key] = ['STC별 ' + source[0], '해당 STC에만 적용할 좌표를 m로 입력합니다. 개별 빈칸은 기본 입력을 따르며 0은 실제 좌표 0입니다.', ...source.slice(1)];
      }
      inline(header, key);
    });
  }
  window.STCHelp = { mountPorts };
  mountPorts();
  panel.addEventListener('pointerenter', keep); panel.addEventListener('pointerleave', leave);
  panel.addEventListener('focusin', keep); panel.addEventListener('focusout', leave);
  closeButton.addEventListener('click', () => close(true));
  document.addEventListener('click', event => {
    if (active && !panel.contains(event.target) && !event.target.closest('.help-button')) close();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && active) { event.preventDefault(); event.stopPropagation(); close(true); }
  }, true);
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('close', () => { if (dialog.contains(panel)) close(); }));
  document.querySelectorAll('details').forEach(details => details.addEventListener('toggle', () => { if (!details.open && active && details.contains(active) && !details.querySelector('summary').contains(active)) close(); }));
  window.addEventListener('scroll', queuePlace, true); window.addEventListener('resize', queuePlace);
  window.visualViewport?.addEventListener('resize', queuePlace); window.visualViewport?.addEventListener('scroll', queuePlace);
})();

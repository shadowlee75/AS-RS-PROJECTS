# AGV·AMR 물동량 검토 보고서

팔레트 이송 · 2개 공급 / 2개 공정

- 프로젝트: AGV-AMR-DEMO / 시나리오: standard
- 검토 수준: 가정 기반
- 엔진: 0.3.0 / 스키마: agv-amr/project@1
- 설정 해시: fnv1a-f16254fa / 시드: 20260914
- 입력 근거: 개발계획서 PLAN-AGV-AMR-001 · 설명용 가정값. 현장 실측으로 교체 필요.

## 물동량 및 대수

| 항목 | 결과 |
|---|---:|
| 요구 수량 | 60.00 PLT/Hr |
| 작업 발생률 | 60.00 작업/Hr |
| 해석 미정수 대수 | 5.380204257 |
| 해석 초기 대수 | 6대 |
| 운영 대수 | 4대 |
| 평균 해석 작업시간 | 234.60 s/작업 |

초기 대수 = ceil((적재·이재 부하 + 선택 공차 부하 + 해석 교통 추가) / (3600 × 기술 가용도 × 조건부 충전 가용도 × 목표 점유율)).

| 시간부하 | s/h |
|---|---:|
| 적재 주행 | 5845.74 |
| 이재·제어 | 2040.00 |
| 공차 | 5096.29 |
| 해석 교통 추가 | 1094.20 |

## 운전 모델

- 단일 층 경로망, AMR, lift 모듈, 제자리 회전.
- 동적 우회 허용, 배차 fifo, 작업 종료 후 전용 주차 베이 복귀.
- 차량·적재 외곽을 감싸는 원을 이용한 전 경로 배타 예약. 링크 내 연속 추종, 조향·견인 궤적, 센서/SLAM은 미지원.
- 폐쇄는 신규 경로 진입 제한. 이미 진입한 예약 차량은 통과를 마칩니다. 계획 정지는 현재 동작과 주차 복귀 후 적용합니다.
- 스테이션/충전기 노드당 차량 1대. 후공정은 화물별 서비스시간과 병렬 슬롯을 사용합니다.
- 배터리 상태 전력·80% 이후 2단 순충전곡선 사용. 해석 손실계수와 DES 사건 손실을 중복 적용하지 않습니다.
- 경로 탐색 비용은 구간 정지·회전시간 기준이며, 선택 경로의 실제 주행은 연속 경계속도 프로파일로 계산합니다.

## 시뮬레이션

- 실행 ID: standard-20260914-f16254fa
- 측정창: [0, 3600) s, 완료 시각 기준 처리량.
- 리드타임/납기: 측정창 발생 요청 코호트. P95는 종료 시 완료 요청만 사용; 미완료·기한초과 동시 제시.
- 판정: 조건 미충족 / 보류 — 처리량 미달, P95 목표 미달, 납기 목표 미달/표본 부족, 미완료/증가 백로그, 충전 반복·SOC 지속성 미확인
- 보존·예약 검사: 통과

| KPI | 결과 |
|---|---:|
| 완료 처리량 | 23.00 PLT/Hr |
| 측정창 완료 수량 | 23 PLT |
| 측정창 완료 작업 | 23건 |
| 요청 수량 충족률 | 38.33% |
| 완료 코호트 P95 | 2006.63 s |
| 완료 코호트 평균 리드타임 | 1224.26 s |
| 종료 백로그 | 37건 |
| 기한 초과 미완료 | 27건 |
| 최장 미완료 경과 | 2650.00 s |
| 납기 준수율(기한 도래 요청) | 10.00% |
| 최저 SOC | 68.50% |
| 총 소비/순충전 | 772.07 / 0.00 Wh |
| 시작/종료 총 에너지 | 5100.00 / 4327.93 Wh |
| 충전 방문 | 0회 |
| 모델 실패 | 0건 |

| 차량 상태 | 측정 차량시간 비율 |
|---|---:|
| 유휴 | 3.47% |
| 공차주행 | 7.41% |
| 픽업 | 2.40% |
| 제어 | 0.64% |
| 교통대기 | 57.36% |
| 적재주행 | 15.48% |
| 하역 | 2.40% |
| 주차복귀 | 10.86% |

| 자원 | 차량 서비스 점유율 | 후공정 점유율 | 차량 대기 s |
|---|---:|---:|---:|
| P1 | 5.42% | 0.00% | 727.09 |
| P2 | 4.17% | 0.00% | 516.80 |
| D1 | 5.42% | 0.00% | 508.44 |
| D2 | 4.17% | 0.00% | 654.57 |
| C1 | 0.00% | 0.00% | 0.00 |

## 대안 비교

| 대안 | 평균 PLT/Hr | 반복 간 평균 95% CI | 최대 백로그 | 판정 |
|---|---:|---|---:|---|
| 2대 / 충전 1 / 동적 | 20.00 | 반복 부족 | 40 | 처리량 미달, P95 목표 미달, 납기 목표 미달/표본 부족, 미완료/증가 백로그, 충전 반복·SOC 지속성 미확인, 반복 표본 부족, 처리량 신뢰하한 미달/미확정 |
| 3대 / 충전 1 / 동적 | 22.00 | 반복 부족 | 38 | 처리량 미달, P95 목표 미달, 납기 목표 미달/표본 부족, 미완료/증가 백로그, 충전 반복·SOC 지속성 미확인, 반복 표본 부족, 처리량 신뢰하한 미달/미확정 |

## 적용 조건 및 미확인 항목

- 가정 기반 모델 · 실측 보정 전 결과입니다.
- 교통: 전 구간 배타 예약 + 회전 외곽 원 검사. 링크 내 추종·추월은 지원하지 않습니다.
- 주차: 매 작업 후 전용 시작 베이로 복귀. 해석 공차 기준선과 DES 실주행은 다를 수 있습니다.
- DES는 명시한 교통·충전을 계산하며 해석용 가용도·교통계수를 다시 적용하지 않습니다.
- 유한 교대 시험: 시작 손실과 종료 시 미완료 요청을 포함합니다.
- 입력 수요의 완료량은 포화 처리능력과 다릅니다. 충분한 부하·장기 충전 반복·백로그 및 독립 검증 시드 재시험 전에는 지속능력으로 확정하지 않습니다.
- 이 버전은 v0.3 운영 검토판입니다. 계획서 F01~F13 / V01~V12 전체 정식 검수 및 현장 검증을 완료한 버전은 아닙니다.

## 재현 입력 (SI 단위)

```json
{
  "schemaVersion": "agv-amr/project@1",
  "equipmentType": "agv_amr",
  "engineVersion": "0.3.0",
  "savedAt": "2026-09-14T09:52:32.184Z",
  "configHash": "fnv1a-f16254fa",
  "config": {
    "schemaVersion": "agv-amr/project@1",
    "projectId": "AGV-AMR-DEMO",
    "scenarioId": "standard",
    "parentScenarioId": "",
    "name": "팔레트 이송 · 2개 공급 / 2개 공정",
    "dataStatus": "가정 기반",
    "sources": "개발계획서 PLAN-AGV-AMR-001 · 설명용 가정값. 현장 실측으로 교체 필요.",
    "fleet": 4,
    "horizon": 3600,
    "warmup": 0,
    "seed": 20260914,
    "arrival": "periodic",
    "demandMode": "od",
    "demandFactor": 1,
    "dispatch": "fifo",
    "routing": "dynamic",
    "parking": "home",
    "emptyModel": "eg",
    "trafficFactor": 1.1,
    "availability": 0.95,
    "chargeAvailability": 0.9,
    "targetUtil": 0.85,
    "goals": {
      "throughputRatio": 0.95,
      "p95": 600,
      "onTime": 0.95,
      "maxBacklog": 8
    },
    "vehicle": {
      "kind": "AMR",
      "module": "lift",
      "length": 1.2,
      "width": 0.9,
      "payload": 1000,
      "cargoLength": 1.2,
      "cargoWidth": 1,
      "cargoHeight": 1.1,
      "emptyV": 1.5,
      "loadedV": 1.2,
      "emptyA": 0.5,
      "loadedA": 0.3,
      "emptyB": 0.7,
      "loadedB": 0.5,
      "turning": true,
      "omega": 0.8,
      "alpha": 1,
      "clearance": 0.15,
      "control": 4
    },
    "battery": {
      "enabled": true,
      "capacity": 1500,
      "initial": 0.85,
      "trigger": 0.25,
      "target": 0.9,
      "reserve": 0.08,
      "emptyPower": 350,
      "loadedPower": 500,
      "handlingPower": 280,
      "idlePower": 60,
      "chargePower": 1200,
      "taper": 0.55,
      "dock": 8,
      "undock": 5,
      "opportunity": false
    },
    "nodes": [
      {
        "id": "H0",
        "x": 0,
        "y": 0,
        "type": "junction",
        "stop": false,
        "pickup": 15,
        "dropoff": 15,
        "buffer": 4,
        "process": 0,
        "processSlots": 1,
        "enabled": true
      },
      {
        "id": "K1",
        "x": 0,
        "y": -8,
        "type": "parking",
        "stop": false,
        "pickup": 15,
        "dropoff": 15,
        "buffer": 4,
        "process": 0,
        "processSlots": 1,
        "enabled": true
      },
      {
        "id": "H1",
        "x": 4,
        "y": 0,
        "type": "junction",
        "stop": false,
        "pickup": 15,
        "dropoff": 15,
        "buffer": 4,
        "process": 0,
        "processSlots": 1,
        "enabled": true
      },
      {
        "id": "K2",
        "x": 4,
        "y": -8,
        "type": "parking",
        "stop": false,
        "pickup": 15,
        "dropoff": 15,
        "buffer": 4,
        "process": 0,
        "processSlots": 1,
        "enabled": true
      },
      {
        "id": "H2",
        "x": 8,
        "y": 0,
        "type": "junction",
        "stop": false,
        "pickup": 15,
        "dropoff": 15,
        "buffer": 4,
        "process": 0,
        "processSlots": 1,
        "enabled": true
      },
      {
        "id": "K3",
        "x": 8,
        "y": -8,
        "type": "parking",
        "stop": false,
        "pickup": 15,
        "dropoff": 15,
        "buffer": 4,
        "process": 0,
        "processSlots": 1,
        "enabled": true
      },
      {
        "id": "H3",
        "x": 12,
        "y": 0,
        "type": "junction",
        "stop": false,
        "pickup": 15,
        "dropoff": 15,
        "buffer": 4,
        "process": 0,
        "processSlots": 1,
        "enabled": true
      },
      {
        "id": "K4",
        "x": 12,
        "y": -8,
        "type": "parking",
        "stop": false,
        "pickup": 15,
        "dropoff": 15,
        "buffer": 4,
        "process": 0,
        "processSlots": 1,
        "enabled": true
      },
      {
        "id": "H4",
        "x": 16,
        "y": 0,
        "type": "junction",
        "stop": false,
        "pickup": 15,
        "dropoff": 15,
        "buffer": 4,
        "process": 0,
        "processSlots": 1,
        "enabled": true
      },
      {
        "id": "K5",
        "x": 16,
        "y": -8,
        "type": "parking",
        "stop": false,
        "pickup": 15,
        "dropoff": 15,
        "buffer": 4,
        "process": 0,
        "processSlots": 1,
        "enabled": true
      },
      {
        "id": "H5",
        "x": 20,
        "y": 0,
        "type": "junction",
        "stop": false,
        "pickup": 15,
        "dropoff": 15,
        "buffer": 4,
        "process": 0,
        "processSlots": 1,
        "enabled": true
      },
      {
        "id": "K6",
        "x": 20,
        "y": -8,
        "type": "parking",
        "stop": false,
        "pickup": 15,
        "dropoff": 15,
        "buffer": 4,
        "process": 0,
        "processSlots": 1,
        "enabled": true
      },
      {
        "id": "H6",
        "x": 24,
        "y": 0,
        "type": "junction",
        "stop": false,
        "pickup": 15,
        "dropoff": 15,
        "buffer": 4,
        "process": 0,
        "processSlots": 1,
        "enabled": true
      },
      {
        "id": "K7",
        "x": 24,
        "y": -8,
        "type": "parking",
        "stop": false,
        "pickup": 15,
        "dropoff": 15,
        "buffer": 4,
        "process": 0,
        "processSlots": 1,
        "enabled": true
      },
      {
        "id": "H7",
        "x": 28,
        "y": 0,
        "type": "junction",
        "stop": false,
        "pickup": 15,
        "dropoff": 15,
        "buffer": 4,
        "process": 0,
        "processSlots": 1,
        "enabled": true
      },
      {
        "id": "K8",
        "x": 28,
        "y": -8,
        "type": "parking",
        "stop": false,
        "pickup": 15,
        "dropoff": 15,
        "buffer": 4,
        "process": 0,
        "processSlots": 1,
        "enabled": true
      },
      {
        "id": "H8",
        "x": 32,
        "y": 0,
        "type": "junction",
        "stop": false,
        "pickup": 15,
        "dropoff": 15,
        "buffer": 4,
        "process": 0,
        "processSlots": 1,
        "enabled": true
      },
      {
        "id": "K9",
        "x": 32,
        "y": -8,
        "type": "parking",
        "stop": false,
        "pickup": 15,
        "dropoff": 15,
        "buffer": 4,
        "process": 0,
        "processSlots": 1,
        "enabled": true
      },
      {
        "id": "H9",
        "x": 36,
        "y": 0,
        "type": "junction",
        "stop": false,
        "pickup": 15,
        "dropoff": 15,
        "buffer": 4,
        "process": 0,
        "processSlots": 1,
        "enabled": true
      },
      {
        "id": "K10",
        "x": 36,
        "y": -8,
        "type": "parking",
        "stop": false,
        "pickup": 15,
        "dropoff": 15,
        "buffer": 4,
        "process": 0,
        "processSlots": 1,
        "enabled": true
      },
      {
        "id": "H10",
        "x": 40,
        "y": 0,
        "type": "junction",
        "stop": false,
        "pickup": 15,
        "dropoff": 15,
        "buffer": 4,
        "process": 0,
        "processSlots": 1,
        "enabled": true
      },
      {
        "id": "K11",
        "x": 40,
        "y": -8,
        "type": "parking",
        "stop": false,
        "pickup": 15,
        "dropoff": 15,
        "buffer": 4,
        "process": 0,
        "processSlots": 1,
        "enabled": true
      },
      {
        "id": "H11",
        "x": 44,
        "y": 0,
        "type": "junction",
        "stop": false,
        "pickup": 15,
        "dropoff": 15,
        "buffer": 4,
        "process": 0,
        "processSlots": 1,
        "enabled": true
      },
      {
        "id": "K12",
        "x": 44,
        "y": -8,
        "type": "parking",
        "stop": false,
        "pickup": 15,
        "dropoff": 15,
        "buffer": 4,
        "process": 0,
        "processSlots": 1,
        "enabled": true
      },
      {
        "id": "L1",
        "x": 0,
        "y": 8,
        "type": "junction",
        "stop": false,
        "pickup": 15,
        "dropoff": 15,
        "buffer": 4,
        "process": 0,
        "processSlots": 1,
        "enabled": true
      },
      {
        "id": "L2",
        "x": 0,
        "y": 16,
        "type": "junction",
        "stop": false,
        "pickup": 15,
        "dropoff": 15,
        "buffer": 4,
        "process": 0,
        "processSlots": 1,
        "enabled": true
      },
      {
        "id": "T0",
        "x": 0,
        "y": 24,
        "type": "junction",
        "stop": false,
        "pickup": 15,
        "dropoff": 15,
        "buffer": 4,
        "process": 0,
        "processSlots": 1,
        "enabled": true
      },
      {
        "id": "T1",
        "x": 12,
        "y": 24,
        "type": "junction",
        "stop": false,
        "pickup": 15,
        "dropoff": 15,
        "buffer": 4,
        "process": 0,
        "processSlots": 1,
        "enabled": true
      },
      {
        "id": "T2",
        "x": 24,
        "y": 24,
        "type": "junction",
        "stop": false,
        "pickup": 15,
        "dropoff": 15,
        "buffer": 4,
        "process": 0,
        "processSlots": 1,
        "enabled": true
      },
      {
        "id": "T3",
        "x": 36,
        "y": 24,
        "type": "junction",
        "stop": false,
        "pickup": 15,
        "dropoff": 15,
        "buffer": 4,
        "process": 0,
        "processSlots": 1,
        "enabled": true
      },
      {
        "id": "T4",
        "x": 44,
        "y": 24,
        "type": "junction",
        "stop": false,
        "pickup": 15,
        "dropoff": 15,
        "buffer": 4,
        "process": 0,
        "processSlots": 1,
        "enabled": true
      },
      {
        "id": "R1",
        "x": 44,
        "y": 8,
        "type": "junction",
        "stop": false,
        "pickup": 15,
        "dropoff": 15,
        "buffer": 4,
        "process": 0,
        "processSlots": 1,
        "enabled": true
      },
      {
        "id": "R2",
        "x": 44,
        "y": 16,
        "type": "junction",
        "stop": false,
        "pickup": 15,
        "dropoff": 15,
        "buffer": 4,
        "process": 0,
        "processSlots": 1,
        "enabled": true
      },
      {
        "id": "P1",
        "x": -10.75,
        "y": 8,
        "type": "station",
        "stop": false,
        "pickup": 15,
        "dropoff": 15,
        "buffer": 4,
        "process": 0,
        "processSlots": 1,
        "enabled": true
      },
      {
        "id": "P2",
        "x": -6,
        "y": 16,
        "type": "station",
        "stop": false,
        "pickup": 15,
        "dropoff": 15,
        "buffer": 4,
        "process": 0,
        "processSlots": 1,
        "enabled": true
      },
      {
        "id": "D1",
        "x": 50,
        "y": 8,
        "type": "station",
        "stop": false,
        "pickup": 15,
        "dropoff": 15,
        "buffer": 4,
        "process": 0,
        "processSlots": 1,
        "enabled": true
      },
      {
        "id": "D2",
        "x": 50,
        "y": 16,
        "type": "station",
        "stop": false,
        "pickup": 15,
        "dropoff": 15,
        "buffer": 4,
        "process": 0,
        "processSlots": 1,
        "enabled": true
      },
      {
        "id": "C1",
        "x": 12,
        "y": 32,
        "type": "charger",
        "stop": false,
        "pickup": 15,
        "dropoff": 15,
        "buffer": 4,
        "process": 0,
        "processSlots": 1,
        "enabled": true
      },
      {
        "id": "C2",
        "x": 24,
        "y": 32,
        "type": "charger",
        "stop": false,
        "pickup": 15,
        "dropoff": 15,
        "buffer": 4,
        "process": 0,
        "processSlots": 1,
        "enabled": false
      },
      {
        "id": "C3",
        "x": 36,
        "y": 32,
        "type": "charger",
        "stop": false,
        "pickup": 15,
        "dropoff": 15,
        "buffer": 4,
        "process": 0,
        "processSlots": 1,
        "enabled": false
      }
    ],
    "paths": [
      {
        "id": "E1",
        "from": "K1",
        "to": "H0",
        "width": 3,
        "speed": 1.8,
        "direction": "both",
        "door": 0,
        "enabled": true
      },
      {
        "id": "E2",
        "from": "K2",
        "to": "H1",
        "width": 3,
        "speed": 1.8,
        "direction": "both",
        "door": 0,
        "enabled": true
      },
      {
        "id": "E3",
        "from": "H0",
        "to": "H1",
        "width": 3,
        "speed": 1.8,
        "direction": "both",
        "door": 0,
        "enabled": true
      },
      {
        "id": "E4",
        "from": "K3",
        "to": "H2",
        "width": 3,
        "speed": 1.8,
        "direction": "both",
        "door": 0,
        "enabled": true
      },
      {
        "id": "E5",
        "from": "H1",
        "to": "H2",
        "width": 3,
        "speed": 1.8,
        "direction": "both",
        "door": 0,
        "enabled": true
      },
      {
        "id": "E6",
        "from": "K4",
        "to": "H3",
        "width": 3,
        "speed": 1.8,
        "direction": "both",
        "door": 0,
        "enabled": true
      },
      {
        "id": "E7",
        "from": "H2",
        "to": "H3",
        "width": 3,
        "speed": 1.8,
        "direction": "both",
        "door": 0,
        "enabled": true
      },
      {
        "id": "E8",
        "from": "K5",
        "to": "H4",
        "width": 3,
        "speed": 1.8,
        "direction": "both",
        "door": 0,
        "enabled": true
      },
      {
        "id": "E9",
        "from": "H3",
        "to": "H4",
        "width": 3,
        "speed": 1.8,
        "direction": "both",
        "door": 0,
        "enabled": true
      },
      {
        "id": "E10",
        "from": "K6",
        "to": "H5",
        "width": 3,
        "speed": 1.8,
        "direction": "both",
        "door": 0,
        "enabled": true
      },
      {
        "id": "E11",
        "from": "H4",
        "to": "H5",
        "width": 3,
        "speed": 1.8,
        "direction": "both",
        "door": 0,
        "enabled": true
      },
      {
        "id": "E12",
        "from": "K7",
        "to": "H6",
        "width": 3,
        "speed": 1.8,
        "direction": "both",
        "door": 0,
        "enabled": true
      },
      {
        "id": "E13",
        "from": "H5",
        "to": "H6",
        "width": 3,
        "speed": 1.8,
        "direction": "both",
        "door": 0,
        "enabled": true
      },
      {
        "id": "E14",
        "from": "K8",
        "to": "H7",
        "width": 3,
        "speed": 1.8,
        "direction": "both",
        "door": 0,
        "enabled": true
      },
      {
        "id": "E15",
        "from": "H6",
        "to": "H7",
        "width": 3,
        "speed": 1.8,
        "direction": "both",
        "door": 0,
        "enabled": true
      },
      {
        "id": "E16",
        "from": "K9",
        "to": "H8",
        "width": 3,
        "speed": 1.8,
        "direction": "both",
        "door": 0,
        "enabled": true
      },
      {
        "id": "E17",
        "from": "H7",
        "to": "H8",
        "width": 3,
        "speed": 1.8,
        "direction": "both",
        "door": 0,
        "enabled": true
      },
      {
        "id": "E18",
        "from": "K10",
        "to": "H9",
        "width": 3,
        "speed": 1.8,
        "direction": "both",
        "door": 0,
        "enabled": true
      },
      {
        "id": "E19",
        "from": "H8",
        "to": "H9",
        "width": 3,
        "speed": 1.8,
        "direction": "both",
        "door": 0,
        "enabled": true
      },
      {
        "id": "E20",
        "from": "K11",
        "to": "H10",
        "width": 3,
        "speed": 1.8,
        "direction": "both",
        "door": 0,
        "enabled": true
      },
      {
        "id": "E21",
        "from": "H9",
        "to": "H10",
        "width": 3,
        "speed": 1.8,
        "direction": "both",
        "door": 0,
        "enabled": true
      },
      {
        "id": "E22",
        "from": "K12",
        "to": "H11",
        "width": 3,
        "speed": 1.8,
        "direction": "both",
        "door": 0,
        "enabled": true
      },
      {
        "id": "E23",
        "from": "H10",
        "to": "H11",
        "width": 3,
        "speed": 1.8,
        "direction": "both",
        "door": 0,
        "enabled": true
      },
      {
        "id": "E24",
        "from": "H0",
        "to": "L1",
        "width": 3,
        "speed": 1.8,
        "direction": "both",
        "door": 0,
        "enabled": true
      },
      {
        "id": "E25",
        "from": "L1",
        "to": "L2",
        "width": 3,
        "speed": 1.8,
        "direction": "both",
        "door": 0,
        "enabled": true
      },
      {
        "id": "E26",
        "from": "L2",
        "to": "T0",
        "width": 3,
        "speed": 1.8,
        "direction": "both",
        "door": 0,
        "enabled": true
      },
      {
        "id": "E27",
        "from": "T0",
        "to": "T1",
        "width": 3,
        "speed": 1.8,
        "direction": "both",
        "door": 0,
        "enabled": true
      },
      {
        "id": "E28",
        "from": "T1",
        "to": "T2",
        "width": 3,
        "speed": 1.8,
        "direction": "both",
        "door": 0,
        "enabled": true
      },
      {
        "id": "E29",
        "from": "T2",
        "to": "T3",
        "width": 3,
        "speed": 1.8,
        "direction": "both",
        "door": 0,
        "enabled": true
      },
      {
        "id": "E30",
        "from": "T3",
        "to": "T4",
        "width": 3,
        "speed": 1.8,
        "direction": "both",
        "door": 0,
        "enabled": true
      },
      {
        "id": "E31",
        "from": "T4",
        "to": "R2",
        "width": 3,
        "speed": 1.8,
        "direction": "both",
        "door": 0,
        "enabled": true
      },
      {
        "id": "E32",
        "from": "R2",
        "to": "R1",
        "width": 3,
        "speed": 1.8,
        "direction": "both",
        "door": 0,
        "enabled": true
      },
      {
        "id": "E33",
        "from": "R1",
        "to": "H11",
        "width": 3,
        "speed": 1.8,
        "direction": "both",
        "door": 0,
        "enabled": true
      },
      {
        "id": "E34",
        "from": "H6",
        "to": "T2",
        "width": 3,
        "speed": 1.8,
        "direction": "both",
        "door": 0,
        "enabled": true
      },
      {
        "id": "E35",
        "from": "L1",
        "to": "P1",
        "width": 3,
        "speed": 1.8,
        "direction": "both",
        "door": 0,
        "enabled": true
      },
      {
        "id": "E36",
        "from": "L2",
        "to": "P2",
        "width": 3,
        "speed": 1.8,
        "direction": "both",
        "door": 0,
        "enabled": true
      },
      {
        "id": "E37",
        "from": "R1",
        "to": "D1",
        "width": 3,
        "speed": 1.8,
        "direction": "both",
        "door": 0,
        "enabled": true
      },
      {
        "id": "E38",
        "from": "R2",
        "to": "D2",
        "width": 3,
        "speed": 1.8,
        "direction": "both",
        "door": 0,
        "enabled": true
      },
      {
        "id": "E39",
        "from": "T1",
        "to": "C1",
        "width": 3,
        "speed": 1.8,
        "direction": "both",
        "door": 0,
        "enabled": true
      },
      {
        "id": "E40",
        "from": "T2",
        "to": "C2",
        "width": 3,
        "speed": 1.8,
        "direction": "both",
        "door": 0,
        "enabled": true
      },
      {
        "id": "E41",
        "from": "T3",
        "to": "C3",
        "width": 3,
        "speed": 1.8,
        "direction": "both",
        "door": 0,
        "enabled": true
      }
    ],
    "od": [
      {
        "id": "OD1",
        "from": "P1",
        "to": "D1",
        "rate": 36,
        "qty": 1,
        "weight": 500,
        "priority": 1,
        "due": 600
      },
      {
        "id": "OD2",
        "from": "P2",
        "to": "D2",
        "rate": 24,
        "qty": 1,
        "weight": 500,
        "priority": 1,
        "due": 600
      }
    ],
    "profiles": [],
    "history": [],
    "closures": [],
    "stops": []
  }
}
```

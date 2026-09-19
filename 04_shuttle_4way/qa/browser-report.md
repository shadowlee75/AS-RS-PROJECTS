# 4-way 셔틀 물동량 계산서

4-way 셔틀 설계 검토 QA 1789344814736

버전 0.1.0 · 운동 커널 1.0.0 · 입력 ID 1b8529fc

| 항목 | 값 |
|---|---|
| 수요 입고 / 출고 | 144.0 / 144.0개/h |
| 무경합 참고 능력 | 248.3개/h |
| 보정 추정 능력 | 248.3개/h |
| 병목 | F1 셔틀 |
| 층별 필요 셔틀 합계 | 8대 |
| 필요 리프트 | 2대 |

시뮬레이션 완료 · 관측 입고 130.0 / 출고 122.0 / 외부 출하 122.0개/h · 화물 보존 true

- 층별 독립 재고 위치가 균일하다고 가정한 무경합 자원 업무량 분석입니다. 실제 경합·재고·버퍼는 시뮬레이션에서 확인하세요.
- 이중 사이클은 층별 입출고 중 작은 물량만 결합합니다. 시뮬레이션은 배차 시 준비된 작업끼리만 결합합니다.

분석 능력은 입력된 층별 입출고 비율을 유지하는 능력입니다. 관측 총합만으로 층별 수요 달성을 판단하지 마세요.

## 전체 입력 (SI)

~~~json
{
  "schemaVersion": "shuttle-4way/project@1",
  "deviceType": "shuttle_4way",
  "moduleVersion": "0.1.0",
  "kernelVersion": "1.0.0",
  "axisConvention": {
    "x": "aisle",
    "y": "vertical",
    "z": "crossrail"
  },
  "units": {
    "distance": "m",
    "speed": "m/s",
    "time": "s",
    "acceleration": "m/s²"
  },
  "config": {
    "name": "4-way 셔틀 설계 검토 QA 1789344814736",
    "system": "tierCaptive",
    "cargoType": "pallet",
    "distanceUnit": "m",
    "speedUnit": "m/min",
    "levels": 4,
    "bays": 20,
    "aisles": 3,
    "bayPitch": 1.4,
    "aislePitch": 3.6,
    "levelPitch": 2.2,
    "baseHeight": 1.2,
    "firstBay": 2.4,
    "carLength": 1.1,
    "carWidth": 0.8,
    "gap": 0.2,
    "cargoLength": 1.2,
    "cargoWidth": 1,
    "cargoHeight": 1.4,
    "cargoMass": 800,
    "shuttleLimit": 1500,
    "liftLimit": 1500,
    "xEmptyV": 3,
    "xLoadedV": 2,
    "xEmptyA": 0.8,
    "xLoadedA": 0.6,
    "xEmptyD": 0.8,
    "xLoadedD": 0.6,
    "zEmptyV": 1.5,
    "zLoadedV": 1,
    "zEmptyA": 0.5,
    "zLoadedA": 0.4,
    "zEmptyD": 0.5,
    "zLoadedD": 0.4,
    "liftV": 2,
    "liftA": 0.8,
    "liftD": 0.8,
    "turn": 1.5,
    "position": 0.3,
    "shuttleTransfer": 3,
    "liftTransfer": 3,
    "liftPosition": 0.3,
    "numLifts": 1,
    "floorBuffer": 4,
    "outputBuffer": 8,
    "outputTakeaway": 0,
    "cycleMode": "dual",
    "dispatch": "fifo",
    "storage": "random",
    "peak": 1.2,
    "targetUtil": 0.8,
    "A": 1,
    "Ew": 1,
    "basis": "assumption",
    "basisNote": "초기 A=1, Ew=1은 손실 없는 비교 가정입니다. 현장 실측값으로 바꾸세요.",
    "hours": 0.5,
    "warmup": 3,
    "seed": 20260911,
    "arrival": "takt",
    "jitter": 0.1,
    "initialFill": 0.5,
    "demandMode": "rate",
    "history": [],
    "layers": [
      {
        "id": "F1",
        "shuttles": 1,
        "inbound": 30,
        "outbound": 30
      },
      {
        "id": "F2",
        "shuttles": 1,
        "inbound": 30,
        "outbound": 30
      },
      {
        "id": "F3",
        "shuttles": 1,
        "inbound": 30,
        "outbound": 30
      },
      {
        "id": "F4",
        "shuttles": 1,
        "inbound": 30,
        "outbound": 30
      }
    ]
  }
}
~~~

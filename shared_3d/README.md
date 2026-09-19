# Blender 3D 모델 적용

2026-09-14 · 그래픽 모듈 1.0.0 · Blender 4.5.13 LTS

스태커크레인·직선 RGV·Loop RGV·셔틀의 움직이는 장비를 Blender에서 제작한 모델로 교체했습니다. 기존 프로그램의 물동량 계산, 배차·버퍼·재고 로직과 좌표 계산을 그대로 사용합니다.

## 실행 파일

- [스태커크레인](../스태커크레인_실행.html)
- [직선 RGV](../직선RGV_실행.html)
- [Loop RGV](../LoopRGV_실행.html)
- [셔틀](../셔틀_실행.html)

각 HTML을 Edge 또는 Chrome에서 열고 **3D 시뮬레이션** 탭으로 이동하세요. 화면 오른쪽 아래 **Blender 모델 → 장비 확대**로 새 장비 형상을 가까이 볼 수 있습니다. RGV·셔틀은 현재 선택 장비, 크레인은 현재 선택 통로의 장비를 확대합니다.

Blender는 형상을 제작하는 데 사용했습니다. 브라우저의 실시간 표시는 Three.js/WebGL이 담당합니다. 모델 데이터가 HTML에 내장되어 있으므로 실행 PC에는 Blender 설치나 인터넷 연결이 필요하지 않습니다.

## Blender 원본과 교환 파일

| 파일 | 용도 |
|---|---|
| [equipment_models.blend](assets/equipment_models.blend) | Blender에서 편집할 수 있는 원본, 9개 이름 있는 장비·화물 어셈블리 |
| [equipment_models.glb](assets/equipment_models.glb) | Blender에서 내보낸 glTF 2.0 교환용 모델 |
| [mesh_library.json](assets/mesh_library.json) | 같은 Blender 평가 메시에서 추출한 웹용 위치·법선·삼각형·재질 데이터 |
| [asset_manifest.json](assets/asset_manifest.json) | Blender 버전, 삼각형 수, 파일 크기와 SHA-256 |

웹 실행 파일에는 해당 프로그램에 필요한 메시만 들어갑니다. GLB를 실행 중에 내려받는 구조는 아닙니다. GLB와 웹용 메시 모두 실제 Blender 원본에서 생성했습니다.

Blender 원본은 편집용 자산 모음입니다. 계산 프로그램 전체를 Blender 안에서 실행하는 파일이나 Blender 물리 엔진을 사용한 시뮬레이션으로 전환한 것은 아닙니다.

## 적용한 장비

| 장비 | Blender 형상과 연동 |
|---|---|
| 스태커크레인 | 주행대, 바퀴·허브, 제어함, 마스트·가이드, 승강대, 텔레스코픽 포크. 주행 X·승강 Y·포크 Z에 각각 연결 |
| 직선 RGV | 롤러 컨베이어, 차체 모서리, 구동륜, 센서, 범퍼, 제어함·표시등. 직선/Tandem 각 차량 좌표와 화물 인계에 연결 |
| Loop RGV | RGV 차체와 롤러·센서·표시등. 폐곡선 좌표·접선 방향·역방향 운행에 연결 |
| 셔틀 | 낮은 차체, 구동륜, 방향별 이송부·리프팅 데크·센서. 층별 X/Z 이동에 연결 |
| 화물 리프트 | 롤러 승강 플랫폼. 실제 Y 승강·상하차에 연결 |
| 운반 화물 | 목재 받침·포장·밴드·라벨이 있는 공통 설명용 화물. 기존 치수와 적재·이재 상태에 맞춰 표시 |

랙·레일·통로·저장 셀·버퍼 등 입력 치수와 개수에 따라 바뀌는 배치는 기존 절차적 생성 방식을 사용합니다. 저장 재고의 대량 표시도 기존 인스턴싱을 사용합니다. 운반 화물의 모양은 설명용이며 실제 제조사 CAD와 동일한 모델은 아닙니다.

크레인의 가장 낮은 화물 중심 아래에 주행대·승강대·포크가 들어갈 수 있도록 바닥과 주행 레일의 표시 높이를 조정했습니다. 계산되는 화물 중심 좌표는 바뀌지 않습니다.

## 모델 편집과 재생성

1. Blender에서 equipment_models.blend를 엽니다.
2. rgv_linear, rgv_loop, shuttle, lift, stacker_base, stacker_mast, stacker_carriage, stacker_fork, cargo_pallet 루트 아래의 메시를 편집합니다.
3. 루트의 asset_id와 부품 계층은 유지합니다.
4. 아래 명령으로 수정한 원본에서 다시 내보냅니다.

~~~powershell
blender "shared_3d/assets/equipment_models.blend" --background --python "shared_3d/scripts/generate_models.py" -- --out "shared_3d/assets" --export-only
node shared_3d/scripts/install_assets.js
node 01_stacker_crane/scripts/build.js
node 02_rgv_linear/scripts/build.js
node 03_rgv_loop/scripts/build.js
node 04_shuttle_4way/scripts/build.js
~~~

명령은 ‘5_통합 물동량 계산 프로그램’ 폴더에서 실행하는 예입니다. Blender 명령이 PATH에 없으면 blender.exe의 전체 경로를 사용하세요.

--export-only를 빼면 생성 스크립트의 기본 모델을 다시 만듭니다. 사용자 편집을 유지하려면 수정한 .blend를 열고 --export-only를 사용하세요.

장비 모델은 각 프로그램의 기존 차체 크기에 맞춰 정규화됩니다. 표시 형상을 바꿔도 설비 사양·물동량 입력이 자동으로 바뀌지는 않습니다. 모델과 입력 사양을 함께 관리하세요.

## 검증

- [통합 검증 JSON](qa/verification.json)
- [4개 프로그램 브라우저 확인](qa/browser-smoke.json)
- [스태커크레인 확대](qa/stacker_detail.png)
- [직선 RGV 확대](qa/linear_detail.png)
- [Loop RGV 확대](qa/loop_detail.png)
- [셔틀 확대](qa/shuttle_detail.png)

계산·원래 장면 소스의 SHA-256을 변경 전과 비교합니다. 배포 HTML 안의 모델 데이터와 생성 소스가 같은지, GLB와 Blender 원본의 무결성, 메시 인덱스·좌표·법선, 4개 프로그램의 실제 동작 좌표를 검사합니다.

기존 검증 결과: 크레인 계산 45개, 직선 RGV 계산 36개·장면 상태 7개, Loop RGV 계산 39개, 셔틀 계산 39개 통과. 추가 브라우저 검증으로 직선 RGV 19개, Loop RGV 40개, 셔틀 34개를 확인했습니다. 크레인 기존 장면 검증의 초기 29 draw calls 기준도 통과했습니다.

WebGL을 사용할 수 없으면 기존 2D 대체 표시가 작동하며, Blender 모델 표시가 제거됩니다. JSON·CSV·보고서·물동량 계산에는 기존 동작을 유지합니다.

## 변경 전 백업

[backup_before_blender_20260914](backup_before_blender_20260914/)에 4개 기존 HTML, 원래 장면·계산 파일, 빌드·검증 스크립트와 SHA-256 기록을 보관했습니다.

Blender 실행 도구는 공식 [Blender 4.5 배포 저장소](https://download.blender.org/release/Blender4.5/)에서 받은 4.5.13 Windows 패키지를 SHA-256 검증한 뒤 사용했습니다.


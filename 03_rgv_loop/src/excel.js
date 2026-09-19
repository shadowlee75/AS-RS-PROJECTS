(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./model'),require('./xlsx'),require('./tables'));else root.LoopExcel=factory(root.LoopModel,root.LoopXlsx,root.LoopTables);})(globalThis,function(Model,Xlsx,Tables){
  'use strict';
  const SCHEMA='rgv-loop/workbook@1';
  const choices={
    direction:{forward:'정방향 +s',reverse:'역방향 -s'},distanceUnit:{m:'m',mm:'mm'},speedUnit:{'m/min':'m/min','m/s':'m/s'},unit:{PLT:'PLT',BOX:'BOX',TOTE:'TOTE'},
    handlingMode:{total:'간편 · 총 시간',detail:'상세 · 순수 이재+지연'},dispatch:{nearest:'가까운 배차 가능 작업',fifo:'FIFO · 오래된 작업'},parking:{circulate:'본선 순환',stay:'현재 위치 정차'},
    controlMode:{following:'차량 간격 추종',block:'고정 블록 점유·예약'},analysisMode:{od:'실제 OD · 독립 혼합 공차',oneLap:'1랩 개략 · 균일 위치 가정'},
    etaMode:{none:'미선택',beta:'β 역수식',power:'γ 거듭제곱식'},basis:{'':'미선택',assumption:'설계 가정',measured:'실측',vendor:'벤더 사양'},
    arrival:{takt:'일정 간격 + 변동',poisson:'Poisson 도착'},demandMode:{rate:'OD 물동량 · 시간대 배율',history:'작업이력'},odTableMode:{paired:'같은 번호 P→D 자동 생성',manual:'수동 편집'},periodTableMode:{hourly:'1시간 간격 자동 생성',manual:'수동 편집'}
  };
  const labels={name:'프로젝트명',direction:'운행 방향',distanceUnit:'화면 거리 단위',speedUnit:'화면 속도 단위',unit:'화물 단위',handlingMode:'화면 이재시간 입력',dispatch:'배차',parking:'빈 차량 대기',controlMode:'차량 제어',analysisMode:'거리 분석',etaMode:'간섭 η(N)',basis:'계수 근거',basisNote:'근거 메모',arrival:'작업 도착',demandMode:'수요 입력',odTableMode:'OD 표 생성',periodTableMode:'시간대 표 생성'};
  const keys=Object.keys(Model.defaults).filter(k=>!Array.isArray(Model.defaults[k]));
  const basicHeaders=['키','항목','입력값','단위','설명'];
  const specs={
    '설비스테이션':{key:'stations',min:1,max:Model.LIMITS.stations,headers:['ID','이름','위치 s (m)','총 상차시간 (s)','총 하차시간 (s)','출고 버퍼 (개)','반출 간격 (s/개)'],fields:['id','name','s','load','unload','buffer','takeaway'],widths:[16,24,19,23,23,22,25]},
    'OD물동량':{key:'ods',max:Model.LIMITS.ods,headers:['OD ID','출발 ID','도착 ID','요구 물동량 (개/h)'],fields:['id','from','to','rate'],widths:[18,20,20,30]},
    '시간대비율':{key:'profile',max:Model.LIMITS.profile,headers:['시작 (min)','끝 (min)','비율 (100%=1배)'],fields:['start','end','multiplier'],widths:[24,24,30]},
    '제한속도':{key:'zones',max:Model.LIMITS.zones,headers:['시작 s (m)','끝 s (m)','제한속도 (m/min)'],fields:['from','to','v'],widths:[24,24,30]},
    '작업이력':{key:'history',max:Model.LIMITS.history,headers:['도착 (s)','출발 ID','도착 ID','수량 (개)'],fields:['time','from','to','quantity'],widths:[24,20,20,24]}
  };
  const experimentDefaults={fleetMin:1,fleetMax:20,fleetStep:1,repCount:3};
  const experimentLabels={fleetMin:'최소 대수',fleetMax:'최대 대수',fleetStep:'대수 간격',repCount:'대수당 반복 횟수'};
  function unit(k){const kind=Model.fields[k]?.[1];return kind==='distance'?'m':kind==='speed'?'m/min':kind==='ratio'?'비율 (100%=1)':kind||'문자';}
  function validateExperiment(input,c){
    const e={...input};for(const k of Object.keys(experimentDefaults))if(!Number.isInteger(e[k])||e[k]<1||e[k]>64)throw Error('실험조건: '+experimentLabels[k]+'은 1~64 정수입니다.');
    if(![1,3,5].includes(e.repCount))throw Error('실험조건: 반복 횟수는 1, 3, 5 중 하나입니다.');
    if(e.fleetMin>e.fleetMax)throw Error('실험조건: 최대 대수는 최소 대수 이상이어야 합니다.');
    const max=Math.min(64,Math.floor(Model.length(c)/(c.carLength+c.gap)),c.controlMode==='block'?c.blocks:64);
    if(e.fleetMax>max)throw Error('실험조건: 현재 배치의 실험 가능 최대 대수는 '+max+'대입니다.');
    if((Math.ceil((e.fleetMax-e.fleetMin)/e.fleetStep)+1)*e.repCount>120)throw Error('실험조건: 전체 반복은 120회 이하여야 합니다.');return e;
  }
  function sheets(input,experiment){
    const c=Model.validate(input),e=validateExperiment(experiment||{...experimentDefaults,fleetMax:Math.min(20,Math.floor(Model.length(c)/(c.carLength+c.gap)),c.controlMode==='block'?c.blocks:64)},c);
    const book={
      '안내':{widths:[25,110],filter:false,rows:[['항목','안내'],['파일 형식',SCHEMA],['프로그램 버전',Model.VERSION],['시작','기본조건의 입력값 열과 각 표의 파란색 셀을 편집한 후 .xlsx로 저장하고 프로그램에서 엑셀 불러오기를 누르세요.'],['지원 범위','스테이션 최대 200개, OD 최대 200개, 측정시간 최대 24시간. 측정시간은 시간(h) 단위 숫자로 입력합니다. 계산 규모·예상 작업 수 한도는 별도 적용됩니다.'],['포함 범위','전체 기본조건, 설비스테이션, OD물동량, 시간대비율, 제한속도, 작업이력, 실험조건. 실행 중 상태와 결과 로그는 포함하지 않습니다.'],['엑셀 고정 단위','거리 m / 속도 m/min / 가감속 m/s² / 시간 s. 기본조건의 화면 단위 선택은 표시만 바꾸며 엑셀 숫자의 단위를 바꾸지 않습니다.'],['상하차시간','설비스테이션은 항상 정위치+인터록+신호를 포함한 총 시간(s)입니다. 상세 입력 화면의 순수 이재시간은 불러올 때 자동 환산합니다.'],['비율 입력','80% 또는 0.8을 입력하면 80%입니다. 시간대비율 120% 또는 1.2는 1.2배입니다. 혼동을 줄이려면 % 기호를 붙여 입력하세요. 실제 숫자값은 각각 0.8, 1.2입니다.'],['시간대 기준','운전 시작부터 min 기준. 빈 표는 전체 100%, 행이 있으면 지정 시간대에만 수요를 생성합니다. 준비운전+측정시간 범위 안에서 겹치지 않게 입력합니다.'],['자동 입력표','프로그램에서 불러올 때 같은 번호의 P→D 연결을 자동 추가합니다. 기존 OD 수량은 유지하고 새 OD는 0입니다. 시간대가 비어 있고 자동 생성이면 준비운전과 측정 1시간 간격으로 100% 표를 생성합니다. 엑셀 파일 안에서 행이 실시간 생성되는 기능은 아닙니다.'],['OD 수량','피크 적용 전 화물 개수/h입니다. 차량 운행 횟수가 아닙니다. 출발·도착 ID는 설비스테이션 ID와 일치해야 합니다.'],['작업이력','한 행이 한 작업이며 수량은 1회 최대 적재량 이하여야 합니다. 기본조건의 수요 입력을 작업이력으로 선택하면 사용합니다.'],['행 추가·삭제','표의 2행부터 입력합니다. 빈 행은 무시합니다. 쓰지 않는 시간대·제한속도·작업이력은 헤더만 남겨두세요. 시트명·헤더·기본조건 키는 유지하세요.'],['선택형 조건','기본조건 입력값 셀의 목록에서 선택하세요. 기본조건 항목과 설명 열은 읽기용이며 계산에는 키·입력값·단위를 사용합니다.'],['불러오기','모든 시트를 검사한 후 한 번에 적용합니다. 누락 스테이션을 참조한 OD는 정리 내용을 확인한 후 적용할 수 있습니다. 다른 오류가 있으면 현재 화면 입력과 결과를 유지합니다. 성공하면 기존 시뮬레이션·실험 결과는 초기화됩니다.'],['수식과 파일 형식','확정 값만 불러옵니다. 수식은 값 붙여넣기로 변환하세요. .xls, .xlsm, 암호화 통합 문서는 지원하지 않습니다.'],['저장 동작','현재 화면에서 편집 중인 입력값도 검증 후 저장합니다. 브라우저 다운로드 위치에 파일을 저장하며 기존 파일을 직접 덮어쓰지 않습니다.']]},
      '기본조건':{widths:[22,27,31,22,88],rows:[basicHeaders],styles:[[]],validations:[]}
    };
    book.안내.styles=book.안내.rows.map(()=>[5,5]);book.안내.heights=book.안내.rows.map((_,i)=>i<3?32:48);
    for(const k of keys){
      const f=Model.fields[k],options=choices[k];if(!f&&!labels[k])throw Error('엑셀 필드 정의 누락: '+k);
      const value=options?options[c[k]]:f?.[1]==='speed'?c[k]*60:c[k];
      let help=f?.[5]|| (options?'선택: '+Object.values(options).join(' / '):k==='basisNote'?'보정계수의 입력 근거를 기록합니다.':'설계안 이름을 입력합니다.');
      if(['distanceUnit','speedUnit','handlingMode'].includes(k))help+=' 엑셀 데이터 단위와 총 이재시간은 안내 시트의 고정 기준을 사용합니다.';
      book.기본조건.rows.push([k,f?.[0]||labels[k],value,unit(k),help]);book.기본조건.styles.push([5,5,options||typeof value==='string'?2:f?.[1]==='ratio'?4:3,5,5]);
      if(options)book.기본조건.validations.push({range:'C'+book.기본조건.rows.length,values:Object.values(options)});
    }
    book.기본조건.heights=book.기본조건.rows.map((r,i)=>i&&r[0]==='basisNote'?Math.max(36,Math.ceil(String(r[2]).length/18)*17):48);
    for(const[name,spec]of Object.entries(specs)){
      const rows=[spec.headers,...c[spec.key].map(row=>spec.fields.map(k=>spec.key==='zones'&&k==='v'?row[k]*60:row[k]))];
      book[name]={rows,widths:spec.widths,styles:rows.map((row,i)=>row.map((v,j)=>i&&spec.key==='profile'&&j===2?4:typeof v==='number'?3:2))};
    }
    book.실험조건={widths:[24,30,25],rows:[['키','항목','입력값'],...Object.keys(experimentDefaults).map(k=>[k,experimentLabels[k],e[k]])],styles:[[],...[1,2,3,4].map(()=>[5,5,3])],validations:[{range:'C5',values:['1','3','5']}]};return book;
  }
  function fromSheets(raw,options={}){
    let errorCount=0;const errors=[],fail=(where,message)=>{errorCount++;if(errors.length<30)errors.push(where+': '+message);},blank=x=>x===null||x===undefined||String(x).trim()==='';
    const required=['안내','기본조건',...Object.keys(specs),'실험조건'];for(const name of required)if(!Object.hasOwn(raw,name))fail(name,'시트가 없습니다. 프로그램에서 저장한 엑셀 양식을 사용하세요.');
    for(const name of Object.keys(raw))if(!required.includes(name))fail(name,'지원하지 않는 시트입니다. 별도 메모는 안내 시트에 적어주세요.');
    if(errors.length)throw Error(errors.join('\n'));
    const metadata=(raw.안내||[]).filter(r=>r?.[0]==='파일 형식');if(metadata.length!==1||metadata[0][1]!==SCHEMA)fail('안내','지원하는 LOOP RGV 엑셀 양식이 아닙니다.');
    function table(name,headers,max){
      const rows=raw[name],head=rows[0]||[],indices=headers.map(h=>head.indexOf(h));
      if(indices.some(i=>i<0)||head.filter(x=>!blank(x)).length!==headers.length||new Set(head.filter(x=>!blank(x))).size!==headers.length){fail(name+' 1행','열 제목이 양식과 다릅니다. 필요한 열: '+headers.join(', '));return[];}
      const result=[];for(let i=1;i<rows.length;i++){const r=rows[i]||[];if(r.every(blank))continue;if(r.some((x,col)=>!indices.includes(col)&&!blank(x)))fail(name+' '+(i+1)+'행','양식 외 열에 입력된 값이 있습니다.');result.push({row:i+1,values:indices.map(j=>r[j]??'')});}
      if(result.length>max)fail(name,'입력된 행은 '+result.length+'개입니다. 최대 '+max+'개까지 지원합니다.');return result;
    }
    function number(value,where,min=-Infinity,max=Infinity,integer=false){
      const n=typeof value==='number'?value:typeof value==='string'&&/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())?Number(value):NaN;
      if(!Number.isFinite(n)||n<min||n>max||integer&&!Number.isInteger(n)){fail(where,'입력값 '+(blank(value)?'(빈칸)':JSON.stringify(String(value).slice(0,80)))+' → '+(integer?'정수':'숫자')+' '+min+'~'+max+' 범위로 입력하세요.');return NaN;}return n;
    }
    const c={},seen=new Set();
    for(const {row,values:[rawKey,,value,units]}of table('기본조건',basicHeaders,keys.length)){
      const key=String(rawKey).trim(),where='기본조건 '+row+'행 '+(labels[key]||Model.fields[key]?.[0]||key);
      if(!keys.includes(key)){fail(where,'알 수 없는 키입니다.');continue;}if(seen.has(key)){fail(where,'키가 중복되었습니다.');continue;}seen.add(key);
      if(units!==unit(key))fail(where,'단위는 '+unit(key)+'로 유지하세요.');
      if(choices[key]){const values=choices[key],text=String(value).trim();const match=Object.entries(values).find(([code,label])=>label===text||code===text);if(!match)fail(where,'선택값 확인: '+Object.values(values).join(', '));else c[key]=match[0];}
      else if(Model.fields[key]){const [,kind,min,max]=Model.fields[key],scale=kind==='speed'?60:1;c[key]=number(value,where+(key==='hours'?' [시간 h · 8시간=8, 30분=0.5]':''),min*scale,max*scale,['vehicles','batchSize','blocks','seed'].includes(key))/scale;}
      else c[key]=String(value??'');
    }
    for(const k of keys)if(!seen.has(k)&&!['odTableMode','periodTableMode'].includes(k))fail('기본조건','필수 항목 누락: '+k);
    if(typeof c.name==='string'&&(!c.name.trim()||c.name.length>160))fail('기본조건 프로젝트명','1~160자를 입력하세요.');if(c.basisNote?.length>500)fail('기본조건 근거 메모','500자 이내로 입력하세요.');
    const rowRefs={};
    for(const[name,spec]of Object.entries(specs)){
      const records=table(name,spec.headers,spec.max);if(records.length<(spec.min||0))fail(name,'최소 '+spec.min+'개 행이 필요합니다.');rowRefs[spec.key]=records.map(r=>r.row);
      c[spec.key]=records.map(({row,values})=>{const object={};spec.fields.forEach((k,j)=>{const text=['id','name'].includes(k)||(['ods','history'].includes(spec.key)&&['from','to'].includes(k));object[k]=text?String(values[j]??'').trim():number(values[j],name+' '+row+'행 '+spec.headers[j],0,Infinity,['quantity','buffer'].includes(k));if(spec.key==='zones'&&k==='v')object[k]/=60;});return object;});
    }
    const stationIds=new Set(),length=Model.length(c),end=c.warmup+c.hours*60,overhead=c.position+c.interlock+c.signal;
    function checkRows(key,fn){c[key].forEach((r,i)=>fn(r,i,Object.keys(specs).find(n=>specs[n].key===key)+' '+rowRefs[key][i]+'행'));}
    checkRows('stations',(s,i,w)=>{if(!/^[A-Za-z0-9_-]{1,30}$/.test(s.id)||stationIds.has(s.id))fail(w+' ID','중복 없는 영문·숫자·_·- 1~30자를 사용하세요.');stationIds.add(s.id);if(s.name.length>80)fail(w+' 이름','80자 이내로 입력하세요.');number(s.s,w+' 위치',0,length);number(s.load,w+' 총 상차시간',overhead,600);number(s.unload,w+' 총 하차시간',overhead,600);number(s.buffer,w+' 출고 버퍼',c.batchSize,10000,true);number(s.takeaway,w+' 반출 간격',0,3600);});
    const ods=new Set();checkRows('ods',(o,i,w)=>{if(!/^[A-Za-z0-9_-]{1,30}$/.test(o.id)||ods.has(o.id))fail(w+' OD ID','중복 없는 영문·숫자·_·- 1~30자를 사용하세요.');ods.add(o.id);number(o.rate,w+' 요구 물동량',0,10000);});
    const missingStations=new Map();
    for(const key of (options.reconcile?['history']:['ods','history']))checkRows(key,(o,i,w)=>{for(const[field,label]of [['from','출발'],['to','도착']])if(!stationIds.has(o[field])){const id=o[field]||'(빈 ID)',refs=missingStations.get(id)||[];refs.push(w+' '+label+' ID');missingStations.set(id,refs);}});
    if(missingStations.size){
      fail('스테이션 ID 연결','설비스테이션에 없는 ID '+missingStations.size+'개: '+[...missingStations.keys()].join(', '));
      errors.push('해결: 설비스테이션 시트에 해당 ID와 실제 위치·상하차시간·버퍼 사양을 입력하거나, OD물동량/작업이력의 ID를 등록된 ID로 수정하세요.');
      errors.push('누락 위치: '+[...missingStations].slice(0,8).map(([id,refs])=>id+' ('+refs[0]+(refs.length>1?' 외 '+(refs.length-1)+'곳':'')+')').join('; ')+(missingStations.size>8?' 등':'') );
    }
    checkRows('zones',(z,i,w)=>{number(z.from,w+' 시작',0,length);number(z.to,w+' 끝',0,length);number(z.v*60,w+' 속도',.6,600);if(z.from>=z.to)fail(w,'끝 위치는 시작보다 커야 합니다.');});
    checkRows('profile',(p,i,w)=>{number(p.start,w+' 시작',0,end);number(p.end,w+' 끝',0,end);number(p.multiplier,w+' 비율',0,10);if(p.start>=p.end||i&&p.start<c.profile[i-1].end)fail(w,'시간대는 겹치지 않는 시작 순서로 입력하세요.');});
    checkRows('history',(h,i,w)=>{number(h.time,w+' 도착',0,end*60);number(h.quantity,w+' 수량',1,c.batchSize,true);});
    const experiment={},expSeen=new Set();for(const {row,values:[k,,value]}of table('실험조건',['키','항목','입력값'],4)){if(!Object.hasOwn(experimentDefaults,k)||expSeen.has(k))fail('실험조건 '+row+'행','키가 잘못되었거나 중복되었습니다.');else{expSeen.add(k);experiment[k]=number(value,'실험조건 '+row+'행',1,64,true);}}
    for(const k of Object.keys(experimentDefaults))if(!expSeen.has(k))fail('실험조건','필수 항목 누락: '+k);
    if(errors.length)throw Error('엑셀 입력조건을 적용하지 않았습니다. 아래 항목을 수정한 뒤 다시 불러오세요.\n\n'+errors.join('\n')+(errorCount>30?'\n외 '+(errorCount-30)+'개 오류가 있습니다. 앞선 오류를 수정한 뒤 다시 확인하세요.':''));
    const sync=options.reconcile?Tables.reconcile(c):null;const config=Model.validate(sync?sync.config:c);validateExperiment(experiment,config);return {config,experiment,...(sync?{repair:{removed:sync.removed,removedRowNumbers:sync.removed.map(o=>rowRefs.ods[c.ods.findIndex(r=>r.id===o.id)]),added:sync.added,profileCreated:sync.profileCreated,warnings:sync.warnings},rowRefs}: {})};
  }
  const write=(c,e)=>Xlsx.write(sheets(c,e));
  const read=async(file,options)=>{if(file.name&&!/\.xlsx$/i.test(file.name))throw Error('Excel 통합 문서(.xlsx) 파일을 선택하세요.');return fromSheets(await Xlsx.read(file),options);};
  return {SCHEMA,choices,keys,specs,sheets,fromSheets,write,read,validateExperiment};
});

/* Offline XLSX transport. Adapted from this workspace's AGV/AMR io.js.
 * SpreadsheetML reference: https://learn.microsoft.com/office/open-xml/spreadsheet/structure-of-a-spreadsheetml-document
 * No formulas are evaluated and no external relationships are followed.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LoopXlsx=api;})(globalThis,function(){
  'use strict';
  const NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const MAX_FILE=10*1024*1024,MAX_EXPANDED=32*1024*1024;
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  // Preserve literal Excel escape tokens and XML-incompatible control characters.
  const xtext=s=>escape(String(s??'').replace(/_x[0-9a-f]{4}_/gi,m=>'_x005F_'+m.slice(1)).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,c=>'_x'+c.charCodeAt(0).toString(16).padStart(4,'0')+'_'));
  const untext=s=>s.replace(/_x([0-9a-f]{4})_/gi,(_,h)=>String.fromCharCode(parseInt(h,16)));
  function colName(n){let s='';while(n>=0){s=String.fromCharCode(n%26+65)+s;n=Math.floor(n/26)-1;}return s;}
  let crcTable;
  function crc32(bytes){if(!crcTable)crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xEDB88320^(n>>>1):n>>>1;return n>>>0;});let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
  function zip(files){
    const enc=new TextEncoder(),chunks=[],central=[];let offset=0,total=0;
    for(const[name,text]of Object.entries(files)){
      const filename=enc.encode(name),body=enc.encode(text),crc=crc32(body),local=new Uint8Array(30+filename.length),d=new DataView(local.buffer);
      d.setUint32(0,0x04034b50,true);d.setUint16(4,20,true);d.setUint16(6,0x800,true);d.setUint16(12,33,true);d.setUint32(14,crc,true);d.setUint32(18,body.length,true);d.setUint32(22,body.length,true);d.setUint16(26,filename.length,true);local.set(filename,30);chunks.push(local,body);
      const c=new Uint8Array(46+filename.length),v=new DataView(c.buffer);v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x800,true);v.setUint16(14,33,true);v.setUint32(16,crc,true);v.setUint32(20,body.length,true);v.setUint32(24,body.length,true);v.setUint16(28,filename.length,true);v.setUint32(42,offset,true);c.set(filename,46);central.push(c);offset+=local.length+body.length;total+=c.length;
    }
    const end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,central.length,true);v.setUint16(10,central.length,true);v.setUint32(12,total,true);v.setUint32(16,offset,true);
    return new Blob([...chunks,...central,end],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  }
  function sheetXml(sheet){
    const {rows,widths=[],validations=[],styles=[]}=sheet,last=Math.max(1,rows.length),cols=Math.max(...rows.map(r=>r.length));
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="'+NS+'"><dimension ref="A1:'+colName(cols-1)+last+'"/><sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="30"/><cols>'+widths.map((w,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+w+'" customWidth="1"/>').join('')+'</cols><sheetData>'+rows.map((row,i)=>'<row r="'+(i+1)+'" ht="'+(i===0?32:sheet.heights?.[i]||36)+'" customHeight="1">'+row.map((v,j)=>'<c r="'+colName(j)+(i+1)+'" s="'+(i===0?1:(styles[i]?.[j]??(typeof v==='number'?3:2))===3&&Number.isInteger(v)?6:styles[i]?.[j]??(typeof v==='number'?3:2))+'"'+(typeof v==='number'&&Number.isFinite(v)?'><v>'+v+'</v>':' t="inlineStr"><is><t xml:space="preserve">'+xtext(v)+'</t></is>')+'</c>').join('')+'</row>').join('')+'</sheetData>'+(sheet.filter===false?'':'<autoFilter ref="A1:'+colName(cols-1)+last+'"/>')+(validations.length?'<dataValidations count="'+validations.length+'">'+validations.map(d=>'<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="선택값 확인" error="목록에서 값을 선택하세요." sqref="'+d.range+'"><formula1>'+escape('"'+d.values.join(',')+'"')+'</formula1></dataValidation>').join('')+'</dataValidations>':'')+'<pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/></worksheet>';
  }
  function write(book){
    const names=Object.keys(book),files={};
    files['[Content_Types].xml']='<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+names.map((n,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>';
    files['_rels/.rels']='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="'+REL+'/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    files['xl/workbook.xml']='<workbook xmlns="'+NS+'" xmlns:r="'+REL+'"><sheets>'+names.map((n,i)=>'<sheet name="'+escape(n)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets></workbook>';
    files['xl/_rels/workbook.xml.rels']='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+names.map((n,i)=>'<Relationship Id="rId'+(i+1)+'" Type="'+REL+'/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'<Relationship Id="styles" Type="'+REL+'/styles" Target="styles.xml"/></Relationships>';
    const xf=(font,fill,num)=>'<xf numFmtId="'+num+'" fontId="'+font+'" fillId="'+fill+'" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>';
    files['xl/styles.xml']='<styleSheet xmlns="'+NS+'"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.##########"/></numFmts><fonts count="3"><font><sz val="11"/><color rgb="FF264653"/><name val="맑은 고딕"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="맑은 고딕"/></font><font><sz val="11"/><color rgb="FF1760A5"/><name val="맑은 고딕"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF163C4B"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF0F7FD"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="7">'+xf(0,0,0)+xf(1,2,0)+xf(2,3,0)+xf(2,3,164)+xf(2,3,10)+xf(0,0,0)+xf(2,3,3)+'</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
    names.forEach((n,i)=>{files['xl/worksheets/sheet'+(i+1)+'.xml']=sheetXml(book[n]);});return zip(files);
  }
  async function unzip(buffer){
    const bytes=new Uint8Array(buffer),v=new DataView(buffer),dec=new TextDecoder('utf-8',{fatal:true}),out=Object.create(null);let end=-1;
    const bounds=(at,n)=>{if(!Number.isInteger(at)||at<0||n<0||at+n>bytes.length)throw Error('XLSX ZIP 파일이 잘렸거나 손상되었습니다.');};
    if(bytes.length>MAX_FILE)throw Error('엑셀 파일은 10 MB 이하여야 합니다.');
    for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(v.getUint32(i,true)===0x06054b50&&i+22+v.getUint16(i+20,true)===bytes.length){end=i;break;}
    if(end<0)throw Error('정상 .xlsx 파일이 아닙니다. Excel 통합 문서(.xlsx)로 저장하세요.');
    const count=v.getUint16(end+10,true);let pos=v.getUint32(end+16,true),expanded=0;
    if(count>200||v.getUint16(end+4,true)||v.getUint16(end+6,true))throw Error('분할 또는 과도하게 복잡한 워크북은 지원하지 않습니다.');
    for(let i=0;i<count;i++){
      bounds(pos,46);if(v.getUint32(pos,true)!==0x02014b50)throw Error('XLSX ZIP 디렉터리가 손상되었습니다.');
      const flag=v.getUint16(pos+8,true),method=v.getUint16(pos+10,true),size=v.getUint32(pos+20,true),rawSize=v.getUint32(pos+24,true),nameLen=v.getUint16(pos+28,true),extra=v.getUint16(pos+30,true),comment=v.getUint16(pos+32,true),loc=v.getUint32(pos+42,true);
      bounds(pos+46,nameLen+extra+comment);const name=dec.decode(bytes.slice(pos+46,pos+46+nameLen));expanded+=rawSize;
      if(expanded>MAX_EXPANDED||flag&1)throw Error('암호화 또는 압축 해제 후 32 MB 초과 파일은 지원하지 않습니다.');
      if(Object.hasOwn(out,name))throw Error('중복된 XLSX 내부 파일입니다.');
      bounds(loc,30);if(v.getUint32(loc,true)!==0x04034b50)throw Error('XLSX ZIP 헤더가 손상되었습니다.');
      const begin=loc+30+v.getUint16(loc+26,true)+v.getUint16(loc+28,true);bounds(begin,size);
      if(/\.xml$|\.rels$/.test(name)){
        const data=bytes.slice(begin,begin+size);let result;
        if(method===0)result=data;
        else if(method===8){
          if(typeof DecompressionStream==='undefined')throw Error('압축 엑셀을 읽을 수 없습니다. 최신 Edge 또는 Chrome을 사용하세요.');
          const reader=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(),parts=[];let length=0;
          try{while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>rawSize||length>MAX_EXPANDED){await reader.cancel();throw Error('엑셀 압축 해제 크기 한도 초과');}parts.push(value);}}finally{reader.releaseLock();}
          result=new Uint8Array(length);let at=0;for(const p of parts){result.set(p,at);at+=p.length;}
        }else throw Error('지원하지 않는 엑셀 압축 방식입니다.');
        if(result.length!==rawSize||crc32(result)!==v.getUint32(pos+16,true))throw Error('엑셀 파일의 무결성 검사에 실패했습니다. 다시 저장하세요.');out[name]=dec.decode(result);
      }
      pos+=46+nameLen+extra+comment;
    }return out;
  }
  async function read(file){
    if(file.size>MAX_FILE)throw Error('엑셀 파일은 10 MB 이하여야 합니다.');
    const files=await unzip(await file.arrayBuffer()),els=(x,n)=>Array.from(x.getElementsByTagNameNS('*',n));
    const xml=s=>{if(!s)throw Error('엑셀 필수 시트 파일이 없습니다.');if(/<!DOCTYPE|<!ENTITY/i.test(s))throw Error('지원하지 않는 XML 선언입니다.');const x=new DOMParser().parseFromString(s,'application/xml');if(els(x,'parsererror').length)throw Error('엑셀 XML 형식 오류');return x;};
    const target=(base,rel)=>{if(rel.getAttribute('TargetMode')==='External')throw Error('외부 연결 시트는 불러올 수 없습니다.');const t=rel.getAttribute('Target');if(!t||t.includes('\\')||/^[a-z]+:/i.test(t))throw Error('잘못된 엑셀 시트 경로');const parts=(t.startsWith('/')?t.slice(1):base+t).split('/'),out=[];for(const p of parts){if(p==='..'){if(!out.length)throw Error('잘못된 시트 경로');out.pop();}else if(p&&p!=='.')out.push(p);}return out.join('/');};
    const rootRels=els(xml(files['_rels/.rels']),'Relationship'),main=rootRels.find(r=>r.getAttribute('Type')?.endsWith('/officeDocument'));if(!main)throw Error('Excel 통합 문서 관계가 없습니다.');
    const mainPath=target('',main),base=mainPath.slice(0,mainPath.lastIndexOf('/')+1),rels=els(xml(files[base+'_rels/'+mainPath.slice(base.length)+'.rels']),'Relationship');
    const sharedRel=rels.find(r=>r.getAttribute('Type')?.endsWith('/sharedStrings'));
    const texts=x=>untext(els(x,'t').filter(t=>!t.parentElement?.closest('rPh')).map(t=>t.textContent).join(''));
    const shared=sharedRel?els(xml(files[target(base,sharedRel)]),'si').map(texts):[];
    const book=Object.create(null);let cellCount=0;
    for(const sh of els(xml(files[mainPath]),'sheet')){
      const name=sh.getAttribute('name'),id=sh.getAttributeNS(REL,'id')||sh.getAttributeNS('http://purl.oclc.org/ooxml/officeDocument/relationships','id'),rel=rels.find(r=>r.getAttribute('Id')===id);
      if(!rel||!rel.getAttribute('Type')?.endsWith('/worksheet'))throw Error('지원하지 않는 엑셀 시트: '+name);if(Object.hasOwn(book,name))throw Error('중복 시트: '+name);
      const rows=[],occupied=new Set();for(const c of els(xml(files[target(base,rel)]),'c')){
        if(++cellCount>200000)throw Error('엑셀 셀 수가 200,000개를 초과합니다.');
        const ref=c.getAttribute('r'),m=/^([A-Z]+)([1-9]\d*)$/.exec(ref||'');if(!m)throw Error(name+': 셀 주소가 없습니다.');
        const hasFormula=els(c,'f').length>0,t=c.getAttribute('t'),v=els(c,'v')[0]?.textContent??'';
        if(!hasFormula&&!v&&!(t==='inlineStr'&&texts(c)))continue;
        let col=0;for(const ch of m[1])col=col*26+ch.charCodeAt(0)-64;const row=Number(m[2]);
        if(col>20||row>20010)throw Error(name+'!'+ref+': 입력 양식 범위를 초과했습니다.');if(occupied.has(ref))throw Error(name+'!'+ref+': 중복 셀');occupied.add(ref);
        if(hasFormula)throw Error(name+'!'+ref+': 수식은 계산하지 않습니다. 복사 → 값 붙여넣기 후 불러오세요.');
        let value;
        if(t==='inlineStr')value=texts(c);
        else if(t==='s'){const index=Number(v);if(!/^\d+$/.test(v)||index>=shared.length)throw Error(name+'!'+ref+': 문자열 참조 오류');value=shared[index];}
        else if(!t||t==='n'){value=v===''?'':Number(v);if(value!==''&&!Number.isFinite(value))throw Error(name+'!'+ref+': 숫자 오류');}
        else if(t==='str')value=untext(v);
        else throw Error(name+'!'+ref+': 날짜·논리값·오류 셀 대신 확정 숫자 또는 문자를 입력하세요.');
        if(String(value).length>32767)throw Error(name+'!'+ref+': 셀 내용이 너무 깁니다.');
        rows[row-1]??=[];rows[row-1][col-1]=value;
      }book[name]=Array.from({length:rows.length},(_,i)=>rows[i]||[]);
    }return book;
  }
  return {write,read,zip,unzip,crc32,colName,MAX_FILE};
});

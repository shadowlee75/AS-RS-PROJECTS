from pathlib import Path
from pypdf import PdfReader
import json
root=Path(__file__).resolve().parents[2]
reader=PdfReader(root/'LoopRGV_사용매뉴얼.pdf')
results=[]
for i,page in enumerate(reader.pages):
    spans=[]
    def visitor(text,cm,tm,font,size):
        if text.strip():spans.append({'text':text.strip(),'x':round(cm[4]+tm[4],2),'y':round(cm[5]+tm[5],2),'size':size})
    content=page.extract_text(visitor_text=visitor)
    results.append({'page':i+1,'header': 'LOOP RGV / 사용자 매뉴얼' in content,'size':[float(x) for x in page.mediabox], 'spans':spans})
(root/'03_rgv_loop/qa/manual-20260915/manual-pdf-qa.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
for p in results:print(p['page'],p['header'],[(s['text'][:25],s['y']) for s in p['spans'][:8]])

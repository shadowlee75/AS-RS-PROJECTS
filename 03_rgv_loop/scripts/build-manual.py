"""Build an illustrated PDF and standalone HTML from the maintained manual."""
from pathlib import Path
import base64, html, json, re, os
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer,
    PageBreak, CondPageBreak, Table, TableStyle, Image, KeepTogether)
from reportlab.platypus.tableofcontents import TableOfContents
from PIL import Image as PILImage
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'LoopRGV_사용매뉴얼.md'
QA = ROOT / '03_rgv_loop/qa/manual-20260915'
PDF = ROOT / 'LoopRGV_사용매뉴얼.pdf'
HTML = ROOT / 'LoopRGV_사용매뉴얼.html'
FONTDIR = Path(os.environ.get('WINDIR', 'C:/Windows')) / 'Fonts'
pdfmetrics.registerFont(TTFont('Malgun', str(FONTDIR / 'malgun.ttf')))
pdfmetrics.registerFont(TTFont('MalgunBold', str(FONTDIR / 'malgunbd.ttf')))
pdfmetrics.registerFontFamily('Malgun', normal='Malgun', bold='MalgunBold', italic='Malgun', boldItalic='MalgunBold')
INK, TEAL, MUTED, LINE = map(colors.HexColor, ['#183c4a','#148d86','#657e8b','#dbe5ea'])
WIDTH, HEIGHT = A4
CONTENT = WIDTH - 38*mm
styles = {}
def style(name, **kw):
    defaults = dict(fontName='Malgun',fontSize=9.4,leading=15.2,textColor=INK,wordWrap='CJK',spaceAfter=6,allowWidows=0,allowOrphans=0)
    defaults.update(kw)
    styles[name] = ParagraphStyle(name, **defaults)
    return styles[name]
style('body')
style('chapter',fontName='MalgunBold',fontSize=17,leading=24,spaceBefore=15,spaceAfter=12,keepWithNext=True)
style('section',fontName='MalgunBold',fontSize=11.4,leading=17,spaceBefore=11,spaceAfter=7,keepWithNext=True)
style('cell',fontSize=8.4,leading=12.5,spaceAfter=0)
style('th',fontName='MalgunBold',fontSize=8.4,leading=12.5,textColor=colors.white,spaceAfter=0)
style('caption',fontSize=8,leading=11.5,textColor=MUTED,spaceBefore=5,spaceAfter=13)
style('bullet',leftIndent=10,firstLineIndent=-8,spaceAfter=5)
style('code',fontSize=8.6,leading=13.7,backColor=colors.HexColor('#f1f6f8'),borderPadding=9,spaceBefore=8,spaceAfter=12)
style('toc',fontSize=10,leading=22,leftIndent=0,firstLineIndent=0,spaceBefore=2)
style('cover-title',fontName='MalgunBold',fontSize=35,leading=46,spaceAfter=12)
style('cover-sub',fontSize=12,leading=20,textColor=MUTED)
style('small',fontSize=8.5,leading=14,textColor=MUTED)

text = SOURCE.read_text(encoding='utf-8').replace('\r\n','\n').replace('\u2013','-').replace('\u2014','-')
def inline_pdf(s):
    s=re.sub(r'\[([^\]]+)\]\(([^)]+)\)',r'\1',s)
    s=html.escape(s,quote=False)
    s=re.sub(r'\*\*(.+?)\*\*',r'<b>\1</b>',s)
    s=re.sub(r'`([^`]+)`',r'<font color="#087e78">\1</font>',s)
    return s
def inline_html(s):
    s=html.escape(s,quote=False)
    s=re.sub(r'\[([^\]]+)\]\(([^)]+)\)',r'<a href="\2">\1</a>',s)
    s=re.sub(r'\*\*(.+?)\*\*',r'<strong>\1</strong>',s)
    return re.sub(r'`([^`]+)`',r'<code>\1</code>',s)
def parse(md):
    lines=md.splitlines();out=[];i=0
    while i<len(lines):
        line=lines[i].strip()
        if not line:i+=1;continue
        if line.startswith(('~~~','```')):
            marker=line[:3];buf=[];i+=1
            while i<len(lines) and not lines[i].strip().startswith(marker):buf.append(lines[i]);i+=1
            out.append(('code','\n'.join(buf)));i+=1;continue
        if line.startswith('|'):
            rows=[]
            while i<len(lines) and lines[i].strip().startswith('|'):
                cells=[c.strip() for c in lines[i].strip().strip('|').split('|')]
                if not all(re.fullmatch(r':?-+:?',c) for c in cells):rows.append(cells)
                i+=1
            out.append(('table',rows));continue
        img=re.fullmatch(r'!\[([^\]]*)\]\(([^)]+)\)',line)
        if img:out.append(('image',(img[1],img[2])));i+=1;continue
        heading=re.match(r'^(#{1,3})\s+(.+)',line)
        if heading:out.append(('h'+str(len(heading[1])),heading[2]));i+=1;continue
        bullet=re.match(r'^(\d+\.|-)\s+(.+)',line)
        if bullet:out.append(('list',(bullet[1],bullet[2])));i+=1;continue
        buf=[line];i+=1
        while i<len(lines) and lines[i].strip() and not re.match(r'^(#|\||!\[|~~~|```|\d+\.\s|-\s)',lines[i].strip()):buf.append(lines[i].strip());i+=1
        out.append(('p',' '.join(buf)))
    return out
blocks=parse(text)

class ManualDoc(BaseDocTemplate):
    def __init__(self,filename):
        super().__init__(str(filename),pagesize=A4,leftMargin=19*mm,rightMargin=19*mm,topMargin=20*mm,bottomMargin=19*mm,title='LOOP RGV 사용 매뉴얼',author='Flow Studio',subject='프로그램 v0.2.2 / 매뉴얼 개정 1.4')
        frame=Frame(self.leftMargin,self.bottomMargin,CONTENT,HEIGHT-self.topMargin-self.bottomMargin,id='body',leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0)
        self.addPageTemplates(PageTemplate(id='manual',frames=frame,onPage=self.decor))
    def decor(self,c,doc):
        c.saveState()
        if doc.page>1:
            c.setStrokeColor(LINE);c.setLineWidth(.5);c.line(19*mm,HEIGHT-14*mm,WIDTH-19*mm,HEIGHT-14*mm)
            c.setFont('MalgunBold',8);c.setFillColor(TEAL);c.drawString(19*mm,HEIGHT-11*mm,'LOOP RGV / 사용자 매뉴얼')
            c.setFont('Malgun',7.5);c.setFillColor(MUTED);c.drawRightString(WIDTH-19*mm,HEIGHT-11*mm,'프로그램 v0.2.2 · 문서 개정 1.4')
        c.setStrokeColor(LINE);c.line(19*mm,14*mm,WIDTH-19*mm,14*mm)
        c.setFont('Malgun',7.2);c.setFillColor(MUTED);c.drawString(19*mm,9*mm,'MAN-LOOP-RGV-001  |  2026-09-15')
        c.drawRightString(WIDTH-19*mm,9*mm,str(doc.page).zfill(2));c.restoreState()
    def afterFlowable(self,f):
        if isinstance(f,Paragraph) and getattr(f,'chapterKey',None):
            self.canv.bookmarkPage(f.chapterKey)
            self.canv.addOutlineEntry(f.getPlainText(),f.chapterKey,0,False)
            self.notify('TOCEntry',(0,f.getPlainText(),self.page,f.chapterKey))

def picture(path,caption=None,width=CONTENT,max_height=240):
    p=ROOT/path
    if not p.exists():raise FileNotFoundError(p)
    with PILImage.open(p) as im:w,h=im.size
    scale=min(width/w,max_height/h);img=Image(str(p),width=w*scale,height=h*scale);img.hAlign='CENTER'
    flows=[img]
    if caption:flows.append(Paragraph(inline_pdf(caption),styles['caption']))
    return KeepTogether(flows)

story=[Spacer(1,17*mm),Paragraph('FLOW STUDIO / 03',styles['cover-sub']),Spacer(1,8*mm),Paragraph('LOOP RGV<br/>사용 매뉴얼',styles['cover-title']),Paragraph('순환 레일 반송 시스템의 물동량 계산과<br/>다차량 3D 시뮬레이션',styles['cover-sub']),Spacer(1,12*mm),picture('03_rgv_loop/qa/manual-20260915/simulation.png',max_height=245),Spacer(1,10*mm)]
cover_info=Table([[Paragraph('<b>입력</b><br/>배치 · 차량 · OD 수요',styles['body']),Paragraph('<b>검토</b><br/>물동량 · 버퍼 · 대기',styles['body']),Paragraph('<b>비교</b><br/>3D · 대수별 실험',styles['body'])]],colWidths=[CONTENT/3]*3)
cover_info.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),colors.HexColor('#edf5f6')),('BOX',(0,0),(-1,-1),.4,LINE),('LEFTPADDING',(0,0),(-1,-1),12),('TOPPADDING',(0,0),(-1,-1),12),('BOTTOMPADDING',(0,0),(-1,-1),7)]))
story += [cover_info,Spacer(1,9*mm),Paragraph('프로그램 v0.2.2 · 매뉴얼 개정 1.4<br/>2026-09-15 / 현재 배포 화면 기준<br/>Edge·Chrome에서 실행하는 오프라인 HTML 프로그램',styles['small']),PageBreak()]
toc=TableOfContents();toc.levelStyles=[styles['toc']]
story += [Paragraph('이 매뉴얼의 구성',styles['chapter']),Paragraph('처음 사용하는 경우 1~5장을 따라 입력한 뒤 7~9장에서 운전 결과를 확인하세요. 현장 설계 검토는 13~14장의 예시와 체크리스트를 활용하세요.',styles['body']),Spacer(1,8),toc,Spacer(1,14),Paragraph('<b>먼저 기억할 기준</b><br/>측정 0.5시간 + 준비운전 3분 = 전체 운전 33분<br/>수요는 차량 운행 횟수가 아닌 화물 개수/h<br/>최종 목적지 완료와 외부 출하는 각각 확인<br/>입력을 바꾸면 계산 및 설정 적용 후 다시 실행',styles['code']),PageBreak()]
chapter_count=0;started=False
html_parts=[];toc_links=[]
for kind,data in blocks:
    if kind=='h1':continue
    if kind=='h2':
        started=True;chapter_count+=1;key='chapter-'+str(chapter_count);toc_links.append((key,data))
        if chapter_count>1:story.append(CondPageBreak(300 if chapter_count in (9,11) else 150))
        h=Paragraph(inline_pdf(data),styles['chapter']);h.chapterKey=key;story.append(h)
        html_parts.append('<h2 id="'+key+'">'+inline_html(data)+'</h2>');continue
    if not started:continue
    if kind=='h3':story.append(Paragraph(inline_pdf(data),styles['section']));html_parts.append('<h3>'+inline_html(data)+'</h3>')
    elif kind=='p':story.append(Paragraph(inline_pdf(data),styles['body']));html_parts.append('<p>'+inline_html(data)+'</p>')
    elif kind=='list':
        marker,body=data;mark='•' if marker=='-' else marker
        story.append(Paragraph(html.escape(mark)+' '+inline_pdf(body),styles['bullet']))
        html_parts.append('<p class="list"><span>'+mark+'</span>'+inline_html(body)+'</p>')
    elif kind=='code':
        story.append(Paragraph('<br/>'.join(html.escape(x,quote=False).replace(' ','&#160;') for x in data.splitlines()),styles['code']))
        html_parts.append('<pre>'+html.escape(data)+'</pre>')
    elif kind=='table':
        count=max(map(len,data));rows=[[Paragraph(inline_pdf(x),styles['th' if i==0 else 'cell']) for x in row+['']*(count-len(row))] for i,row in enumerate(data)]
        widths=[CONTENT/count]*count
        if count==2:widths=[CONTENT*.3,CONTENT*.7]
        if count==3:widths=[CONTENT*.24,CONTENT*.48,CONTENT*.28]
        if count==4:widths=[CONTENT*.23,CONTENT*.13,CONTENT*.21,CONTENT*.43]
        t=Table(rows,colWidths=widths,repeatRows=1,hAlign='LEFT')
        t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),INK),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#f2f6f8')]),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),('LINEBELOW',(0,0),(-1,0),.6,INK),('LINEBELOW',(0,1),(-1,-1),.3,LINE)]))
        if data[0][0]=='조작':t.setStyle(TableStyle([('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]))
        story.extend([t,Spacer(1,10)])
        html_parts.append('<div class="table-wrap"><table>'+''.join('<tr>'+''.join('<'+('th' if i==0 else 'td')+'>'+inline_html(x)+'</'+('th' if i==0 else 'td')+'>' for x in row)+'</tr>' for i,row in enumerate(data))+'</table></div>')
    elif kind=='image':
        caption,rel=data;story.append(picture(rel,caption,max_height=300 if 'overview' in rel else 230))
        encoded=base64.b64encode((ROOT/rel).read_bytes()).decode('ascii')
        html_parts.append('<figure><a href="data:image/png;base64,'+encoded+'" target="_blank"><img src="data:image/png;base64,'+encoded+'" alt="'+html.escape(caption,quote=True)+'"></a><figcaption>'+html.escape(caption)+'</figcaption></figure>')

doc=ManualDoc(PDF);doc.multiBuild(story)
hero=base64.b64encode((QA/'simulation.png').read_bytes()).decode('ascii')
css='''*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#eef3f5;color:#203d49;font:15px/1.85 "Malgun Gothic",sans-serif}aside{position:fixed;inset:0 auto 0 0;width:255px;background:#14313f;color:#e8f5f5;padding:28px 20px;overflow:auto}aside b{font-size:18px;letter-spacing:1px}aside small{display:block;color:#90b5c2;margin:5px 0 23px}aside a{display:block;color:#aecad4;text-decoration:none;font-size:12px;padding:8px 0;border-bottom:1px solid #2a4652}aside a:hover{color:white}main{margin-left:255px;max-width:1230px;padding:35px 55px 80px}header{border-bottom:1px solid #d1dfe5;padding-bottom:24px;margin-bottom:32px}.eyebrow{color:#138d86;font-size:12px;font-weight:bold;letter-spacing:2px}h1{font-size:39px;line-height:1.4;margin:14px 0}header p{color:#66838f;margin:4px 0}.buttons{display:flex;gap:9px;margin-top:20px}.buttons a,.buttons button{font:13px Malgun Gothic,sans-serif;cursor:pointer;background:#168d86;border:0;border-radius:6px;color:white;padding:10px 16px;text-decoration:none}article{overflow-wrap:anywhere;background:white;border:1px solid #dce5e9;padding:36px 42px;border-radius:10px}h2{scroll-margin-top:20px;font-size:23px;color:#143b4b;margin:52px 0 19px;border-top:3px solid #158e88;padding-top:21px}h2:first-child{margin-top:0}h3{font-size:17px;margin-top:27px}p{margin:11px 0}strong{color:#123e50}a{color:#148a86}table{border-collapse:collapse;width:100%;font-size:13px;line-height:1.65}th,td{text-align:left;vertical-align:top;padding:11px 14px;border-bottom:1px solid #dce7eb}th{color:white;background:#203f4d}tr:nth-child(odd) td{background:#f2f7f8}.table-wrap{overflow:auto;margin:18px 0 23px}.list{padding-left:24px;position:relative;margin:7px 0}.list span{position:absolute;left:0;color:#148b85}pre{white-space:pre-wrap;padding:19px;background:#edf5f7;border-left:3px solid #13978b;font:13px/1.8 Consolas,Malgun Gothic,monospace}code{background:#edf5f7;padding:2px 4px;color:#087a75}figure{margin:23px 0 29px}figure img{max-width:100%;height:auto;border:1px solid #d9e4e9;border-radius:7px}figcaption{font-size:12px;color:#77909c;margin-top:6px}.hero{width:100%;border-radius:10px;margin:24px 0 0}footer{color:#7b919b;font-size:12px;margin-top:25px}@media(max-width:900px){aside{display:none}main{margin:0;padding:22px 14px}article{padding:20px}h1{font-size:30px}.buttons{flex-wrap:wrap}}@media print{aside,.buttons{display:none}main{margin:0;padding:0;max-width:none}article{border:0;padding:0}body{font-size:10pt;background:white}h2,h3{break-after:avoid}table,figure{break-inside:avoid}h2{font-size:17pt;margin-top:24px}}'''
html_doc='<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LOOP RGV 사용 매뉴얼</title><style>'+css+'</style></head><body><aside><b>LOOP STUDIO</b><small>사용 매뉴얼 / 개정 1.4</small>'+''.join('<a href="#'+k+'">'+html.escape(t)+'</a>' for k,t in toc_links)+'</aside><main><header><div class="eyebrow">FLOW STUDIO / USER MANUAL</div><h1>LOOP RGV 사용 매뉴얼</h1><p>프로그램 v0.2.2 · 문서 개정 1.4 · 2026-09-15</p><p>루프·차량·OD 입력부터 3D 시뮬레이션과 대수별 실험까지</p><div class="buttons"><a href="LoopRGV_실행.html">프로그램 실행</a><a href="LoopRGV_사용매뉴얼.pdf">인쇄용 PDF</a><button onclick="window.print()">이 매뉴얼 인쇄</button></div><img class="hero" src="data:image/png;base64,'+hero+'" alt="Loop RGV 전체 3D 화면"></header><article>'+''.join(html_parts)+'</article><footer>MAN-LOOP-RGV-001 · 현재 실행 파일의 화면과 계산 기준을 확인하여 작성했습니다.</footer></main></body></html>'
html_doc=html_doc.replace('</style>', 'dialog{border:0;border-radius:10px;padding:16px;max-width:96vw;max-height:96vh}dialog::backdrop{background:#082431bb}dialog img{display:block;max-width:90vw;height:auto}dialog button{float:right;border:0;padding:8px 18px;margin-bottom:12px;cursor:pointer}figure a{cursor:zoom-in}</style>')
html_doc=html_doc.replace('</body>', '<dialog id="imageViewer"><button onclick="this.parentElement.close()">닫기 ×</button><img alt="확대한 매뉴얼 화면"></dialog><script>const viewer=document.getElementById("imageViewer");document.querySelectorAll("figure a").forEach(a=>a.addEventListener("click",e=>{e.preventDefault();viewer.querySelector("img").src=a.querySelector("img").src;viewer.showModal();}));viewer.addEventListener("click",e=>{if(e.target===viewer)viewer.close();});</script></body>')
HTML.write_text(html_doc,encoding='utf-8')
reader=PdfReader(str(PDF));page_text=[p.extract_text() or '' for p in reader.pages]
check={'pdf':PDF.name,'html':HTML.name,'revision':'1.4','programVersion':'0.2.2','pages':len(reader.pages),'chapters':chapter_count,'pageCharacters':[len(s) for s in page_text],'images':sum(k=='image' for k,_ in blocks),'allChaptersPresent':all(t in '\n'.join(page_text) for _,t in toc_links),'pdfBytes':PDF.stat().st_size,'htmlBytes':HTML.stat().st_size}
(QA/'manual-build.json').write_text(json.dumps(check,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(check,ensure_ascii=False,indent=2))

from pathlib import Path
import sys
from PIL import Image, ImageOps, ImageDraw
folder=Path(sys.argv[1]) if len(sys.argv)>1 else Path(__file__).resolve().parents[1]/'qa/manual-20260915/pages'
pages=sorted(folder.glob((sys.argv[2] if len(sys.argv)>2 else 'page')+'-*.png'))
for batch in range(0,len(pages),4):
    sheet=Image.new('RGB',(1000,1470),'#dfe7eb')
    draw=ImageDraw.Draw(sheet)
    for index,p in enumerate(pages[batch:batch+4]):
        im=Image.open(p).convert('RGB');im.thumbnail((470,685))
        x=15+(index%2)*500;y=28+(index//2)*735
        draw.text((x,y-17),p.stem,fill='#173e4b')
        sheet.paste(im,(x,y))
    sheet.save(folder/f'contact-{batch//4+1}.png')
print(f'{len(pages)} pages rendered into {(len(pages)+3)//4} contact sheets')

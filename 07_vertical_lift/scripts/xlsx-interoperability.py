"""Independently inspect generated OOXML and create compressed/formula fixtures."""
from pathlib import Path
import zipfile
import xml.etree.ElementTree as ET
import json

qa = Path(__file__).resolve().parents[1] / 'qa'
source = qa / 'test-input.xlsx'
with zipfile.ZipFile(source) as archive:
    assert archive.testzip() is None
    entries = {name: archive.read(name) for name in archive.namelist()}
for name, value in entries.items():
    if name.endswith('.xml') or name.endswith('.rels'):
        ET.fromstring(value)
ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
book = ET.fromstring(entries['xl/workbook.xml'])
names = [s.attrib['name'] for s in book.findall('.//s:sheet', ns)]
assert names == ['안내', '기본조건', '층스테이션', '운반물', 'OD물동량', '시간대비율', '계획정지', '작업이력']
sheet = ET.fromstring(entries['xl/worksheets/sheet2.xml'])
values = {}
rows = {}
for row in sheet.findall('.//s:row', ns):
    cells = row.findall('s:c', ns)
    data = []
    for cell in cells:
        data.append(''.join(t.text or '' for t in cell.findall('.//s:t', ns)) if cell.attrib.get('t') == 'inlineStr' else cell.findtext('s:v', '', ns))
    if len(data) >= 3:
        values[data[0]] = data[2]
        rows[data[0]] = cells
assert float(values['loadedV']) == 60
assert float(values['horizon']) == 60
assert float(values['warmup']) == 5
with zipfile.ZipFile(qa / 'compressed-input.xlsx', 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    for name, value in entries.items():
        archive.writestr(name, value)
formula_cell = rows['loadedV'][2]
formula = ET.SubElement(formula_cell, '{' + ns['s'] + '}f')
formula.text = '30+30'
entries['xl/worksheets/sheet2.xml'] = ET.tostring(sheet, encoding='utf-8', xml_declaration=True)
with zipfile.ZipFile(qa / 'formula-input.xlsx', 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    for name, value in entries.items():
        archive.writestr(name, value)
(qa / 'xlsx-structure-results.json').write_text(json.dumps({'passed': True, 'checks': ['ZIP CRC', 'All XML well-formed', 'Eight sheet names', 'Speed in m/min', 'Times in min'], 'sheets': names}, ensure_ascii=False, indent=2), encoding='utf-8')
print('OOXML structure verified; compressed and formula fixtures created.')

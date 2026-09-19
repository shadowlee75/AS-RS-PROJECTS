$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$qaPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../qa/excel-20260915'))
$inputPath = Join-Path $qaPath '현재조건_원본.xlsx'
$outputPath = Join-Path $qaPath 'Excel_수정후.xlsx'
$excelApp = $null
$excelBook = $null
function Set-CellValue($sheet, [int]$rowNumber, [int]$columnNumber, $value) { $cell = $sheet.Cells.Item($rowNumber,$columnNumber); if ($value -is [string]) { $cell.Value2 = [string]$value } else { $cell.Value2 = [double]$value } }
function Set-RowValues($sheet, [int]$rowNumber, $values) { for ($col=0; $col -lt $values.Count; $col++) { Set-CellValue $sheet $rowNumber ($col+1) $values[$col] } }
try {
    # A private, invisible Excel instance; never attach to the user's open workbook.
    $excelApp = New-Object -ComObject Excel.Application
    $excelApp.Visible = $false
    $excelApp.DisplayAlerts = $false
    $excelApp.AutomationSecurity = 3
    $excelBook = $excelApp.Workbooks.Open($inputPath, 0, $false)
    if ($excelBook.Worksheets.Count -ne 8) { throw 'Eight worksheets were expected.' }
    $basicSheet = $excelBook.Worksheets.Item('기본조건')
    $changes = @{ name='Excel 수정 검증'; vehicles=10.0; distanceUnit='mm'; speedUnit='m/s'; handlingMode='상세 · 순수 이재+지연'; unit='BOX'; peak=1.3; targetUtil=0.85 }
    for ($row=2; $row -le $basicSheet.UsedRange.Rows.Count; $row++) {
        $field = [string]$basicSheet.Cells.Item($row,1).Value2
        if ($changes.ContainsKey($field)) { Set-CellValue $basicSheet $row 3 $changes[$field] }
    }
    $stationSheet = $excelBook.Worksheets.Item('설비스테이션')
    $stationSheet.Cells.Item(2,3).Value2 = 12.5
    $stationSheet.Cells.Item(2,4).Value2 = 8.0
    $stationSheet.Cells.Item(2,5).Value2 = 9.0
    $stationSheet.Cells.Item(2,6).Value2 = 12.0
    $stationSheet.Cells.Item(2,7).Value2 = 2.0
    $excelBook.Worksheets.Item('OD물동량').Cells.Item(2,4).Value2 = 45.0
    $periodSheet = $excelBook.Worksheets.Item('시간대비율')
    Set-RowValues $periodSheet 2 @(0.0,15.0,1.25)
    Set-RowValues $periodSheet 3 @(15.0,33.0,0.75)
    $periodSheet.Range('C2:C3').NumberFormat = '0.00%'
    Set-RowValues ($excelBook.Worksheets.Item('제한속도')) 2 @(5.0,9.0,42.0)
    Set-RowValues ($excelBook.Worksheets.Item('작업이력')) 2 @(10.0,'P1','D1',1.0)
    $experimentSheet = $excelBook.Worksheets.Item('실험조건')
    $experimentSheet.Cells.Item(2,3).Value2 = 6.0
    $experimentSheet.Cells.Item(3,3).Value2 = 10.0
    $experimentSheet.Cells.Item(4,3).Value2 = 2.0
    $experimentSheet.Cells.Item(5,3).Value2 = 5.0
    $excelBook.SaveAs($outputPath, 51)
    $sheetSummary = @()
    foreach ($sheetItem in $excelBook.Worksheets) {
        $sheetSummary += @{ name=$sheetItem.Name; rows=$sheetItem.UsedRange.Rows.Count; columns=$sheetItem.UsedRange.Columns.Count }
        $sheetItem.PageSetup.Zoom = $false
        $sheetItem.PageSetup.FitToPagesWide = 1
        $sheetItem.PageSetup.FitToPagesTall = $false
        $sheetItem.PageSetup.Orientation = 2
        $sheetItem.PageSetup.PrintArea = $sheetItem.UsedRange.Address()
    }
    $excelBook.ExportAsFixedFormat(0, (Join-Path $qaPath 'Excel_시트검토.pdf'))
    @{ excelVersion=$excelApp.Version; openedWithoutException=$true; savedPath=$outputPath; sheets=$sheetSummary } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $qaPath 'excel-interop.json') -Encoding UTF8
    Write-Output 'Microsoft Excel opened, edited and saved all 8 sheets. PDF preview exported.'
} finally {
    if ($excelBook) { $excelBook.Close($false); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($excelBook) }
    if ($excelApp) { $excelApp.Quit(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($excelApp) }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}

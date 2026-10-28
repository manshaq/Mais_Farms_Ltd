export type CsvCellValue = string | number | boolean | null | undefined;

function escapeCsvCell(value: CsvCellValue): string {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function formatCsvContent(headers: string[], rows: CsvCellValue[][]): string {
  const headerLine = headers.map(escapeCsvCell).join(',');
  const rowLines = rows.map((row) => row.map(escapeCsvCell).join(','));
  return [headerLine, ...rowLines].join('\r\n');
}

export function downloadCsvFile(
  filenamePrefix: string,
  headers: string[],
  rows: CsvCellValue[][]
): void {
  const csvContent = '\uFEFF' + formatCsvContent(headers, rows);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const dateStamp = new Date().toISOString().slice(0, 10);
  const cleanName = filenamePrefix.endsWith('.csv')
    ? filenamePrefix
    : `${filenamePrefix}_${dateStamp}.csv`;
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', cleanName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeXml(val: CsvCellValue): string {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export type ExcelMetadataOption = string[] | { subtitle?: string };

function normalizeExcelMetadata(meta?: ExcelMetadataOption): string[] {
  if (!meta) return [];
  if (Array.isArray(meta)) return meta.filter(Boolean);
  if (typeof meta === 'object' && meta.subtitle) return [meta.subtitle];
  return [];
}

export function formatExcelXml(
  sheetTitle: string,
  headers: string[],
  rows: CsvCellValue[][],
  metadataLines: ExcelMetadataOption = []
): string {
  const normalizedMeta = normalizeExcelMetadata(metadataLines);
  const safeSheetName =
    escapeXml(sheetTitle.replace(/[\\/?*[\]:]/g, ' ').slice(0, 28).trim()) || 'MAIS Report';

  const metaRowsXml = normalizedMeta
    .map(
      (line) =>
        `<Row><Cell ss:StyleID="Meta"><Data ss:Type="String">${escapeXml(line)}</Data></Cell></Row>`
    )
    .join('\n');

  const headerCellsXml = headers
    .map(
      (h) =>
        `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`
    )
    .join('');

  const dataRowsXml = rows
    .map((row) => {
      const cells = row
        .map((cell) => {
          if (typeof cell === 'number' && Number.isFinite(cell)) {
            return `<Cell ss:StyleID="Num"><Data ss:Type="Number">${cell}</Data></Cell>`;
          }
          return `<Cell ss:StyleID="Body"><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`;
        })
        .join('');
      return `<Row>${cells}</Row>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#0F172A"/>
  </Style>
  <Style ss:ID="Meta">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#14532D"/>
  </Style>
  <Style ss:ID="Header">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#14532D" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="Body">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#0F172A"/>
  </Style>
  <Style ss:ID="Num">
   <Font ss:FontName="Consolas" ss:Size="10" ss:Color="#0F172A"/>
   <NumberFormat ss:Format="#,##0.##"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="${safeSheetName}">
  <Table>
   ${metaRowsXml}
   ${normalizedMeta.length > 0 ? '<Row></Row>' : ''}
   <Row>${headerCellsXml}</Row>
   ${dataRowsXml}
  </Table>
 </Worksheet>
</Workbook>`;
}

export function downloadExcelFile(
  filenamePrefix: string,
  sheetTitle: string,
  headers: string[],
  rows: CsvCellValue[][],
  metadataLines: ExcelMetadataOption = []
): void {
  const xml = formatExcelXml(sheetTitle, headers, rows, metadataLines);
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const dateStamp = new Date().toISOString().slice(0, 10);
  const cleanName = filenamePrefix.endsWith('.xls')
    ? filenamePrefix
    : `${filenamePrefix}_${dateStamp}.xls`;
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', cleanName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}


import { format } from 'date-fns';
import * as XLSX from 'xlsx';

const pdfSafe = (value) => String(value ?? '').replace(/₹/g, 'Rs. ');
const humanizeKey = (key) => String(key)
  .replace(/_/g, ' ')
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/^./, (m) => m.toUpperCase());

export const currency = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
export const litres = (value) => `${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })} L`;
export const today = () => format(new Date(), 'yyyy-MM-dd');

const formatEntryDateLabel = (value) => {
  const parsed = value ? new Date(`${value}T00:00:00`) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? format(parsed, 'dd-MMM-yyyy') : value || '—';
};

const groupRowsByDate = (rows = []) => {
  const groups = new Map();
  rows.forEach((row) => {
    const entryDate = row.entryDate || 'Unknown date';
    if (!groups.has(entryDate)) groups.set(entryDate, []);
    groups.get(entryDate).push(row);
  });
  return Array.from(groups.entries()).map(([entryDate, groupedRows]) => ({ entryDate, rows: groupedRows }));
};

export async function exportStyledExcel(name, { title, summaryRows = [], dailyRows = [], buyerRows = [], expenseRows = [], referenceRows = [] }) {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'OpenClaw';
  workbook.created = new Date();
  workbook.subject = 'Milk Business Report';
  workbook.company = 'Milk Business Pro';

  const makeSheet = (sheetName, heading, rows) => {
    const sheet = workbook.addWorksheet(sheetName);
    sheet.properties.defaultRowHeight = 22;
    sheet.addRow([heading]);
    sheet.mergeCells(1, 1, 1, Math.max(1, Object.keys(rows[0] || { A: '' }).length));
    const titleCell = sheet.getCell('A1');
    titleCell.font = { bold: true, size: 16, color: { argb: 'FF0F172A' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
    sheet.getRow(1).height = 26;
    sheet.addRow([]);
    if (!rows.length) {
      sheet.addRow(['No data']);
      return sheet;
    }
    const headers = Object.keys(rows[0]);
    const headerRow = sheet.addRow(headers.map(humanizeKey));
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
    });
    rows.forEach((row) => {
      const rowValues = headers.map((header) => row[header]);
      const addedRow = sheet.addRow(rowValues);
      addedRow.eachCell((cell, colNumber) => {
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
        if (typeof rowValues[colNumber - 1] === 'number') cell.numFmt = '#,##0.00';
      });
      if (addedRow.number % 2 === 0) {
        addedRow.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        });
      }
    });
    sheet.columns.forEach((column) => {
      let maxLength = 14;
      column.eachCell?.({ includeEmpty: true }, (cell) => {
        const len = String(cell.value || '').length;
        maxLength = Math.min(Math.max(maxLength, len + 2), 28);
      });
      column.width = maxLength;
    });
    sheet.views = [{ state: 'frozen', ySplit: 3 }];
    return sheet;
  };

  makeSheet('Summary', title, summaryRows);
  makeSheet('Daily Entries', 'Daily Entries', dailyRows);
  makeSheet('Buyer Summary', 'Buyer Summary', buyerRows);
  makeSheet('Expense Summary', 'Expense Summary', expenseRows);

  if (referenceRows.length) {
    const registerSheet = makeSheet('Monthly Register', `${title} Register`, referenceRows);
    registerSheet.insertRow(2, [`Structured register • Generated ${format(new Date(), 'dd MMM yyyy')}`]);
    registerSheet.mergeCells(2, 1, 2, registerSheet.columnCount || 1);
    const subTitleCell = registerSheet.getCell('A2');
    subTitleCell.font = { italic: true, size: 10, color: { argb: 'FF334155' } };
    subTitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } };
    subTitleCell.alignment = { vertical: 'middle', horizontal: 'left' };
    registerSheet.getRow(2).height = 20;
    registerSheet.views = [{ state: 'frozen', ySplit: 4 }];

    const headerRow = registerSheet.getRow(4);
    headerRow.eachCell((cell) => {
      const label = String(cell.value || '');
      if (label.includes('Date')) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
      } else if (label.includes('Buyer')) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
      } else if (label.includes('Remaining')) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFB7185' } };
      } else if (label.includes('Expenses') || label.includes('Exp')) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF59E0B' } };
      } else if (label.includes('Income') || label.includes('Rate')) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF22C55E' } };
      } else if (label === 'Profit') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4ADE80' } };
      } else if (label.includes('Note') || label.includes('Use')) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA855F7' } };
      }
    });

    registerSheet.eachRow((row, rowNumber) => {
      if (rowNumber <= 4) return;
      row.eachCell((cell, colNumber) => {
        const header = String(registerSheet.getRow(4).getCell(colNumber).value || '');
        if (typeof cell.value === 'number') cell.numFmt = '#,##0.00';
        if (header.includes('Profit') && Number(cell.value || 0) < 0) {
          cell.font = { color: { argb: 'FFDC2626' }, bold: true };
        }
        if (header.includes('Profit') && Number(cell.value || 0) >= 0) {
          cell.font = { color: { argb: 'FF15803D' }, bold: true };
        }
      });
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${name}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportCsv(name, rows) {
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.writeFile({ SheetNames: ['Data'], Sheets: { Data: ws } }, `${name}.csv`, { bookType: 'csv' });
}

export async function exportStyledPdf({ fileName, title, subtitle, summaryRows = [], dailyRows = [], buyerRows = [], expenseRows = [] }) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF();
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(12, 12, 186, 22, 6, 6, 'F');
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text(pdfSafe(title), 18, 24);
  doc.setFontSize(10);
  doc.setTextColor(203, 213, 225);
  doc.text(pdfSafe(subtitle), 18, 31);

  let y = 42;
  if (summaryRows.length) {
    autoTable(doc, {
      startY: y,
      head: [['Metric', 'Value']],
      body: summaryRows.map((row) => [pdfSafe(row.metric), pdfSafe(row.value)]),
      styles: { fontSize: 10, cellPadding: 3 },
      headStyles: { fillColor: [34, 197, 94] }
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  const sections = [
    ['Daily Rows', dailyRows],
    ['Buyer Summary', buyerRows],
    ['Expense Summary', expenseRows]
  ];

  sections.forEach(([label, rows]) => {
    if (!rows.length) return;
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(pdfSafe(label), 14, y);
    const headers = Object.keys(rows[0]);
    autoTable(doc, {
      startY: y + 4,
      head: [headers.map(humanizeKey)],
      body: rows.map((row) => headers.map((header) => pdfSafe(row[header]))),
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: [15, 23, 42] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 14, right: 14 }
    });
    y = doc.lastAutoTable.finalY + 8;
  });

  doc.save(`${(fileName || title).toLowerCase().replace(/\s+/g, '-')}.pdf`);
}

export async function exportBusinessRegisterExcel(name, { title, table, reportMeta }) {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Milk Business Pro';
  workbook.created = new Date();
  workbook.subject = 'Daily Business Register';
  workbook.company = 'Milk Business Pro';

  const sheet = workbook.addWorksheet('Daily Business Register');
  sheet.properties.defaultRowHeight = 24;

  // Title row
  sheet.addRow([title]);
  sheet.mergeCells(1, 1, 1, getTotalColumns(table));
  const titleCell = sheet.getCell('A1');
  titleCell.font = { bold: true, size: 16, color: { argb: 'FF0F172A' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  sheet.getRow(1).height = 32;

  // Subtitle row
  sheet.addRow([reportMeta?.label || 'Daily Business Register']);
  sheet.mergeCells(2, 1, 2, getTotalColumns(table));
  const subCell = sheet.getCell('A2');
  subCell.font = { italic: true, size: 10, color: { argb: 'FF334155' } };
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } };
  subCell.alignment = { vertical: 'middle', horizontal: 'left' };
  sheet.getRow(2).height = 22;

  // Empty spacer row
  sheet.addRow([]);

  // Header row 1 (row 4)
  const headerRow1Values = ['Date', 'Total Milk (L)'];
  const headerRow2Values = ['', ''];

  table.buyerNames.forEach((buyerName) => {
    headerRow1Values.push(buyerName, '', '');
    headerRow2Values.push('Litres', 'Rate', 'Income');
  });

  headerRow1Values.push('Remaining Milk (L)');
  headerRow2Values.push('');

  table.expenseNames.forEach((expenseName) => {
    headerRow1Values.push(expenseName);
    headerRow2Values.push('');
  });

  headerRow1Values.push('Total Expenses', 'Total Income', 'Profit');
  headerRow2Values.push('', '', '');

  const headerRow1 = sheet.addRow(headerRow1Values);
  const headerRow2 = sheet.addRow(headerRow2Values);

  const colCount = headerRow1Values.length;

  // Merge buyer header cells (rowspan 1 for buyer name, colSpan 3)
  let colIndex = 2; // starts after Total Milk
  table.buyerNames.forEach((_, idx) => {
    const startCol = colIndex + 1;
    const endCol = colIndex + 3;
    sheet.mergeCells(4, startCol, 4, endCol);
    colIndex += 3;
  });

  // Style header rows
  headerRow1.eachCell((cell, colNumber) => {
    cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
    };
  });

  headerRow2.eachCell((cell) => {
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
    };
  });

  // Color-code key header columns
  headerRow1.eachCell((cell, colNumber) => {
    const label = String(cell.value || '');
    if (label === 'Date') {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
    } else if (label.includes('Total Milk')) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    } else if (label.includes('Remaining Milk')) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFB7185' } };
    } else if (label === 'Total Expenses') {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF59E0B' } };
    } else if (label === 'Total Income') {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF22C55E' } };
    } else if (label === 'Profit') {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4ADE80' } };
    }
  });

  // Data rows
  const formatTableDate = (value) => {
    if (!value) return value;
    const parsed = new Date(`${value}T00:00:00`);
    if (isNaN(parsed.getTime())) return value;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = String(parsed.getDate()).padStart(2, '0');
    const month = months[parsed.getMonth()];
    const year = String(parsed.getFullYear()).slice(-2);
    return `${day}-${month}-${year}`;
  };

  const showNumber = (value) => (value === undefined || value === null || value === '' ? 0 : Number(value).toFixed(2));

  table.rows.forEach((row) => {
    const rowValues = [formatTableDate(row.date), showNumber(row.totalMilk)];

    table.buyerNames.forEach((buyerName) => {
      const buyerData = row.buyers[buyerName] || {};
      rowValues.push(showNumber(buyerData.litres), showNumber(buyerData.rate), showNumber(buyerData.income));
    });

    rowValues.push(showNumber(row.remainingMilk));

    table.expenseNames.forEach((expenseName) => {
      rowValues.push(showNumber(row.expenses[expenseName]));
    });

    rowValues.push(showNumber(row.totalExpenses), showNumber(row.totalIncome), showNumber(row.profit));

    const dataRow = sheet.addRow(rowValues);

    // Alternate row shading
    if (dataRow.number % 2 === 0) {
      dataRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      });
    }

    dataRow.eachCell((cell, colNumber) => {
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      if (colNumber > 2) cell.numFmt = '#,##0.00';
    });

    // Profit column color coding
    const profitColIndex = colCount;
    const profitCell = dataRow.getCell(profitColIndex);
    const profitValue = Number(row.profit || 0);
    if (profitValue < 0) {
      profitCell.font = { color: { argb: 'FFDC2626' }, bold: true };
    } else if (profitValue >= 0) {
      profitCell.font = { color: { argb: 'FF15803D' }, bold: true };
    }
  });

  // TOTAL row at bottom (bold, spacious, separated)
  const totals = { totalMilk: 0, remainingMilk: 0, totalExpenses: 0, totalIncome: 0, profit: 0 };
  table.buyerNames.forEach((buyerName) => { totals[buyerName] = { litres: 0, income: 0 }; });
  table.expenseNames.forEach((expenseName) => { totals[expenseName] = 0; });

  table.rows.forEach((row) => {
    totals.totalMilk += Number(row.totalMilk || 0);
    totals.remainingMilk += Number(row.remainingMilk || 0);
    totals.totalExpenses += Number(row.totalExpenses || 0);
    totals.totalIncome += Number(row.totalIncome || 0);
    totals.profit += Number(row.profit || 0);
    table.buyerNames.forEach((buyerName) => {
      const buyerData = row.buyers[buyerName] || {};
      if (!totals[buyerName]) totals[buyerName] = { litres: 0, income: 0 };
      totals[buyerName].litres += Number(buyerData.litres || 0);
      totals[buyerName].income += Number(buyerData.income || 0);
    });
    table.expenseNames.forEach((expenseName) => {
      totals[expenseName] += Number(row.expenses[expenseName] || 0);
    });
  });

  // Buyer rates from totals
  table.buyerNames.forEach((buyerName) => {
    const t = totals[buyerName] || {};
    t.rate = t.litres > 0 ? Number((t.income / t.litres).toFixed(2)) : 0;
  });

  // Blank spacer row
  sheet.addRow([]);

  const totalRowValues = ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
  const spacerRowNum = sheet.lastRow.number;
  sheet.getRow(spacerRowNum).height = 10;

  const totalRowNum = spacerRowNum + 1;
  const totalRow = sheet.addRow([]);
  totalRow.height = 32;

  totalRow.getCell(1).value = 'TOTAL';
  totalRow.getCell(1).font = { bold: true, size: 13, color: { argb: 'FF0F172A' } };
  totalRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
  totalRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };

  totalRow.getCell(2).value = Number(totals.totalMilk.toFixed(2));
  totalRow.getCell(2).font = { bold: true, size: 12, color: { argb: 'FF1D4ED8' } };
  totalRow.getCell(2).numFmt = '#,##0.00';
   totalRow.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };

  let tCol = 2;
  table.buyerNames.forEach((buyerName) => {
    const t = totals[buyerName] || { litres: 0, rate: 0, income: 0 };
    totalRow.getCell(tCol + 1).value = Number(t.litres.toFixed(2));
    totalRow.getCell(tCol + 1).font = { bold: true, size: 11 };
    totalRow.getCell(tCol + 1).numFmt = '#,##0.00';
    totalRow.getCell(tCol + 1).alignment = { vertical: 'middle', horizontal: 'center' };

    totalRow.getCell(tCol + 2).value = Number(t.rate.toFixed(2));
    totalRow.getCell(tCol + 2).font = { bold: true, size: 11 };
    totalRow.getCell(tCol + 2).numFmt = '#,##0.00';
    totalRow.getCell(tCol + 2).alignment = { vertical: 'middle', horizontal: 'center' };

    totalRow.getCell(tCol + 3).value = Number(t.income.toFixed(2));
    totalRow.getCell(tCol + 3).font = { bold: true, size: 11 };
    totalRow.getCell(tCol + 3).numFmt = '#,##0.00';
    totalRow.getCell(tCol + 3).alignment = { vertical: 'middle', horizontal: 'center' };
    tCol += 3;
  });

  totalRow.getCell(tCol + 1).value = Number(totals.remainingMilk.toFixed(2));
  totalRow.getCell(tCol + 1).font = { bold: true, size: 12, color: { argb: 'FFDC2626' } };
  totalRow.getCell(tCol + 1).numFmt = '#,##0.00';
  totalRow.getCell(tCol + 1).alignment = { vertical: 'middle', horizontal: 'center' };

  let eCol = tCol + 1;
  table.expenseNames.forEach((expenseName) => {
    totalRow.getCell(eCol + 1).value = Number(totals[expenseName].toFixed(2));
    totalRow.getCell(eCol + 1).font = { bold: true, size: 11, color: { argb: 'FFF59E0B' } };
    totalRow.getCell(eCol + 1).numFmt = '#,##0.00';
    totalRow.getCell(eCol + 1).alignment = { vertical: 'middle', horizontal: 'center' };
    eCol += 1;
  });

  totalRow.getCell(eCol + 1).value = Number(totals.totalExpenses.toFixed(2));
  totalRow.getCell(eCol + 1).font = { bold: true, size: 13, color: { argb: 'FFD97706' } };
  totalRow.getCell(eCol + 1).numFmt = '#,##0.00';
  totalRow.getCell(eCol + 1).alignment = { vertical: 'middle', horizontal: 'center' };

  totalRow.getCell(eCol + 2).value = Number(totals.totalIncome.toFixed(2));
  totalRow.getCell(eCol + 2).font = { bold: true, size: 13, color: { argb: 'FF15803D' } };
  totalRow.getCell(eCol + 2).numFmt = '#,##0.00';
  totalRow.getCell(eCol + 2).alignment = { vertical: 'middle', horizontal: 'center' };

  const grandProfitCell = totalRow.getCell(eCol + 3);
  grandProfitCell.value = Number(totals.profit.toFixed(2));
  grandProfitCell.numFmt = '#,##0.00';
  grandProfitCell.alignment = { vertical: 'middle', horizontal: 'center' };
  if (totals.profit < 0) {
    grandProfitCell.font = { bold: true, size: 13, color: { argb: 'FFDC2626' } };
  } else {
    grandProfitCell.font = { bold: true, size: 13, color: { argb: 'FF15803D' } };
  }

  // Add borders to total row
  totalRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'medium', color: { argb: 'FF94A3B8' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
    };
  });
  totalRow.getCell(1).border = {
    top: { style: 'medium', color: { argb: 'FF94A3B8' } },
    bottom: { style: 'medium', color: { argb: 'FF94A3B8' } },
    right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
  };

  // Set column widths (spacious)
  sheet.columns.forEach((column, index) => {
    if (index === 0) {
      column.width = 16; // Date
    } else if (index === 1) {
      column.width = 16; // Total Milk
    } else if (index === colCount - 3) {
      column.width = 18; // Total Expenses
    } else if (index === colCount - 2) {
      column.width = 18; // Total Income
    } else if (index === colCount - 1) {
      column.width = 16; // Profit
    } else {
      column.width = 14; // All other columns
    }
  });

  // Freeze panes (freeze title rows + header rows)
  sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 4 }];

  // Auto-filter on data rows
  sheet.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: 4, column: colCount }
  };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${name}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function getTotalColumns(table) {
  let count = 2; // Date + Total Milk
  count += table.buyerNames.length * 3; // Each buyer: Litres, Rate, Income
  count += 1; // Remaining Milk
  count += table.expenseNames.length; // Each expense
  count += 3; // Total Expenses, Total Income, Profit
  return count;
}

export async function exportDetailedDailyPdf({ fileName, title, subtitle, dailyData = [], reportMeta }) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 12;

  const parseStoredNotesRaw = (rawNotes = '') => {
    const normalized = String(rawNotes || '').trim();
    if (!normalized) return { generalNotes: '', remainingUsage: '', remainingNotes: '' };
    const [first = '', second = ''] = normalized.split(' | ');
    const milkOptions = ['Home Use', 'Bonus Quantity', 'Meeting Use', 'Spoiled', 'Carried Forward', 'Mixed / Other'];
    if (milkOptions.includes(first)) return { generalNotes: '', remainingUsage: first, remainingNotes: second };
    return { generalNotes: first, remainingUsage: '', remainingNotes: second };
  };

  // Title page header
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(margin, margin, pageWidth - margin * 2, 24, 5, 5, 'F');
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text(pdfSafe(title), margin + 6, margin + 12);
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.setFont('helvetica', 'normal');
  doc.text(pdfSafe(subtitle || 'Daily Business Detail Report'), margin + 6, margin + 20);

  if (reportMeta?.label) {
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Filter: ${reportMeta.label} • Generated ${format(new Date(), 'dd MMM yyyy, hh:mm a')}`, margin + 6, margin + 28);
  }

  let y = margin + 34;

  const addPageIfNeeded = (requiredHeight = 40) => {
    const pageHeight = doc.internal.pageSize.getHeight();
    if (y + requiredHeight > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const drawDayHeader = (item) => {
    addPageIfNeeded(50);

    const totalMilk = Number(item.entry.total_milk_litres || 0);
    const totalSold = Number((item.milkSales || []).reduce((sum, sale) => sum + Number(sale.litres || 0), 0));
    const remaining = Number(item.entry.remaining_milk_litres || 0);
    const income = Number(item.entry.total_income || 0);
    const expenses = Number(item.entry.total_expenses || 0);
    const profit = Number(item.entry.profit || 0);

    doc.setFillColor(240, 253, 244);
    doc.roundedRect(margin, y, pageWidth - margin * 2, 12, 3, 3, 'F');
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(item.entry.entry_date, margin + 4, y + 8);

    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    const summaryLine = `Milk: ${totalMilk.toFixed(2)} L  |  Sold: ${totalSold.toFixed(2)} L  |  Remaining: ${remaining.toFixed(2)} L  |  Income: Rs. ${income.toLocaleString('en-IN', { maximumFractionDigits: 2 })}  |  Expenses: Rs. ${expenses.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
    doc.text(summaryLine, margin + 4, y + 17);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    if (profit >= 0) {
      doc.setTextColor(22, 163, 74);
      doc.text(`Profit: Rs. ${profit.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`, pageWidth - margin - 4, y + 8, { align: 'right' });
    } else {
      doc.setTextColor(220, 38, 38);
      doc.text(`Loss: Rs. ${Math.abs(profit).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`, pageWidth - margin - 4, y + 8, { align: 'right' });
    }

    y += 22;
  };

  const drawSectionTable = (sectionTitle, headers, bodyRows, accentColor = [15, 23, 42]) => {
    if (!bodyRows.length) return;
    addPageIfNeeded(30);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...accentColor);
    doc.text(sectionTitle, margin, y);
    y += 3;

    autoTable(doc, {
      startY: y,
      head: [headers],
      body: bodyRows,
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 2.5,
        lineColor: [226, 232, 240],
        lineWidth: 0.3,
        textColor: [30, 41, 59]
      },
      headStyles: {
        fillColor: accentColor,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center'
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      columnStyles: {
        0: { halign: 'left' }
      },
      margin: { left: margin, right: margin }
    });

    y = doc.lastAutoTable.finalY + 6;
  };

  dailyData.forEach((item, dayIndex) => {
    drawDayHeader(item);

    const cowRows = (item.cowEntries || []).map((entry) => [
      entry.cow_name || 'Unknown cow',
      `${Number(entry.total_litres || 0).toFixed(2)} L`,
      entry.entry_shift || (Number(entry.evening_litres || 0) > 0 ? 'Evening' : 'Morning'),
      entry.cow_status || 'Lactating',
      entry.notes || '—'
    ]);

    if (cowRows.length) {
      drawSectionTable('Cow-wise Production', ['Cow Name', 'Litres', 'Shifts', 'Status', 'Notes'], cowRows, [22, 163, 74]);
    }

    const saleRows = (item.milkSales || []).map((sale) => [
      sale.buyer_name || 'Unknown buyer',
      `${Number(sale.litres || 0).toFixed(2)} L`,
      `Rs. ${Number(sale.rate_per_litre || 0).toFixed(2)}`,
      `Rs. ${Number(sale.income || 0).toFixed(2)}`,
      sale.entry_shift || 'Morning',
      sale.notes || '—'
    ]);

    if (saleRows.length) {
      drawSectionTable('Milk Sold Details', ['Buyer', 'Litres', 'Rate/L', 'Income', 'Shifts', 'Notes'], saleRows, [59, 130, 246]);
    }

    const expenseRows = (item.expenses || []).map((expense) => {
      const isFeed = (expense.expense_type || 'common') === 'feed';
      const expenseName = isFeed ? (expense.food_name || 'Feed') : (expense.category_name || 'Other');
      const feedUnit = expense.unit_type === 'liter' ? 'L' : 'kg';
      const detail = isFeed
        ? `${expense.cow_name || 'Cow'} | ${Number(expense.quantity_kg || 0).toFixed(2)} ${feedUnit} | Rs. ${Number(expense.unit_rate || 0).toFixed(2)}/${feedUnit} | ${expense.entry_shift || 'Morning'}`
        : expense.payment_mode || 'Cash';

      return [
        expenseName,
        `Rs. ${Number(expense.amount || 0).toFixed(2)}`,
        detail,
        expense.description || '—'
      ];
    });

    if (expenseRows.length) {
      drawSectionTable('Expense Details', ['Category / Food', 'Amount', 'Details', 'Description'], expenseRows, [245, 158, 11]);
    }

    const parsedNotes = parseStoredNotesRaw(item.entry.notes);
    addPageIfNeeded(25);

    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, y, pageWidth - margin * 2, 16, 3, 3, 'F');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'bold');
    const generalNotesText = parsedNotes.generalNotes && parsedNotes.generalNotes !== parsedNotes.remainingUsage ? parsedNotes.generalNotes : '';
    doc.text(`General Notes: ${generalNotesText || '—'}`, margin + 4, y + 6);
    doc.text(`Remaining Milk: ${Number(item.entry.remaining_milk_litres || 0).toFixed(2)} L`, margin + 4, y + 12);
    y += 20;

    if (dayIndex < dailyData.length - 1) {
      addPageIfNeeded(8);
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.5);
      doc.line(margin, y, pageWidth - margin, y);
      y += 6;
    }
  });

  doc.save(`${(fileName || 'daily-business-report').toLowerCase().replace(/\s+/g, '-')}.pdf`);
}

export async function exportSingleCowPdf(cow) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;

  // Title header
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(margin, margin, pageWidth - margin * 2, 26, 5, 5, 'F');
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text(cow.name || 'Cow Record', margin + 6, margin + 12);
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.setFont('helvetica', 'normal');
  const cowSubtitle = [cow.breed || 'No breed', cow.age || 'No age', cow.status || 'Lactating'].filter(Boolean).join(' • ');
  doc.text(cowSubtitle, margin + 6, margin + 21);

  let y = margin + 32;
  const pageHeight = doc.internal.pageSize.getHeight();
  const ensureSpace = (needed = 18) => {
    if (y + needed <= pageHeight - margin) return;
    doc.addPage();
    y = margin;
  };

  // Cow details
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 28, 4, 4, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 28, 4, 4, 'S');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text('Cow Details', margin + 6, y + 7);
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  const details = [
    ['Status date', cow.status_date || 'Not recorded'],
    ['Notes', cow.notes || 'None']
  ];
  details.forEach(([label, value], i) => {
    const lineY = y + 14 + i * 6;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text(`${label}:`, margin + 6, lineY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    const textWidth = doc.getTextWidth(String(label) + ': ');
    doc.text(String(value), margin + 6 + textWidth, lineY, { maxWidth: pageWidth - margin * 2 - textWidth - 6 });
  });

  y += 28;

  // Stats cards
  const feedUnit = (cow.feedHistory || []).some((row) => row.unitType === 'liter') ? 'mixed' : 'kg';

  const stats = [
    { label: 'Total Milk', value: `${Number(cow.totalMilk || 0).toFixed(2)} L` },
    { label: 'Milk Entries', value: String(cow.recordCount || 0) },
    { label: 'Last Record', value: cow.lastRecordedDate || 'None' },
    { label: 'Feed Used', value: `${Number(cow.totalFeedKg || 0).toFixed(2)} ${feedUnit === 'mixed' ? 'units' : 'kg'}` },
    { label: 'Feed Budget', value: `Rs. ${Number(cow.totalFeedBudget || 0).toFixed(2)}` }
  ];

  const boxWidth = (pageWidth - margin * 2 - (stats.length - 1) * 4) / stats.length;
  stats.forEach((stat, i) => {
    const x = margin + i * (boxWidth + 4);
    doc.setFillColor(240, 253, 244);
    doc.roundedRect(x, y, boxWidth, 14, 3, 3, 'F');
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'bold');
    doc.text(stat.label, x + 3, y + 6);
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(stat.value, x + 3, y + 12);
  });

  y += 20;

  // Milk history table
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text('Milk History', margin + 6, y);
  y += 6;

  const milkGroups = groupRowsByDate(cow.history || []);
  if (!milkGroups.length) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('No milk history recorded yet.', margin + 6, y);
    y += 8;
  } else {
    milkGroups.forEach((group) => {
      ensureSpace(18);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(formatEntryDateLabel(group.entryDate), margin + 6, y);
      y += 3;
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [['Milk (L)', 'Shifts', 'Status', 'Notes']],
        body: group.rows.map((row) => [
          `${Number(row.totalLitres || 0).toFixed(2)}`,
          row.entryShift || 'Morning',
          row.status || 'Recorded',
          row.notes || '—'
        ]),
        styles: { fontSize: 7, cellPadding: 3, font: 'helvetica' },
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        theme: 'striped'
      });
      y = doc.lastAutoTable.finalY + 6;
    });
  }

  // Feed history table
  ensureSpace(16);
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text('Feed History', margin + 6, y);
  y += 6;

  const feedGroups = groupRowsByDate(cow.feedHistory || []);
  if (!feedGroups.length) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('No feed history recorded yet.', margin + 6, y);
  } else {
    feedGroups.forEach((group) => {
      ensureSpace(18);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(formatEntryDateLabel(group.entryDate), margin + 6, y);
      y += 3;
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [['Food', 'Quantity', 'Shifts', 'Amount (Rs.)']],
        body: group.rows.map((row) => [
          row.foodName || '—',
          `${Number(row.quantityKg || 0).toFixed(2)} ${row.unitType === 'liter' ? 'L' : 'kg'}`,
          row.entryShift || 'Morning',
          Number(row.amount || 0).toFixed(2)
        ]),
        styles: { fontSize: 7, cellPadding: 3, font: 'helvetica' },
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        theme: 'striped'
      });
      y = doc.lastAutoTable.finalY + 6;
    });
  }

  // Footer
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`Dairy Farm Management • ${cow.name} • Page ${i} of ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' });
  }

  const timestamp = format(new Date(), 'yyyy-MM-dd_HHmm');
  doc.save(`${(cow.name || 'cow-record').toLowerCase().replace(/\s+/g, '-')}-record-${timestamp}.pdf`);
}

export async function exportAllCowsPdf(cows) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const timestamp = format(new Date(), 'yyyy-MM-dd_HHmm');

  // Title header
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(margin, margin, pageWidth - margin * 2, 24, 5, 5, 'F');
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text('All Cow Records', margin + 6, margin + 12);
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.setFont('helvetica', 'normal');
  doc.text(`Total: ${cows.length} cows • Generated ${new Date().toLocaleString()}`, margin + 6, margin + 20);

  let y = margin + 30;

  // Summary stats
  const totalMilk = cows.reduce((sum, c) => sum + Number(c.totalMilk || 0), 0);
  const totalFeed = cows.reduce((sum, c) => sum + Number(c.totalFeedKg || 0), 0);
  const mixedFeedUnits = cows.some((cow) => (cow.feedHistory || []).some((row) => row.unitType === 'liter'));
  const totalBudget = cows.reduce((sum, c) => sum + Number(c.totalFeedBudget || 0), 0);
  const totalEntries = cows.reduce((sum, c) => sum + Number(c.recordCount || 0), 0);

  const summaryStats = [
    { label: 'Total Cows', value: String(cows.length) },
    { label: 'Total Milk', value: `${totalMilk.toFixed(2)} L` },
    { label: 'Milk Entries', value: String(totalEntries) },
    { label: 'Total Feed', value: `${totalFeed.toFixed(2)} ${mixedFeedUnits ? 'units' : 'kg'}` },
    { label: 'Feed Budget', value: `Rs. ${totalBudget.toFixed(2)}` }
  ];

  const boxWidth = (pageWidth - margin * 2 - (summaryStats.length - 1) * 4) / summaryStats.length;
  summaryStats.forEach((stat, i) => {
    const x = margin + i * (boxWidth + 4);
    doc.setFillColor(240, 253, 244);
    doc.roundedRect(x, y, boxWidth, 14, 3, 3, 'F');
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'bold');
    doc.text(stat.label, x + 3, y + 6);
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(stat.value, x + 3, y + 12);
  });

  y += 20;

  // Individual cow cards with their full data
  const pageHeight = doc.internal.pageSize.getHeight();
  const ensureSpace = (needed = 18) => {
    if (y + needed <= pageHeight - margin) return;
    doc.addPage();
    y = margin;
  };

  cows.forEach((cow, index) => {
    // Check page space
    if (y + 60 > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }

    // Cow card header
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, y, pageWidth - margin * 2, 16, 4, 4, 'F');
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, y, pageWidth - margin * 2, 16, 4, 4, 'S');
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(`${cow.name}`, margin + 6, y + 7);
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    const cowInfo = [cow.breed || '', cow.age || '', cow.status || 'Lactating'].filter(Boolean).join(' • ');
    doc.text(cowInfo, margin + 6, y + 13);

    // Cow stats inline
    doc.setFontSize(7);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    const statsLine = `Milk: ${Number(cow.totalMilk || 0).toFixed(2)} L  |  Entries: ${cow.recordCount || 0}  |  Feed: ${Number(cow.totalFeedKg || 0).toFixed(2)} ${(cow.feedHistory || []).some((row) => row.unitType === 'liter') ? 'units' : 'kg'}  |  Budget: Rs. ${Number(cow.totalFeedBudget || 0).toFixed(2)}  |  Last: ${cow.lastRecordedDate || '—'}`;
    doc.text(statsLine, margin + 6, y + 21, { maxWidth: pageWidth - margin * 2 - 12 });

    y += 24;

    // Milk history mini table
    const milkGroups = groupRowsByDate(cow.history || []);
    if (milkGroups.length > 0) {
      ensureSpace(18);
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text('Milk History', margin + 6, y);
      y += 4;
      milkGroups.forEach((group) => {
        ensureSpace(16);
        doc.setFontSize(7);
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        doc.text(formatEntryDateLabel(group.entryDate), margin + 6, y);
        y += 2;
        autoTable(doc, {
          startY: y,
          margin: { left: margin, right: margin },
          head: [['Milk (L)', 'Shifts', 'Status', 'Notes']],
          body: group.rows.map((row) => [Number(row.totalLitres || 0).toFixed(2), row.entryShift || 'Morning', row.status || 'Recorded', row.notes || '—']),
          styles: { fontSize: 6, cellPadding: 2, font: 'helvetica' },
          headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          theme: 'striped'
        });
        y = doc.lastAutoTable.finalY + 4;
      });
    }

    // Feed history mini table
    const feedGroups = groupRowsByDate(cow.feedHistory || []);
    if (feedGroups.length > 0) {
      ensureSpace(18);
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text('Feed History', margin + 6, y);
      y += 4;
      feedGroups.forEach((group) => {
        ensureSpace(16);
        doc.setFontSize(7);
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        doc.text(formatEntryDateLabel(group.entryDate), margin + 6, y);
        y += 2;
        autoTable(doc, {
          startY: y,
          margin: { left: margin, right: margin },
          head: [['Food', 'Qty', 'Shifts', 'Amount']],
          body: group.rows.map((row) => [row.foodName || '—', `${Number(row.quantityKg || 0).toFixed(2)} ${row.unitType === 'liter' ? 'L' : 'kg'}`, row.entryShift || 'Morning', Number(row.amount || 0).toFixed(2)]),
          styles: { fontSize: 6, cellPadding: 2, font: 'helvetica' },
          headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          theme: 'striped'
        });
        y = doc.lastAutoTable.finalY + 4;
      });
    } else {
      y += 4;
    }

    // Separator
    if (index < cows.length - 1) {
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.line(margin, y, pageWidth - margin, y);
      y += 6;
    }
  });

  // Footer
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`Dairy Farm Management • All Cow Records • Page ${i} of ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' });
  }

  doc.save(`all-cow-records-${timestamp}.pdf`);
}

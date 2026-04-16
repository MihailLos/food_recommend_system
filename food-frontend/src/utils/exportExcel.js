import * as XLSX from "xlsx";

/**
 * rows: массив объектов, где ключи — заголовки столбцов, значения — данные
 * fileName: имя файла, например "catalog.xlsx"
 */
export function exportJsonToExcel(rows, fileName = "export.xlsx") {
  if (!rows || rows.length === 0) {
    alert("Нет данных для экспорта");
    return;
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  XLSX.utils.book_append_sheet(wb, ws, "Лист1");
  XLSX.writeFile(wb, fileName);
}

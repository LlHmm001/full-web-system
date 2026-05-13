import { mkdir } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";

const outputDir = path.join(process.cwd(), "sample");
const outputPath = path.join(outputDir, "brand-terms.xlsx");

await mkdir(outputDir, { recursive: true });

const workbook = new ExcelJS.Workbook();
const worksheet = workbook.addWorksheet("Sheet1");

worksheet.addRow(["id", "a", "b", "c", "name"]);
worksheet.addRow([1, "x", "y", "z", "当责 和 AI搭档"]);
worksheet.addRow([2, "x", "y", "z", "明师优徒 与 岗位经验内化"]);
worksheet.addRow([3, "x", "y", "z", "普通文本"]);

worksheet.columns.forEach((column) => {
  column.width = 22;
});

await workbook.xlsx.writeFile(outputPath);
console.log(outputPath);

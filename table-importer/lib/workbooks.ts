import { promises as fs } from "fs";
import { randomUUID } from "crypto";
import ExcelJS from "exceljs";
import { AppError } from "@/lib/api-errors";
import {
  ensureDataDirs,
  readJsonFile,
  safeWorkbookFileName,
  writeJsonFile
} from "@/lib/data-store";
import type { PreviewValue, WorkbookMeta, WorkbookPreview, WorkbookUploadResponse } from "@/lib/types";

const PREVIEW_ROWS = 2000;
const PREVIEW_COLUMNS = 200;
type ExcelJsLoadBuffer = Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0];

function nowIso() {
  return new Date().toISOString();
}

function metaPath(id: string) {
  return safeWorkbookFileName(id, "json");
}

export async function getWorkbookMeta(id: string): Promise<WorkbookMeta> {
  try {
    return await readJsonFile<WorkbookMeta>(metaPath(id));
  } catch {
    throw new AppError(404, "Workbook not found");
  }
}

export async function updateWorkbookMeta(meta: WorkbookMeta) {
  await writeJsonFile(metaPath(meta.id), meta);
}

export async function loadWorkbook(filePath: string) {
  const workbook = new ExcelJS.Workbook();
  const buffer = await fs.readFile(filePath);
  await workbook.xlsx.load(buffer as unknown as ExcelJsLoadBuffer);
  return workbook;
}

export async function saveUploadedWorkbook(
  buffer: Buffer,
  originalName: string
): Promise<WorkbookUploadResponse> {
  await ensureDataDirs();

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJsLoadBuffer);

  if (workbook.worksheets.length === 0) {
    throw new AppError(400, "Uploaded workbook has no worksheets");
  }

  const id = randomUUID();
  const originalPath = safeWorkbookFileName(id, "original.xlsx");
  const processedPath = safeWorkbookFileName(id, "processed.xlsx");
  await fs.writeFile(originalPath, buffer);
  await workbook.xlsx.writeFile(processedPath);

  const meta: WorkbookMeta = {
    id,
    originalName,
    originalPath,
    processedPath,
    sheetNames: workbook.worksheets.map((sheet) => sheet.name),
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  await writeJsonFile(metaPath(id), meta);

  return {
    workbookId: id,
    sheetNames: meta.sheetNames,
    preview: createPreview(getWorksheet(workbook))
  };
}

export async function saveProcessedWorkbook(meta: WorkbookMeta, workbook: ExcelJS.Workbook) {
  await workbook.xlsx.writeFile(meta.processedPath);
  await updateWorkbookMeta({
    ...meta,
    sheetNames: workbook.worksheets.map((sheet) => sheet.name),
    updatedAt: nowIso()
  });
}

export async function updateWorkbookCell(input: {
  workbookId: string;
  sheetName?: string;
  row: number;
  column: number;
  value: string | number | boolean | null;
}) {
  if (!Number.isInteger(input.row) || input.row < 1) {
    throw new AppError(400, "row must be a 1-based positive integer");
  }
  if (!Number.isInteger(input.column) || input.column < 1) {
    throw new AppError(400, "column must be a 1-based positive integer");
  }

  const meta = await getWorkbookMeta(input.workbookId);
  const workbook = await loadWorkbook(meta.processedPath);
  const worksheet = getWorksheet(workbook, input.sheetName);
  worksheet.getRow(input.row).getCell(input.column).value = normalizeEditedCellValue(input.value);
  await saveProcessedWorkbook(meta, workbook);

  return createPreview(worksheet);
}

export function getWorksheet(workbook: ExcelJS.Workbook, sheetName?: string) {
  const sheet = sheetName ? workbook.getWorksheet(sheetName) : workbook.worksheets[0];
  if (!sheet) {
    throw new AppError(404, `Worksheet not found${sheetName ? `: ${sheetName}` : ""}`);
  }
  return sheet;
}

export function hasFormula(cell: ExcelJS.Cell) {
  const value = cell.value;
  return Boolean(value && typeof value === "object" && "formula" in value);
}

export function getUsedRange(worksheet: ExcelJS.Worksheet) {
  let maxRow = 0;
  let maxColumn = 0;

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      if (!isEmptyCellValue(cell.value)) {
        maxRow = Math.max(maxRow, rowNumber);
        maxColumn = Math.max(maxColumn, columnNumber);
      }
    });
  });

  return {
    rows: maxRow,
    columns: maxColumn
  };
}

export function cellToPlainValue(value: ExcelJS.CellValue | undefined): PreviewValue {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    if ("formula" in value) {
      return cellToPlainValue(value.result as ExcelJS.CellValue | undefined);
    }
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("");
    }
    if ("text" in value && value.text !== undefined) {
      return String(value.text);
    }
    if ("error" in value && value.error !== undefined) {
      return String(value.error);
    }
  }

  return String(value);
}

export function cellToDbValue(value: ExcelJS.CellValue | undefined) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === "object") {
    if ("formula" in value) {
      return cellToDbValue(value.result as ExcelJS.CellValue | undefined);
    }
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("");
    }
    if ("text" in value && value.text !== undefined) {
      return String(value.text);
    }
    if ("error" in value && value.error !== undefined) {
      return String(value.error);
    }
  }
  return String(value);
}

export function createPreview(worksheet: ExcelJS.Worksheet): WorkbookPreview {
  const usedRange = getUsedRange(worksheet);
  const rowLimit = Math.min(usedRange.rows, PREVIEW_ROWS);
  const columnLimit = Math.min(Math.max(usedRange.columns, 1), PREVIEW_COLUMNS);
  const rows = Array.from({ length: rowLimit }, (_, rowIndex) => {
    const row = worksheet.getRow(rowIndex + 1);
    return Array.from({ length: columnLimit }, (_, columnIndex) =>
      cellToPlainValue(row.getCell(columnIndex + 1).value)
    );
  });

  return {
    sheetName: worksheet.name,
    rows,
    rowCount: usedRange.rows,
    columnCount: usedRange.columns
  };
}

function isEmptyCellValue(value: ExcelJS.CellValue | undefined) {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.length === 0;
  if (typeof value === "object" && !(value instanceof Date)) {
    if ("formula" in value) return false;
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.every((part) => !part.text);
    }
    if ("text" in value) return !value.text;
  }
  return false;
}

export async function deleteWorkbookRow(input: {
  workbookId: string;
  sheetName?: string;
  row: number;
}) {
  if (!Number.isInteger(input.row) || input.row < 1) {
    throw new AppError(400, "row must be a 1-based positive integer");
  }

  const meta = await getWorkbookMeta(input.workbookId);
  const workbook = await loadWorkbook(meta.processedPath);
  const worksheet = getWorksheet(workbook, input.sheetName);
  const usedRange = getUsedRange(worksheet);
  if (input.row > usedRange.rows) {
    throw new AppError(400, `row ${input.row} is beyond the used range (${usedRange.rows})`);
  }

  worksheet.spliceRows(input.row, 1);
  await saveProcessedWorkbook(meta, workbook);
  return createPreview(worksheet);
}

export async function deleteWorkbookColumn(input: {
  workbookId: string;
  sheetName?: string;
  column: number;
}) {
  if (!Number.isInteger(input.column) || input.column < 1) {
    throw new AppError(400, "column must be a 1-based positive integer");
  }

  const meta = await getWorkbookMeta(input.workbookId);
  const workbook = await loadWorkbook(meta.processedPath);
  const worksheet = getWorksheet(workbook, input.sheetName);
  const usedRange = getUsedRange(worksheet);
  if (input.column > usedRange.columns) {
    throw new AppError(400, `column ${input.column} is beyond the used range (${usedRange.columns})`);
  }

  // ExcelJS: spliceColumns preserves column indices; delete the first cell of each row in that column.
  worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    if (rowNumber <= usedRange.rows) {
      row.splice(input.column, 1);
    }
  });
  await saveProcessedWorkbook(meta, workbook);
  return createPreview(worksheet);
}

function normalizeEditedCellValue(value: string | number | boolean | null) {
  if (value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  return value.length > 0 ? value : null;
}

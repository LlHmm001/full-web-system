import type ExcelJS from "exceljs";
import type { PoolConnection as MysqlConn } from "mysql2/promise";
import type { ExecuteValues } from "mysql2";
import { AppError } from "@/lib/api-errors";
import { withMysqlConnection } from "@/lib/mysql-client";
import {
  cellToDbValue,
  getUsedRange,
  getWorkbookMeta,
  getWorksheet,
  loadWorkbook
} from "@/lib/workbooks";
import type { ImportDbRequest, ImportDbResponse } from "@/lib/types";

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const INSERT_BATCH_SIZE = 250;
type DatabaseCellValue = string | number | boolean | Date | null;

interface PreparedImportData {
  sheetName: string;
  columns: string[];       // DB column names (lowercased, matched)
  headerMap: Map<number, string>; // Excel column index → DB column name
  rows: DatabaseCellValue[][];
}

export async function importWorkbookToDatabase(
  workbookId: string,
  input: ImportDbRequest
): Promise<ImportDbResponse> {
  if (input.mode !== "overwrite") {
    throw new AppError(400, "Only overwrite mode is supported");
  }

  const data = await prepareImportData(workbookId, input);

  return withMysqlConnection(async (conn) => {
    const tableSql = quoteMysqlIdentifier(input.tableName);
    await conn.execute(`TRUNCATE TABLE ${tableSql}`);
    await insertMysqlRows(conn, tableSql, data.columns, data.rows);
    return {
      databaseType: "mysql" as const,
      tableName: input.tableName,
      sheetName: data.sheetName,
      columns: data.columns,
      insertedRows: data.rows.length,
      mode: "overwrite" as const
    };
  });
}

async function prepareImportData(
  workbookId: string,
  input: ImportDbRequest
): Promise<PreparedImportData> {
  const meta = await getWorkbookMeta(workbookId);
  const workbook = await loadWorkbook(meta.processedPath);
  const worksheet = getWorksheet(workbook, input.sheetName);
  const usedRange = getUsedRange(worksheet);

  if (usedRange.rows === 0 || usedRange.columns === 0) {
    throw new AppError(400, "Worksheet has no data to import");
  }

  // Read raw Excel headers (row 1)
  const rawHeaders: string[] = [];
  if (input.headerRow) {
    const headerRow = worksheet.getRow(1);
    for (let c = 1; c <= usedRange.columns; c++) {
      const raw = cellToDbValue(headerRow.getCell(c).value);
      rawHeaders.push(raw === null ? "" : String(raw).trim());
    }
  } else {
    for (let c = 1; c <= usedRange.columns; c++) {
      rawHeaders.push(`col_${c}`);
    }
  }

  // Map Excel headers to DB column names (case-insensitive, trim whitespace)
  const columns = rawHeaders.map((h) => normalizeColumnName(h));
  assertUniqueColumns(columns);

  // Read data rows, filtering empty name rows
  const rows = readDataRows(worksheet, usedRange.rows, usedRange.columns, input.headerRow);

  return {
    sheetName: worksheet.name,
    columns,
    headerMap: new Map(),
    rows
  };
}

function normalizeColumnName(raw: string): string {
  // Remove all whitespace, lowercase
  return raw.replace(/\s+/g, "").toLowerCase();
}

function readDataRows(
  worksheet: ExcelJS.Worksheet,
  rowCount: number,
  columnCount: number,
  headerRow: boolean
): DatabaseCellValue[][] {
  const startRow = headerRow ? 2 : 1;
  const rows: DatabaseCellValue[][] = [];

  for (let rowIndex = startRow; rowIndex <= rowCount; rowIndex++) {
    const row = worksheet.getRow(rowIndex);
    const values = Array.from({ length: columnCount }, (_, columnIndex) =>
      normalizeDatabaseCellValue(cellToDbValue(row.getCell(columnIndex + 1).value))
    );

    // Skip rows where first column (name) is empty
    const nameValue = values[0];
    if (nameValue === null || nameValue === "" || (typeof nameValue === "string" && nameValue.trim() === "")) {
      continue;
    }

    // Skip fully empty rows
    if (values.every((value) => value === null || value === "")) {
      continue;
    }

    rows.push(values);
  }

  return rows;
}

function normalizeDatabaseCellValue(value: unknown): DatabaseCellValue {
  if (value === null) return null;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value instanceof Date
  ) {
    return value;
  }
  return String(value);
}

async function insertMysqlRows(
  conn: MysqlConn,
  tableSql: string,
  columns: string[],
  rows: DatabaseCellValue[][]
) {
  if (rows.length === 0) return;

  const columnSql = columns.map(quoteMysqlIdentifier).join(", ");
  for (let offset = 0; offset < rows.length; offset += INSERT_BATCH_SIZE) {
    const batch = rows.slice(offset, offset + INSERT_BATCH_SIZE);
    const values = batch.flat();
    const placeholders = batch
      .map((row) => `(${row.map(() => "?").join(", ")})`)
      .join(", ");

    await conn.execute(
      `INSERT INTO ${tableSql} (${columnSql}) VALUES ${placeholders}`,
      values as ExecuteValues[]
    );
  }
}

function assertIdentifier(identifier: string, label: string) {
  if (!IDENTIFIER_PATTERN.test(identifier)) {
    throw new AppError(
      400,
      `${label} "${identifier}" is invalid. Use only letters, numbers, and underscores, and do not start with a number.`
    );
  }
}

function assertUniqueColumns(columns: string[]) {
  const seen = new Set<string>();
  for (const column of columns) {
    if (seen.has(column)) {
      throw new AppError(400, `Duplicate column "${column}" is not allowed`);
    }
    seen.add(column);
  }
}

function quoteMysqlIdentifier(identifier: string) {
  return `\`${identifier}\``;
}

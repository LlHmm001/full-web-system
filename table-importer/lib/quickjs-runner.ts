import { getQuickJS } from "quickjs-emscripten";
import type ExcelJS from "exceljs";
import { AppError } from "@/lib/api-errors";
import { translateMacroCode } from "@/lib/macro-translator";
import {
  cellToDbValue,
  createPreview,
  getUsedRange,
  getWorkbookMeta,
  getWorksheet,
  hasFormula,
  loadWorkbook,
  saveProcessedWorkbook
} from "@/lib/workbooks";
import type { MacroRunInput, MacroRunResponse, PreviewValue } from "@/lib/types";

const EXECUTION_TIMEOUT_MS = 3000;
const MEMORY_LIMIT_BYTES = 16 * 1024 * 1024;
const STACK_LIMIT_BYTES = 1024 * 1024;
const MAX_MODIFIED_CELLS = 50_000;

type Worksheet = ExcelJS.Worksheet;

export async function runMacroOnWorkbook(input: {
  workbookId: string;
  code: string;
  sheetName?: string;
}): Promise<MacroRunResponse> {
  const startedAt = Date.now();
  const meta = await getWorkbookMeta(input.workbookId);
  const workbook = await loadWorkbook(meta.processedPath);
  const worksheet = getWorksheet(workbook, input.sheetName);
  const execution = await executeMacroInSandbox(worksheet, translateMacroCode(input.code).code);

  await saveProcessedWorkbook(meta, workbook);
  const usedRange = getUsedRange(worksheet);

  return {
    logs: execution.logs,
    stats: {
      modifiedCells: execution.modifiedCells,
      usedRows: usedRange.rows,
      usedColumns: usedRange.columns,
      durationMs: Date.now() - startedAt
    },
    preview: createPreview(worksheet)
  };
}

export async function runAllMacrosOnWorkbook(input: {
  workbookId: string;
  macros: MacroRunInput[];
  sheetName?: string;
}): Promise<MacroRunResponse> {
  const startedAt = Date.now();
  if (input.macros.length === 0) {
    throw new AppError(400, "At least one macro is required");
  }

  const meta = await getWorkbookMeta(input.workbookId);
  const workbook = await loadWorkbook(meta.processedPath);
  const worksheet = getWorksheet(workbook, input.sheetName);
  const logs: string[] = [];
  let modifiedCells = 0;

  for (const [index, macro] of input.macros.entries()) {
    try {
      const execution = await executeMacroInSandbox(worksheet, translateMacroCode(macro.code).code);
      modifiedCells += execution.modifiedCells;
      logs.push(
        `宏 ${index + 1}/${input.macros.length}「${macro.name}」完成，修改 ${execution.modifiedCells} 个单元格`
      );
      logs.push(...execution.logs.map((line) => `  ${line}`));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new AppError(400, `宏 ${index + 1}/${input.macros.length}「${macro.name}」运行失败：${message}`);
    }
  }

  await saveProcessedWorkbook(meta, workbook);
  const usedRange = getUsedRange(worksheet);

  return {
    logs,
    stats: {
      modifiedCells,
      usedRows: usedRange.rows,
      usedColumns: usedRange.columns,
      durationMs: Date.now() - startedAt
    },
    preview: createPreview(worksheet)
  };
}

async function executeMacroInSandbox(worksheet: Worksheet, code: string) {
  const QuickJS = await getQuickJS();
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(MEMORY_LIMIT_BYTES);
  runtime.setMaxStackSize(STACK_LIMIT_BYTES);

  const deadline = Date.now() + EXECUTION_TIMEOUT_MS;
  let hostError: string | null = null;
  runtime.setInterruptHandler(() => Boolean(hostError) || Date.now() > deadline);

  const vm = runtime.newContext();
  const logs: string[] = [];
  const modifiedCells = new Set<string>();
  let structuralModifiedCells = 0;

  const setFunction = (name: string, callback: (...args: any[]) => any) => {
    const fnHandle = vm.newFunction(name, callback);
    vm.setProp(vm.global, name, fnHandle);
    fnHandle.dispose();
  };

  const indexArg = (handle: any, label: string) => {
    const value = vm.dump(handle);
    if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
      hostError = `${label} must be a 1-based positive number`;
      return null;
    }
    return Math.trunc(value);
  };

  const toQuickJsValue = (value: PreviewValue) => {
    if (value === null) return vm.null;
    if (typeof value === "number") return vm.newNumber(value);
    if (typeof value === "boolean") return value ? vm.true : vm.false;
    return vm.newString(value);
  };

  const countArg = (handle: any, label: string) => {
    const value = handle ? vm.dump(handle) : 1;
    if (value === undefined || value === null) return 1;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
      hostError = `${label} must be a positive number`;
      return null;
    }
    return Math.trunc(value);
  };

  const registerStructuralChange = (estimatedCells: number) => {
    if (modifiedCells.size + structuralModifiedCells + estimatedCells > MAX_MODIFIED_CELLS) {
      hostError = `Macro exceeded the maximum of ${MAX_MODIFIED_CELLS} modified cells`;
      return false;
    }
    structuralModifiedCells += estimatedCells;
    return true;
  };

  setFunction("__getCellValue", (rowHandle, columnHandle) => {
    const row = indexArg(rowHandle, "row");
    const column = indexArg(columnHandle, "column");
    if (!row || !column) return vm.undefined;

    const cell = worksheet.getRow(row).getCell(column);
    return toQuickJsValue(cellToRuntimeValue(cell.value));
  });

  setFunction("__setCellValue", (rowHandle, columnHandle, valueHandle) => {
    const row = indexArg(rowHandle, "row");
    const column = indexArg(columnHandle, "column");
    if (!row || !column || hostError) return vm.undefined;

    const key = `${row}:${column}`;
    if (!modifiedCells.has(key) && modifiedCells.size + 1 > MAX_MODIFIED_CELLS) {
      hostError = `Macro exceeded the maximum of ${MAX_MODIFIED_CELLS} modified cells`;
      return vm.undefined;
    }

    const nextValue = normalizeMacroValue(vm.dump(valueHandle));
    const cell = worksheet.getRow(row).getCell(column);
    const previousValue = cellToRuntimeValue(cell.value);
    if (hasFormula(cell) || !Object.is(previousValue, nextValue)) {
      cell.value = nextValue;
      modifiedCells.add(key);
    }

    return vm.undefined;
  });

  setFunction("__hasFormula", (rowHandle, columnHandle) => {
    const row = indexArg(rowHandle, "row");
    const column = indexArg(columnHandle, "column");
    if (!row || !column) return vm.false;
    return hasFormula(worksheet.getRow(row).getCell(column)) ? vm.true : vm.false;
  });

  setFunction("__usedRows", () => vm.newNumber(getUsedRange(worksheet).rows));
  setFunction("__usedColumns", () => vm.newNumber(getUsedRange(worksheet).columns));
  setFunction("__deleteColumns", (startHandle, countHandle) => {
    const start = indexArg(startHandle, "column");
    const count = countArg(countHandle, "count");
    if (!start || !count || hostError) return vm.undefined;
    const usedRange = getUsedRange(worksheet);
    if (!registerStructuralChange(Math.max(usedRange.rows, 1) * count)) return vm.undefined;
    worksheet.spliceColumns(start, count);
    return vm.undefined;
  });
  setFunction("__insertColumns", (startHandle, countHandle) => {
    const start = indexArg(startHandle, "column");
    const count = countArg(countHandle, "count");
    if (!start || !count || hostError) return vm.undefined;
    const usedRange = getUsedRange(worksheet);
    if (!registerStructuralChange(Math.max(usedRange.rows, 1) * count)) return vm.undefined;
    const emptyColumns = Array.from({ length: count }, () => []);
    worksheet.spliceColumns(start, 0, ...emptyColumns);
    return vm.undefined;
  });
  setFunction("__deleteRows", (startHandle, countHandle) => {
    const start = indexArg(startHandle, "row");
    const count = countArg(countHandle, "count");
    if (!start || !count || hostError) return vm.undefined;
    const usedRange = getUsedRange(worksheet);
    if (!registerStructuralChange(Math.max(usedRange.columns, 1) * count)) return vm.undefined;
    worksheet.spliceRows(start, count);
    return vm.undefined;
  });
  setFunction("__insertRows", (startHandle, countHandle) => {
    const start = indexArg(startHandle, "row");
    const count = countArg(countHandle, "count");
    if (!start || !count || hostError) return vm.undefined;
    const usedRange = getUsedRange(worksheet);
    if (!registerStructuralChange(Math.max(usedRange.columns, 1) * count)) return vm.undefined;
    const emptyRows = Array.from({ length: count }, () => []);
    worksheet.spliceRows(start, 0, ...emptyRows);
    return vm.undefined;
  });
  setFunction("__log", (...args) => {
    logs.push(args.map((arg) => stringifyLogValue(vm.dump(arg))).join(" "));
    return vm.undefined;
  });

  const result = vm.evalCode(buildRuntimeSource(code));
  try {
    if (result.error) {
      const errorMessage = formatQuickJsError(vm.dump(result.error));
      result.error.dispose();
      throw new AppError(400, hostError ?? errorMessage);
    }

    result.value.dispose();
    if (hostError) {
      throw new AppError(400, hostError);
    }

    return {
      logs,
      modifiedCells: modifiedCells.size + structuralModifiedCells
    };
  } finally {
    vm.dispose();
    runtime.dispose();
  }
}

function buildRuntimeSource(userCode: string) {
  return `
globalThis.process = undefined;
globalThis.require = undefined;
globalThis.fs = undefined;
globalThis.fetch = undefined;

const __maxModifiedCells = ${MAX_MODIFIED_CELLS};
const __macroTouchedCells = new Set();

globalThis.console = {
  log: (...args) => __log(...args),
  warn: (...args) => __log(...args),
  error: (...args) => __log(...args)
};

function __columnToNumber(column) {
  if (typeof column === "number") return Math.trunc(column);
  const text = String(column).replace(/\\$/g, "").trim().toUpperCase();
  const letters = text.includes(":") ? text.split(":")[0] : text;
  const match = letters.match(/[A-Z]+/);
  if (!match) throw new Error("Invalid column reference: " + column);
  let value = 0;
  for (const char of match[0]) {
    value = value * 26 + char.charCodeAt(0) - 64;
  }
  return value;
}

function __parseCellReference(reference) {
  const text = String(reference).replace(/\\$/g, "").trim().toUpperCase();
  const match = text.match(/^([A-Z]+)(\\d+)$/);
  if (!match) throw new Error("Invalid cell reference: " + reference);
  return {
    row: Number(match[2]),
    column: __columnToNumber(match[1])
  };
}

function __parseRangeReference(reference) {
  const text = String(reference).replace(/\\$/g, "").trim();
  const cleanText = text.includes("!") ? text.split("!").pop() : text;
  const parts = cleanText.split(":");
  if (parts.length === 1) {
    const cell = __parseCellReference(parts[0]);
    return {
      startRow: cell.row,
      startColumn: cell.column,
      endRow: cell.row,
      endColumn: cell.column
    };
  }
  if (parts.length !== 2) {
    throw new Error("Invalid range reference: " + reference);
  }
  const start = __parseCellReference(parts[0]);
  const end = __parseCellReference(parts[1]);
  return {
    startRow: Math.min(start.row, end.row),
    startColumn: Math.min(start.column, end.column),
    endRow: Math.max(start.row, end.row),
    endColumn: Math.max(start.column, end.column)
  };
}

function __makeCell(row, column) {
  const safeRow = Number(row);
  const safeColumn = Number(column);
  return {
    get Row() {
      return safeRow;
    },
    get Column() {
      return safeColumn;
    },
    get Value2() {
      return __getCellValue(safeRow, safeColumn);
    },
    set Value2(value) {
      const key = safeRow + ":" + safeColumn;
      if (!__macroTouchedCells.has(key) && __macroTouchedCells.size + 1 > __maxModifiedCells) {
        throw new Error("Macro exceeded the maximum of " + __maxModifiedCells + " modified cells");
      }
      __macroTouchedCells.add(key);
      __setCellValue(safeRow, safeColumn, value);
    },
    get Text() {
      const value = __getCellValue(safeRow, safeColumn);
      return value == null ? "" : String(value);
    },
    get HasFormula() {
      return __hasFormula(safeRow, safeColumn);
    },
    End(direction) {
      // xlUp: -4162, xlDown: -4121, xlToLeft: -4159, xlToRight: -4161
      const usedRows = __usedRows();
      const usedCols = __usedColumns();
      if (direction === -4162) {
        // xlUp: find first non-empty cell above, or row 1
        for (let r = safeRow; r >= 1; r--) {
          const v = __getCellValue(r, safeColumn);
          if (v != null && v !== "") return __makeCell(r, safeColumn);
        }
        return __makeCell(1, safeColumn);
      }
      if (direction === -4121) {
        // xlDown: find first non-empty cell below, or last used row
        for (let r = safeRow; r <= usedRows; r++) {
          const v = __getCellValue(r, safeColumn);
          if (v != null && v !== "") return __makeCell(r, safeColumn);
        }
        return __makeCell(usedRows, safeColumn);
      }
      if (direction === -4159) {
        // xlToLeft
        for (let c = safeColumn; c >= 1; c--) {
          const v = __getCellValue(safeRow, c);
          if (v != null && v !== "") return __makeCell(safeRow, c);
        }
        return __makeCell(safeRow, 1);
      }
      if (direction === -4161) {
        // xlToRight
        for (let c = safeColumn; c <= usedCols; c++) {
          const v = __getCellValue(safeRow, c);
          if (v != null && v !== "") return __makeCell(safeRow, c);
        }
        return __makeCell(safeRow, usedCols);
      }
      throw new Error("End() expects xlUp/xlDown/xlToLeft/xlToRight");
    }
  };
}

function __cellReferenceFromObject(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.Row === "number" && typeof value.Column === "number") {
    return {
      row: value.Row,
      column: value.Column
    };
  }
  return null;
}

function __makeRange(startRow, startColumn, endRow, endColumn, kind) {
  const safeStartRow = Math.max(1, Math.trunc(Number(startRow)));
  const safeStartColumn = Math.max(1, Math.trunc(Number(startColumn)));
  const safeEndRow = Math.max(safeStartRow, Math.trunc(Number(endRow)));
  const safeEndColumn = Math.max(safeStartColumn, Math.trunc(Number(endColumn)));
  const rangeKind = kind || "range";
  const rowCount = () => safeEndRow - safeStartRow + 1;
  const columnCount = () => safeEndColumn - safeStartColumn + 1;
  const range = {
    Cells(row, column) {
      return __makeCell(safeStartRow + Number(row) - 1, safeStartColumn + Number(column) - 1);
    },
    get Value2() {
      if (rowCount() === 1 && columnCount() === 1) {
        return __getCellValue(safeStartRow, safeStartColumn);
      }
      const values = [];
      for (let row = 1; row <= rowCount(); row++) {
        const rowValues = [];
        for (let column = 1; column <= columnCount(); column++) {
          rowValues.push(__getCellValue(safeStartRow + row - 1, safeStartColumn + column - 1));
        }
        values.push(rowValues);
      }
      return values;
    },
    set Value2(value) {
      for (let row = 1; row <= rowCount(); row++) {
        for (let column = 1; column <= columnCount(); column++) {
          this.Cells(row, column).Value2 = value;
        }
      }
    },
    get Text() {
      if (rowCount() === 1 && columnCount() === 1) {
        const value = __getCellValue(safeStartRow, safeStartColumn);
        return value == null ? "" : String(value);
      }
      return String(this.Value2);
    },
    get CurrentRegion() {
      return this;
    },
    Delete() {
      if (rangeKind === "columns") {
        __deleteColumns(safeStartColumn, columnCount());
        return;
      }
      if (rangeKind === "rows") {
        __deleteRows(safeStartRow, rowCount());
        return;
      }
      if (columnCount() >= Math.max(__usedColumns(), 1)) {
        __deleteRows(safeStartRow, rowCount());
        return;
      }
      if (rowCount() >= Math.max(__usedRows(), 1)) {
        __deleteColumns(safeStartColumn, columnCount());
        return;
      }
      throw new Error("Delete is only supported for entire rows or columns in this MVP");
    },
    Insert() {
      if (rangeKind === "columns") {
        __insertColumns(safeStartColumn, columnCount());
        return;
      }
      if (rangeKind === "rows") {
        __insertRows(safeStartRow, rowCount());
        return;
      }
      if (columnCount() >= Math.max(__usedColumns(), 1)) {
        __insertRows(safeStartRow, rowCount());
        return;
      }
      if (rowCount() >= Math.max(__usedRows(), 1)) {
        __insertColumns(safeStartColumn, columnCount());
        return;
      }
      throw new Error("Insert is only supported for entire rows or columns in this MVP");
    },
    End(direction) {
      return this.Cells(rowCount(), columnCount()).End(direction);
    }
  };

  const rows = function(row) {
    const absoluteRow = safeStartRow + Number(row) - 1;
    if (columnCount() === 1) return __makeCell(absoluteRow, safeStartColumn);
    return __makeRange(absoluteRow, safeStartColumn, absoluteRow, safeEndColumn, "rows");
  };
  Object.defineProperty(rows, "Count", {
    get() {
      return rowCount();
    }
  });

  const columns = function(column) {
    const absoluteColumn = safeStartColumn + __columnToNumber(column) - 1;
    if (rowCount() === 1) return __makeCell(safeStartRow, absoluteColumn);
    return __makeRange(safeStartRow, absoluteColumn, safeEndRow, absoluteColumn, "columns");
  };
  Object.defineProperty(columns, "Count", {
    get() {
      return columnCount();
    }
  });

  range.Rows = rows;
  range.Columns = columns;
  return range;
}

function __usedRange() {
  return __makeRange(1, 1, Math.max(__usedRows(), 1), Math.max(__usedColumns(), 1));
}

function Range(reference, endReference) {
  if (endReference !== undefined) {
    const startCell = __cellReferenceFromObject(reference);
    const endCell = __cellReferenceFromObject(endReference);
    if (!startCell || !endCell) {
      throw new Error("Range(start, end) expects cell objects");
    }
    return __makeRange(
      Math.min(startCell.row, endCell.row),
      Math.min(startCell.column, endCell.column),
      Math.max(startCell.row, endCell.row),
      Math.max(startCell.column, endCell.column)
    );
  }
  const parsed = __parseRangeReference(reference);
  return __makeRange(parsed.startRow, parsed.startColumn, parsed.endRow, parsed.endColumn);
}

// VBA enumerations
globalThis.xlUp = -4162;
globalThis.xlDown = -4121;
globalThis.xlToLeft = -4159;
globalThis.xlToRight = -4161;
globalThis.xlNone = -4142;

globalThis.ActiveSheet = {
  Cells(row, column) {
    return __makeCell(row, column);
  },
  Range(reference, endReference) {
    return Range(reference, endReference);
  },
  Columns(column) {
    const columnNumber = __columnToNumber(column);
    return __makeRange(1, columnNumber, Math.max(__usedRows(), 1), columnNumber, "columns");
  },
  Rows(row) {
    const rowNumber = Number(row);
    return __makeRange(rowNumber, 1, rowNumber, Math.max(__usedColumns(), 1), "rows");
  },
  get UsedRange() {
    return __usedRange();
  }
};

globalThis.Range = Range;
globalThis.ActiveWorkbook = {
  get ActiveSheet() {
    return globalThis.ActiveSheet;
  },
  Worksheets() {
    return globalThis.ActiveSheet;
  }
};

${userCode}

if (typeof Macro !== "function") {
  throw new Error("Macro code must define function Macro()");
}

Macro();
`;
}

function cellToRuntimeValue(value: ExcelJS.CellValue | undefined): PreviewValue {
  const dbValue = cellToDbValue(value);
  if (dbValue instanceof Date) return dbValue.toISOString();
  if (
    dbValue === null ||
    typeof dbValue === "string" ||
    typeof dbValue === "number" ||
    typeof dbValue === "boolean"
  ) {
    return dbValue;
  }
  return String(dbValue);
}

function normalizeMacroValue(value: unknown): string | number | boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  return JSON.stringify(value) ?? String(value);
}

function stringifyLogValue(value: unknown) {
  if (typeof value === "string") return value;
  if (value === undefined) return "undefined";
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function formatQuickJsError(error: unknown) {
  if (error && typeof error === "object") {
    const maybeError = error as { name?: string; message?: string; stack?: string };
    const prefix = maybeError.message
      ? `${maybeError.name ?? "Error"}: ${maybeError.message}`
      : maybeError.name;
    if (maybeError.stack && prefix) {
      return maybeError.stack.includes(prefix) ? maybeError.stack : `${prefix}\n${maybeError.stack}`;
    }
    if (maybeError.stack) return maybeError.stack;
    if (prefix) return prefix;
  }
  return String(error);
}

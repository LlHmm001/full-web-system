export type PreviewValue = string | number | boolean | null;

export type PreviewRow = PreviewValue[];

export interface WorkbookPreview {
  sheetName: string;
  rows: PreviewRow[];
  rowCount: number;
  columnCount: number;
}

export interface WorkbookUploadResponse {
  workbookId: string;
  sheetNames: string[];
  preview: WorkbookPreview;
}

export interface WorkbookMeta {
  id: string;
  originalName: string;
  originalPath: string;
  processedPath: string;
  sheetNames: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Macro {
  id: string;
  name: string;
  code: string;
  createdAt: string;
  updatedAt: string;
}

export interface MacroRunStats {
  modifiedCells: number;
  usedRows: number;
  usedColumns: number;
  durationMs: number;
}

export interface MacroRunResponse {
  logs: string[];
  preview: WorkbookPreview;
  stats: MacroRunStats;
}

export interface MacroRunInput {
  id?: string;
  name: string;
  code: string;
}

export interface ImportDbRequest {
  databaseType: "postgres" | "mysql";
  databaseUrl?: string;
  tableName: string;
  sheetName?: string;
  headerRow: boolean;
  mode: "overwrite";
}

export interface ImportDbResponse {
  databaseType: "postgres" | "mysql";
  tableName: string;
  sheetName: string;
  columns: string[];
  insertedRows: number;
  mode: "overwrite";
}

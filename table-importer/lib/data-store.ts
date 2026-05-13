import { promises as fs } from "fs";
import path from "path";

export const DATA_DIR = path.join(process.cwd(), ".data");
export const WORKBOOK_DIR = path.join(DATA_DIR, "workbooks");

export async function ensureDataDirs() {
  await fs.mkdir(WORKBOOK_DIR, { recursive: true });
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

export async function writeJsonFile<T>(filePath: string, data: T) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await fs.rename(tmpPath, filePath);
}

export function safeWorkbookFileName(id: string, suffix: string) {
  return path.join(WORKBOOK_DIR, `${id}.${suffix}`);
}

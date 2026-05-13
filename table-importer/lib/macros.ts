import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { AppError } from "@/lib/api-errors";
import { DATA_DIR, ensureDataDirs, readJsonFile, writeJsonFile } from "@/lib/data-store";
import { translateMacroCode } from "@/lib/macro-translator";
import { SAMPLE_MACRO_CODE, SAMPLE_MACRO_NAME } from "@/lib/sample-macro";
import type { Macro } from "@/lib/types";

const MACROS_FILE = path.join(DATA_DIR, "macros.json");

function nowIso() {
  return new Date().toISOString();
}

function createSampleMacro(): Macro {
  const now = nowIso();
  return {
    id: randomUUID(),
    name: SAMPLE_MACRO_NAME,
    code: SAMPLE_MACRO_CODE,
    createdAt: now,
    updatedAt: now
  };
}

async function ensureMacroFile() {
  await ensureDataDirs();
  try {
    await fs.access(MACROS_FILE);
  } catch {
    await writeJsonFile(MACROS_FILE, [createSampleMacro()]);
  }
}

export async function listMacros(): Promise<Macro[]> {
  await ensureMacroFile();
  return readJsonFile<Macro[]>(MACROS_FILE);
}

export async function createMacro(input: { name?: string; code?: string }): Promise<Macro> {
  const macros = await listMacros();
  const now = nowIso();
  const code = translateMacroCode(
    input.code ?? "function Macro() {\n  const sheet = ActiveSheet;\n  console.log(sheet.UsedRange.Rows.Count);\n}"
  ).code;
  const macro: Macro = {
    id: randomUUID(),
    name: input.name?.trim() || "未命名宏",
    code,
    createdAt: now,
    updatedAt: now
  };

  macros.unshift(macro);
  await writeJsonFile(MACROS_FILE, macros);
  return macro;
}

export async function updateMacro(
  id: string,
  input: { name?: string; code?: string }
): Promise<Macro> {
  const macros = await listMacros();
  const index = macros.findIndex((macro) => macro.id === id);
  if (index === -1) {
    throw new AppError(404, "Macro not found");
  }

  const next: Macro = {
    ...macros[index],
    name: input.name?.trim() || macros[index].name,
    code: input.code === undefined ? macros[index].code : translateMacroCode(input.code).code,
    updatedAt: nowIso()
  };

  macros[index] = next;
  await writeJsonFile(MACROS_FILE, macros);
  return next;
}

export async function reorderMacros(ids: string[]): Promise<Macro[]> {
  const macros = await listMacros();
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) {
    throw new AppError(400, "Macro order contains duplicate ids");
  }
  if (ids.length !== macros.length) {
    throw new AppError(400, "Macro order must include every macro id");
  }

  const byId = new Map(macros.map((macro) => [macro.id, macro]));
  const next = ids.map((id) => {
    const macro = byId.get(id);
    if (!macro) {
      throw new AppError(400, `Unknown macro id: ${id}`);
    }
    return macro;
  });

  await writeJsonFile(MACROS_FILE, next);
  return next;
}

export async function deleteMacro(id: string) {
  const macros = await listMacros();
  const next = macros.filter((macro) => macro.id !== id);
  if (next.length === macros.length) {
    throw new AppError(404, "Macro not found");
  }

  await writeJsonFile(MACROS_FILE, next.length > 0 ? next : [createSampleMacro()]);
}

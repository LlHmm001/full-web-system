import { NextResponse } from "next/server";
import { AppError, jsonError } from "@/lib/api-errors";
import { runAllMacrosOnWorkbook } from "@/lib/quickjs-runner";
import type { MacroRunInput } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      macros?: MacroRunInput[];
      sheetName?: string;
    };

    if (!Array.isArray(body.macros) || body.macros.length === 0) {
      throw new AppError(400, "Macro list is required");
    }

    for (const macro of body.macros) {
      if (!macro || typeof macro.code !== "string" || typeof macro.name !== "string") {
        throw new AppError(400, "Each macro must include name and code");
      }
    }

    return NextResponse.json(
      await runAllMacrosOnWorkbook({
        workbookId: id,
        macros: body.macros,
        sheetName: body.sheetName
      })
    );
  } catch (error) {
    return jsonError(error);
  }
}

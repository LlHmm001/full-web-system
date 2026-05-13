import { NextResponse } from "next/server";
import { AppError, jsonError } from "@/lib/api-errors";
import { runMacroOnWorkbook } from "@/lib/quickjs-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      code?: string;
      sheetName?: string;
    };

    if (!body.code || typeof body.code !== "string") {
      throw new AppError(400, "Macro code is required");
    }

    return NextResponse.json(
      await runMacroOnWorkbook({
        workbookId: id,
        code: body.code,
        sheetName: body.sheetName
      })
    );
  } catch (error) {
    return jsonError(error);
  }
}

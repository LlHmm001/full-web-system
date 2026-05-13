import { NextResponse } from "next/server";
import { AppError, jsonError } from "@/lib/api-errors";
import { updateWorkbookCell } from "@/lib/workbooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      sheetName?: string;
      row?: number;
      column?: number;
      value?: string | number | boolean | null;
    };

    if (typeof body.row !== "number" || typeof body.column !== "number") {
      throw new AppError(400, "row and column are required");
    }

    const value = body.value === undefined ? null : body.value;
    if (
      value !== null &&
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    ) {
      throw new AppError(400, "value must be a string, number, boolean, or null");
    }

    return NextResponse.json({
      preview: await updateWorkbookCell({
        workbookId: id,
        sheetName: body.sheetName,
        row: body.row,
        column: body.column,
        value
      })
    });
  } catch (error) {
    return jsonError(error);
  }
}

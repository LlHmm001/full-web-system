import { NextResponse } from "next/server";
import { AppError, jsonError } from "@/lib/api-errors";
import { deleteWorkbookColumn } from "@/lib/workbooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const url = new URL(_request.url);
    const column = Number(url.searchParams.get("column"));
    const sheetName = url.searchParams.get("sheet") || undefined;

    if (!column || !Number.isInteger(column) || column < 1) {
      throw new AppError(400, "Query parameter ?column=N is required (1-based integer)");
    }

    return NextResponse.json({
      preview: await deleteWorkbookColumn({ workbookId: id, sheetName, column })
    });
  } catch (error) {
    return jsonError(error);
  }
}

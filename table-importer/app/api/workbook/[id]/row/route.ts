import { NextResponse } from "next/server";
import { AppError, jsonError } from "@/lib/api-errors";
import { deleteWorkbookRow } from "@/lib/workbooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const url = new URL(_request.url);
    const row = Number(url.searchParams.get("row"));
    const sheetName = url.searchParams.get("sheet") || undefined;

    if (!row || !Number.isInteger(row) || row < 1) {
      throw new AppError(400, "Query parameter ?row=N is required (1-based integer)");
    }

    return NextResponse.json({
      preview: await deleteWorkbookRow({ workbookId: id, sheetName, row })
    });
  } catch (error) {
    return jsonError(error);
  }
}

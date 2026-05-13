import { NextResponse } from "next/server";
import { AppError, jsonError } from "@/lib/api-errors";
import { importWorkbookToDatabase } from "@/lib/db-import";
import type { ImportDbRequest } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as ImportDbRequest | null;
    if (!body) {
      throw new AppError(400, "Import configuration is required");
    }
    if (!body.tableName || typeof body.tableName !== "string") {
      throw new AppError(400, "Target table name is required");
    }

    return NextResponse.json(await importWorkbookToDatabase(id, body));
  } catch (error) {
    return jsonError(error);
  }
}

import { NextResponse } from "next/server";
import { AppError, jsonError } from "@/lib/api-errors";
import { reorderMacros } from "@/lib/macros";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { ids?: string[] };
    if (!Array.isArray(body.ids) || body.ids.some((id) => typeof id !== "string")) {
      throw new AppError(400, "ids must be an array of macro ids");
    }

    return NextResponse.json(await reorderMacros(body.ids));
  } catch (error) {
    return jsonError(error);
  }
}

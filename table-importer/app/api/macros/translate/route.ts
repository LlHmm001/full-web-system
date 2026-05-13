import { NextResponse } from "next/server";
import { AppError, jsonError } from "@/lib/api-errors";
import { translateMacroCode } from "@/lib/macro-translator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { code?: string };
    if (typeof body.code !== "string") {
      throw new AppError(400, "code is required");
    }

    return NextResponse.json(translateMacroCode(body.code));
  } catch (error) {
    return jsonError(error);
  }
}

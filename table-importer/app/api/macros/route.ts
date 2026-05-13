import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-errors";
import { createMacro, listMacros } from "@/lib/macros";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await listMacros());
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { name?: string; code?: string };
    return NextResponse.json(await createMacro(body), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

import { NextResponse } from "next/server";
import { withMysqlConnection } from "@/lib/mysql-client";
import { AppError, jsonError } from "@/lib/api-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const value = await withMysqlConnection(async (conn) => {
      const [rows] = await conn.query("SELECT `value` FROM `day_qgskdt` LIMIT 1");
      const row = (rows as { value: string }[])[0];
      return row?.value ?? "";
    });
    return NextResponse.json({ value });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { value?: string };
    if (typeof body.value !== "string") {
      throw new AppError(400, "value is required");
    }
    const val = body.value;
    await withMysqlConnection(async (conn) => {
      await conn.query("UPDATE `day_qgskdt` SET `value` = ?", [val]);
    });
    return NextResponse.json({ value: val });
  } catch (error) {
    return jsonError(error);
  }
}

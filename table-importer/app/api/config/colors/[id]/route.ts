import { NextResponse } from "next/server";
import { withMysqlConnection } from "@/lib/mysql-client";
import { jsonError } from "@/lib/api-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const num = Number(id);
    await withMysqlConnection(async (conn) => {
      await conn.query("DELETE FROM `colour` WHERE `id` = ?", [num]);
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

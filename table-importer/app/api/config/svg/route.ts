import { NextResponse } from "next/server";
import { withMysqlConnection } from "@/lib/mysql-client";
import { AppError, jsonError } from "@/lib/api-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const svgCode = await withMysqlConnection(async (conn) => {
      const [rows] = await conn.query("SELECT `svg_code` FROM `svg_content` WHERE `id` = ?", ["main-svg"]);
      const row = (rows as { svg_code: string }[])[0];
      return row?.svg_code ?? "";
    });
    return NextResponse.json({ svgCode });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { svgCode?: string };
    if (typeof body.svgCode !== "string") {
      throw new AppError(400, "svgCode is required");
    }
    const svgCode = body.svgCode;
    await withMysqlConnection(async (conn) => {
      await conn.query(
        "INSERT INTO `svg_content` (`id`, `svg_code`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `svg_code` = VALUES(`svg_code`)",
        ["main-svg", svgCode]
      );
    });
    return NextResponse.json({ svgCode });
  } catch (error) {
    return jsonError(error);
  }
}

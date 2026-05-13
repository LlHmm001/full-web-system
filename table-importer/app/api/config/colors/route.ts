import { NextResponse } from "next/server";
import { withMysqlConnection } from "@/lib/mysql-client";
import { AppError, jsonError } from "@/lib/api-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ColourRow = { id: number; colour: string };

export async function GET() {
  try {
    const rows = await withMysqlConnection(async (conn) => {
      const [result] = await conn.query("SELECT `id`, `colour` FROM `colour` ORDER BY `id`");
      return result as ColourRow[];
    });
    return NextResponse.json(rows);
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { id?: number; colour?: string };
    if (typeof body.id !== "number" || typeof body.colour !== "string") {
      throw new AppError(400, "id and colour are required");
    }
    const id = body.id;
    const colour = body.colour;
    await withMysqlConnection(async (conn) => {
      await conn.query("UPDATE `colour` SET `colour` = ? WHERE `id` = ?", [colour, id]);
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { colour?: string };
    if (typeof body.colour !== "string") {
      throw new AppError(400, "colour is required");
    }
    const colour = body.colour;
    const result = await withMysqlConnection(async (conn) => {
      const [res] = await conn.query("INSERT INTO `colour` (`colour`) VALUES (?)", [colour]);
      return res as import("mysql2").ResultSetHeader;
    });
    return NextResponse.json({ id: result.insertId, colour });
  } catch (error) {
    return jsonError(error);
  }
}

import { NextResponse } from "next/server";
import { AppError, jsonError } from "@/lib/api-errors";
import { saveUploadedWorkbook } from "@/lib/workbooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new AppError(400, "Upload field 'file' is required");
    }
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      throw new AppError(400, "Only .xlsx files are supported");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await saveUploadedWorkbook(buffer, file.name);
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}

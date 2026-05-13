import { promises as fs } from "fs";
import { AppError, jsonError } from "@/lib/api-errors";
import { getWorkbookMeta } from "@/lib/workbooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const meta = await getWorkbookMeta(id);
    const buffer = await fs.readFile(meta.processedPath);
    if (!buffer.length) {
      throw new AppError(404, "Processed workbook is empty");
    }

    const fileName = encodeURIComponent(`processed-${meta.originalName}`);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${fileName}`
      }
    });
  } catch (error) {
    return jsonError(error);
  }
}

import fs from "node:fs";
import { NextResponse } from "next/server";
import { authorize, routeError } from "@/lib/api";
import { getVersion, publicReport } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; version: string }> }) {
  try {
    const { id, version } = await params;
    const auth = authorize(request, id);
    if (auth.error) return auth.error;
    const row = getVersion(id, Number(version));
    if (!row) return NextResponse.json({ error: "版本不存在" }, { status: 404 });
    const buf = fs.readFileSync(row.pdf_path);
    const report = publicReport(auth.row);
    const filename = encodeURIComponent(`${report.data.projectName || "空调箱测试报告"}-V${version}.docx`);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      },
    });
  } catch (error) {
    return routeError(error);
  }
}

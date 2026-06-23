import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { authorize, routeError } from "@/lib/api";
import { addNextVersion, allocateReportNumber, listVersions, publicReport, storageRoot } from "@/lib/db";
import { generateDocx } from "@/lib/wordgen";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = authorize(request, id);
    if (auth.error) return auth.error;

    const report = publicReport(auth.row);
    const reportNumber = report.reportNumber ?? allocateReportNumber(id);
    const lang = new URL(request.url).searchParams.get("lang") === "en" ? "en" : "zh";
    const buf = await generateDocx(report.data, reportNumber, path.join(storageRoot, id, "images"), lang);

    // Save to disk and record version
    const dir = path.join(storageRoot, id, "word");
    fs.mkdirSync(dir, { recursive: true });
    const wordPath = path.join(dir, `${randomUUID()}.docx`);
    fs.writeFileSync(wordPath, new Uint8Array(buf));
    const version = addNextVersion(id, reportNumber, wordPath, "word");

    const filename = encodeURIComponent(`${report.data.projectName || (lang === "en" ? "AHU Test Report" : "空调箱测试报告")}.docx`);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
        "X-Version": String(version.version),
        "X-Versions-Json": JSON.stringify(listVersions(id)),
        "Access-Control-Expose-Headers": "X-Version, X-Versions-Json",
      },
    });
  } catch (error) {
    return routeError(error);
  }
}

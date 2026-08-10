import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { authorize, routeError } from "@/lib/api";
import { deleteReport, publicReport, storageRoot, updateReport } from "@/lib/db";
import { scheduleDataSnapshotSync } from "@/lib/persistence";
import type { ReportData } from "@/lib/types";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  const { id } = await context.params; const auth = authorize(request, id); if (auth.error) return auth.error;
  return NextResponse.json({ report: publicReport(auth.row) });
}
export async function PATCH(request: Request, context: Context) {
  try {
    const { id } = await context.params; const auth = authorize(request, id); if (auth.error) return auth.error;
    const data = await request.json() as ReportData;
    return NextResponse.json({ report: updateReport(id, data) });
  } catch (error) { return routeError(error); }
}
export async function DELETE(request: Request, context: Context) {
  const { id } = await context.params; const auth = authorize(request, id); if (auth.error) return auth.error;
  deleteReport(id); fs.rmSync(path.join(storageRoot, id), { recursive: true, force: true });
  scheduleDataSnapshotSync("delete-report-storage");
  return new NextResponse(null, { status: 204 });
}

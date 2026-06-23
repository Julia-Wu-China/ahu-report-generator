import { NextResponse } from "next/server";
import { createId, createToken, hashToken } from "@/lib/auth";
import { createReport } from "@/lib/db";
import { emptyReport } from "@/lib/types";

export const runtime = "nodejs";
export async function POST() {
  const id = createId(); const token = createToken();
  return NextResponse.json({ report: createReport(id, hashToken(token), emptyReport()), token }, { status: 201 });
}

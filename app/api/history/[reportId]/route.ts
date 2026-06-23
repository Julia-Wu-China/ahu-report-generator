import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { deleteClientHistory } from "@/lib/db";

export const runtime = "nodejs";
type Context = { params: Promise<{ reportId: string }> };

export async function DELETE(_: Request, context: Context) {
  const { reportId } = await context.params;
  const store = await cookies();
  const id = store.get("ahu-client")?.value;
  if (id) deleteClientHistory(id, reportId);
  return NextResponse.json({ ok: true });
}

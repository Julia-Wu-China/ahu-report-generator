import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getClientHistory, upsertClientHistory } from "@/lib/db";
import { createId } from "@/lib/auth";

export const runtime = "nodejs";

const COOKIE = "ahu-client";
const COOKIE_OPTS = { maxAge: 60 * 60 * 24 * 3650, path: "/", httpOnly: true, sameSite: "strict" } as const;

export async function GET() {
  const store = await cookies();
  const id = store.get(COOKIE)?.value;
  const history = id ? getClientHistory(id) : [];
  return NextResponse.json({ history });
}

export async function POST(request: Request) {
  const store = await cookies();
  let id = store.get(COOKIE)?.value;
  const isNew = !id;
  if (isNew) id = createId();
  const { reportId, token, name, reportNumber, testDate, updatedAt } = await request.json();
  upsertClientHistory(id!, reportId, token, name ?? "", reportNumber ?? null, testDate ?? null, updatedAt);
  const res = NextResponse.json({ ok: true });
  if (isNew) res.cookies.set(COOKIE, id!, COOKIE_OPTS);
  return res;
}

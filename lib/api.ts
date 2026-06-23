import { NextResponse } from "next/server";
import { bearerToken, tokenMatches } from "./auth";
import { getReportRow } from "./db";

export function authorize(request: Request, id: string) {
  const row = getReportRow(id);
  if (!row) return { error: NextResponse.json({ error: "报告不存在" }, { status: 404 }) };
  if (!tokenMatches(bearerToken(request), row.token_hash)) return { error: NextResponse.json({ error: "编辑链接无效" }, { status: 401 }) };
  return { row };
}
export const routeError = (error: unknown) => {
  console.error(error);
  return NextResponse.json({ error: error instanceof Error ? error.message : "服务器错误" }, { status: 500 });
};

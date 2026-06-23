import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ReportDocument } from "@/components/ReportDocument";
import { getReportRow, publicReport } from "@/lib/db";
import { tokenMatches } from "@/lib/auth";

export const dynamic = "force-dynamic";
export default async function PrintPage({params}:{params:Promise<{id:string}>}){
  const{id}=await params;const row=getReportRow(id);if(!row)notFound();
  const authorization=(await headers()).get("authorization")??"";const token=authorization.startsWith("Bearer ")?authorization.slice(7):"";
  if(!tokenMatches(token,row.token_hash))notFound();const report=publicReport(row);
  return <ReportDocument data={report.data} reportNumber={report.reportNumber}/>;
}

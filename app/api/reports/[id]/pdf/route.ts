import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { authorize, routeError } from "@/lib/api";
import { bearerToken } from "@/lib/auth";
import { addNextVersion, allocateReportNumber, listVersions, publicReport, storageRoot } from "@/lib/db";
import { renderPdf } from "@/lib/chromium";
import { validateReport } from "@/lib/calculations";

export const runtime="nodejs";export const maxDuration=120;
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{const{id}=await params;const auth=authorize(request,id);if(auth.error)return auth.error;const body=await request.json().catch(()=>({}));const report=publicReport(auth.row);const warnings=validateReport(report.data);if(warnings.length&&!body.acknowledgeWarnings)return NextResponse.json({error:"报告含有待确认异常",warnings},{status:409});
    const reportNumber=allocateReportNumber(id);const dir=path.join(storageRoot,id,"pdf");fs.mkdirSync(dir,{recursive:true});const pdfPath=path.join(dir,`${randomUUID()}.pdf`);const origin=new URL(request.url).origin;await renderPdf(`${origin}/print/${id}`,bearerToken(request),pdfPath);if(!fs.existsSync(pdfPath)||fs.statSync(pdfPath).size<1000)throw new Error("PDF生成失败");const version=addNextVersion(id,reportNumber,pdfPath);return NextResponse.json({version,versions:listVersions(id)});
  }catch(error){return routeError(error)}
}

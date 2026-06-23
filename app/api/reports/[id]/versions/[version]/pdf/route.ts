import fs from "node:fs";
import { NextResponse } from "next/server";
import { authorize } from "@/lib/api";
import { getVersion, deleteVersion } from "@/lib/db";
export const runtime = "nodejs";
type Ctx={params:Promise<{id:string;version:string}>};
export async function GET(request:Request,{params}:Ctx){const{id,version}=await params;const auth=authorize(request,id);if(auth.error)return auth.error;const item=getVersion(id,Number(version));if(!item||!fs.existsSync(item.pdf_path))return NextResponse.json({error:"PDF版本不存在"},{status:404});return new NextResponse(fs.readFileSync(item.pdf_path),{headers:{"content-type":"application/pdf","content-disposition":`attachment; filename="${item.report_number}-V${version}.pdf"`,"cache-control":"private, no-store"}})}
export async function DELETE(request:Request,{params}:Ctx){const{id,version}=await params;const auth=authorize(request,id);if(auth.error)return auth.error;const item=getVersion(id,Number(version));if(!item)return NextResponse.json({error:"版本不存在"},{status:404});deleteVersion(id,Number(version));return NextResponse.json({ok:true})}

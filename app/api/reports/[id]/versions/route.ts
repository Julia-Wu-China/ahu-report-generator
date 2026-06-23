import { NextResponse } from "next/server";
import { authorize } from "@/lib/api";
import { listVersions } from "@/lib/db";
export const runtime = "nodejs";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){const{id}=await params;const auth=authorize(request,id);if(auth.error)return auth.error;return NextResponse.json({versions:listVersions(id)})}

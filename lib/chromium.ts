import fs from "node:fs";
import { chromium } from "playwright-core";

export function chromiumPath(){
  const candidates=[process.env.CHROMIUM_PATH,"/usr/bin/chromium","/usr/bin/chromium-browser","C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe","C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"].filter(Boolean) as string[];
  const found=candidates.find(fs.existsSync);if(!found)throw new Error("未找到 Chromium。请设置 CHROMIUM_PATH，或使用项目提供的 Docker 镜像。");return found;
}
export async function renderPdf(url:string,token:string,target:string){
  const browser=await chromium.launch({executablePath:chromiumPath(),headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
  try{const page=await browser.newPage({extraHTTPHeaders:{Authorization:`Bearer ${token}`}});await page.goto(url,{waitUntil:"networkidle",timeout:60000});await page.emulateMedia({media:"print"});await page.pdf({path:target,format:"A4",printBackground:true,preferCSSPageSize:true,margin:{top:"0",right:"0",bottom:"0",left:"0"}})}finally{await browser.close()}
}

import "./globals.css";
export const metadata = { title:"空调箱检测报告", description:"在线填写并生成固定版式检测报告 PDF" };
export default function RootLayout({ children }:{ children:React.ReactNode }) { return <html lang="zh-CN"><body>{children}</body></html>; }

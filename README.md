# 空调箱检测报告生成网站

无需登录的检测报告填写工具。支持自动计算、异常提示、照片拼图裁切、私密编辑链接、自动流水号以及四页固定 A4 PDF 历史版本。

## 本地启动

需要 Node.js 24 和 pnpm。

```powershell
Copy-Item .env.example .env.local
pnpm install
pnpm dev
```

访问 `http://localhost:3000`。首次导出 PDF 时需要本机安装 Chrome/Edge，或在 `.env.local` 中设置 `CHROMIUM_PATH`。

## Docker 部署

```powershell
$env:MEDIA_SECRET = "请替换为足够长的随机字符串"
docker compose up -d --build
```

SQLite、上传图片和 PDF 历史均保存在 `ahu-report-data` 卷中。部署升级前请备份该卷。

## 数据与安全

- 创建报告时会产生 256 位随机编辑令牌；数据库仅保存 SHA-256 哈希。
- 编辑令牌位于浏览器地址的 `#fragment` 中，不会由浏览器自动发送到服务器。
- API 使用 `Authorization: Bearer` 显式提交令牌。
- 图片使用只读 HMAC 签名地址，无法通过图片地址修改报告。
- 每张图片最大 20 MB，每个照片区最多 4 张。

## 常用命令

```powershell
pnpm lint
pnpm test
pnpm build
```

const http = require("http");
const next = require("next");

const port = Number(process.env.PORT || process.argv[2] || 3001);
const hostname = process.env.HOST || "127.0.0.1";
const app = next({ dev: true, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  http
    .createServer((req, res) => handle(req, res))
    .listen(port, hostname, () => {
      console.log(`ready http://${hostname}:${port}`);
    });
});

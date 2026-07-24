const http = require("http");
const { shell } = require("electron");

const CLIENT_ID = "1529308527972192367";
const REDIRECT_URI = "http://127.0.0.1:51823/callback";
const PORT = 51823;

function startOAuthFlow() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
      if (url.pathname !== "/callback") {
        res.writeHead(404);
        res.end();
        return;
      }
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<!doctype html><body style="font-family:sans-serif;background:#0b0b0f;color:#f4f4f6;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
        <div>${error ? "Discord link failed. You can close this window." : "Discord linked! You can close this window."}</div>
      </body>`);

      server.close();
      if (error) reject(new Error(error));
      else if (code) resolve(code);
      else reject(new Error("no code returned"));
    });

    server.listen(PORT, "127.0.0.1", () => {
      const authorizeUrl =
        `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&response_type=code&scope=identify`;
      shell.openExternal(authorizeUrl);
    });

    server.on("error", reject);

    setTimeout(() => {
      server.close();
      reject(new Error("timed out waiting for Discord authorization"));
    }, 120000);
  });
}

module.exports = { startOAuthFlow };

// 로컬에서 dist 폴더의 HTML/CSS/JS를 확인하기 위한 작은 정적 파일 서버입니다.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";

// 상대 경로가 흔들리지 않도록 현재 작업 폴더의 dist를 절대 경로로 바꿉니다.
const root = resolve("dist");

createServer(async (req, res) => {
  try {
    // 루트 주소는 index.html로 연결하고 URL의 한글/공백 문자를 원래 파일명으로 풉니다.
    const url = new URL(req.url, "http://localhost");
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = resolve(root, `.${decodeURIComponent(pathname)}`);

    // ../ 같은 경로로 dist 밖의 파일을 읽으려는 요청은 404로 처리합니다.
    if (!file.startsWith(root + sep)) throw Error("dist 밖의 경로입니다.");

    // 브라우저가 파일 종류를 올바르게 해석하도록 확장자별 Content-Type을 지정합니다.
    const mimeTypes = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
    };
    const content = await readFile(file);
    res.writeHead(200, {
      "Content-Type": mimeTypes[extname(file)] || "application/octet-stream",
      // 코드 수정 결과를 새로고침 즉시 확인하기 위해 로컬 캐시를 사용하지 않습니다.
      "Cache-Control": "no-store",
    });
    res.end(content);
  } catch {
    // 존재하지 않거나 허용되지 않은 파일에는 내부 경로를 노출하지 않습니다.
    res.writeHead(404);
    res.end("Not found");
  }
}).listen(4186, "127.0.0.1", () => {
  // 외부 네트워크가 아닌 이 컴퓨터에서만 접속할 수 있는 미리보기 주소입니다.
  console.log("Local: http://127.0.0.1:4186");
});


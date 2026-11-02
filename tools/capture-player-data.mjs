// Minecraft BE から送られてくる生データを、加工せずにファイルへ保存する（依存パッケージなし）
// 使い方: node tools/capture-player-data.mjs [--port 30000] [--out captures] [--limit 300]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    port: { type: 'string', default: '30000' },
    out: { type: 'string', default: 'captures' },
    limit: { type: 'string', default: '300' },
  },
});

const port = Number(values.port);
const limit = Number(values.limit);
const startedAt = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.resolve(values.out);
const logPath = path.join(outDir, `capture-${startedAt}.jsonl`);
const latestPath = path.join(outDir, 'latest.json');

fs.mkdirSync(outDir, { recursive: true });

let saved = 0;
let received = 0;

const tryParseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    received++;
    const rawBody = Buffer.concat(chunks).toString('utf8');
    const record = {
      receivedAt: new Date().toISOString(),
      method: req.method,
      url: req.url,
      remoteAddress: req.socket.remoteAddress,
      headers: req.headers,
      rawBody,
      json: tryParseJson(rawBody),
    };

    fs.writeFileSync(latestPath, JSON.stringify(record, null, 2));
    if (saved < limit) {
      fs.appendFileSync(logPath, JSON.stringify(record) + '\n');
      saved++;
      if (saved === limit) console.log(`保存上限 ${limit} 件に到達（latest.json の更新は継続）`);
    }
    process.stdout.write(`\r受信 ${received} 件 / 保存 ${saved} 件`);

    // 本来の backend と同じ応答を返し、送信側にエラーを出させない
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
  });
});

server.on('error', (err) => {
  console.error(`起動失敗: ${err.message}`);
  process.exit(1);
});

server.listen(port, () => {
  console.log(`ポート ${port} で待ち受け中`);
  console.log(`保存先: ${logPath}（最大 ${limit} 件）`);
  console.log(`最新の 1 件: ${latestPath}`);
  console.log('Ctrl+C で終了');
});

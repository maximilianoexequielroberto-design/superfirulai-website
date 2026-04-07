import http from "http";
import fs from "fs/promises";
import { createReadStream } from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = __dirname;
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".sql": "text/plain; charset=utf-8"
};

const API_ROUTES = new Map([
  ["/api/community-stats", "./api/community-stats.js"],
  ["/api/telegram/verify", "./api/telegram/verify.js"],
  ["/api/Telegram/verify", "./api/telegram/verify.js"],
  ["/api/airdrop/nonce", "./api/airdrop/nonce.js"],
  ["/api/airdrop/register", "./api/airdrop/register.js"],
  ["/api/airdrop/claim-status", "./api/airdrop/claim-status.js"],
  ["/api/round/config", "./api/round/config.js"],
  ["/api/round/history", "./api/round/history.js"],
  ["/api/round/register", "./api/round/register.js"],
  ["/api/round-register", "./api/round-register.js"],
  ["/api/x/login", "./api/x/login.js"],
  ["/api/x/callback", "./api/x/callback.js"],
  ["/api/x/verify-follow", "./api/x/verify-follow.js"]
]);

function buildReqHelpers(nodeReq, parsedUrl, body) {
  const query = {};
  for (const [key, value] of parsedUrl.searchParams.entries()) {
    if (Object.prototype.hasOwnProperty.call(query, key)) {
      query[key] = Array.isArray(query[key]) ? [...query[key], value] : [query[key], value];
    } else {
      query[key] = value;
    }
  }

  nodeReq.query = query;
  nodeReq.body = body;
  nodeReq.path = parsedUrl.pathname;
  return nodeReq;
}

function enhanceRes(nodeRes) {
  nodeRes.status = function status(code) {
    nodeRes.statusCode = code;
    return nodeRes;
  };

  nodeRes.json = function json(payload) {
    if (!nodeRes.headersSent && !nodeRes.getHeader("Content-Type")) {
      nodeRes.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    nodeRes.end(JSON.stringify(payload));
    return nodeRes;
  };

  nodeRes.send = function send(payload) {
    if (payload == null) {
      nodeRes.end("");
      return nodeRes;
    }

    if (Buffer.isBuffer(payload)) {
      nodeRes.end(payload);
      return nodeRes;
    }

    if (typeof payload === "object") {
      return nodeRes.json(payload);
    }

    if (!nodeRes.headersSent && !nodeRes.getHeader("Content-Type")) {
      nodeRes.setHeader("Content-Type", "text/plain; charset=utf-8");
    }
    nodeRes.end(String(payload));
    return nodeRes;
  };

  return nodeRes;
}

async function readRequestBody(req) {
  if (["GET", "HEAD"].includes(String(req.method || "GET").toUpperCase())) {
    return undefined;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (!chunks.length) return undefined;

  const raw = Buffer.concat(chunks).toString("utf8");
  const contentType = String(req.headers["content-type"] || "").toLowerCase();

  if (contentType.includes("application/json")) {
    try {
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(raw);
    return Object.fromEntries(params.entries());
  }

  return raw;
}

async function loadHandler(relativePath) {
  const url = pathToFileURL(path.resolve(ROOT_DIR, relativePath)).href;
  const mod = await import(url);
  return mod?.default;
}

function safeJoin(root, requestedPath) {
  const resolved = path.resolve(root, `.${requestedPath}`);
  if (!resolved.startsWith(root)) return null;
  return resolved;
}

async function serveStatic(req, res, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = safeJoin(ROOT_DIR, requestedPath);

  if (!filePath) {
    res.statusCode = 403;
    return res.end("Forbidden");
  }

  let stats;
  try {
    stats = await fs.stat(filePath);
  } catch {
    if (!path.extname(requestedPath)) {
      const fallback = path.join(ROOT_DIR, "index.html");
      try {
        await fs.access(fallback);
        res.statusCode = 200;
        res.setHeader("Content-Type", MIME_TYPES[".html"]);
        return createReadStream(fallback).pipe(res);
      } catch {
        res.statusCode = 404;
        return res.end("Not Found");
      }
    }
    res.statusCode = 404;
    return res.end("Not Found");
  }

  if (stats.isDirectory()) {
    res.statusCode = 403;
    return res.end("Forbidden");
  }

  const ext = path.extname(filePath).toLowerCase();
  res.statusCode = 200;
  res.setHeader("Content-Type", MIME_TYPES[ext] || "application/octet-stream");
  return createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = decodeURIComponent(requestUrl.pathname);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (API_ROUTES.has(pathname)) {
    try {
      const body = await readRequestBody(req);
      const handler = await loadHandler(API_ROUTES.get(pathname));
      if (typeof handler !== "function") {
        throw new Error(`Invalid handler for ${pathname}`);
      }
      const wrappedReq = buildReqHelpers(req, requestUrl, body);
      const wrappedRes = enhanceRes(res);
      await handler(wrappedReq, wrappedRes);
      if (!res.writableEnded) {
        res.end();
      }
      return;
    } catch (error) {
      console.error(`API error on ${pathname}`, error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
      }
      if (!res.writableEnded) {
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }));
      }
      return;
    }
  }

  return serveStatic(req, res, pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`SuperFirulai server listening on http://${HOST}:${PORT}`);
});

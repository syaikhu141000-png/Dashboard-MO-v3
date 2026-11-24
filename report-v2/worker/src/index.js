// Cloudflare Worker: report-v2-api
// Khas untuk page public "Report Marketing V2" (https://syaikhu141000-png.github.io/Dashboard-MO-v3/report-v2/)
// SAHAJA — tiada kaitan dengan "MO Dashboard" (mo2-dashboard, monitor iklan Meta Ads harian), itu sistem berasingan.
//
//  GET  /api/rv2/state    -> kunci STATIC + catatan { locks, notes }
//  POST /api/rv2/check    -> semak password edit (header X-RV2-Password)  -> {ok:true/false}
//  POST /api/rv2/lock     -> tulis/padam SATU kunci STATIC (header X-RV2-Password wajib)
//                            body {"doc_id":"Facebook_2026-11-3","data":{...}} atau {"doc_id":"...","delete":true}
//  POST /api/rv2/note     -> tulis SATU catatan (header X-RV2-Password wajib)  body {"key":"Facebook_2026_W11-3","data":{...}}
//  GET  /api/rv2/meta     -> cache spend/lead Meta mingguan {at,ver,weeks} (public, read-only)
//  POST /api/rv2/meta     -> cantum (merge) minggu baru ke cache meta (header X-RV2-Password wajib)  body {"weeks":{"11-3":{...}}}
//  GET  /api/rv2/sources  -> link Google Sheet CC5/CC2 ikut tahun {cc5:{"2027":"<fileId>"},cc2:{...}} (public, read-only)
//  POST /api/rv2/sources  -> tambah/tukar SATU link (header X-RV2-Password wajib)  body {"kind":"cc5"|"cc2","year":2027,"id":"..."} atau {"kind":"cc5","year":2027,"delete":true}
//  GET  /api/health       -> semakan ringkas
//
// Binding: KV (namespace), RV2_PASSWORD (secret)

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type,x-rv2-password" };
const MAX_RV2_NOTE = 4000, MAX_RV2_KEY = 120, MAX_RV2_BYTES = 5 * 1024 * 1024;

const json = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), { status, headers: { ...JSON_HEADERS, ...CORS, ...extra } });

function rv2Auth(env, req) {
  const pw = req.headers.get("x-rv2-password") || "";
  return !!env.RV2_PASSWORD && pw.length > 0 && pw === env.RV2_PASSWORD;
}

async function rv2State(env) {
  const locks = JSON.parse((await env.KV.get("rv2:locks")) || "{}");
  const notes = JSON.parse((await env.KV.get("rv2:notes")) || "{}");
  return { locks, notes };
}

async function rv2Lock(env, req) {
  if (!rv2Auth(env, req)) return json({ error: "Password salah." }, 401);
  let body;
  try { body = await req.json(); } catch { return json({ error: "Body mesti JSON." }, 400); }
  const doc_id = String(body.doc_id || "").trim();
  if (!doc_id || doc_id.length > MAX_RV2_KEY) return json({ error: "doc_id tak sah." }, 400);
  const locks = JSON.parse((await env.KV.get("rv2:locks")) || "{}");
  if (body.delete) delete locks[doc_id];
  else {
    if (!body.data || typeof body.data !== "object") return json({ error: "data wajib (objek)." }, 400);
    locks[doc_id] = { ...body.data, at: new Date().toISOString(), src: body.data.src || "edit public (password)" };
  }
  const out = JSON.stringify(locks);
  if (out.length > MAX_RV2_BYTES) return json({ error: "Storan locks penuh." }, 413);
  await env.KV.put("rv2:locks", out);
  return json({ ok: true, doc_id, deleted: !!body.delete });
}

async function rv2Note(env, req) {
  if (!rv2Auth(env, req)) return json({ error: "Password salah." }, 401);
  let body;
  try { body = await req.json(); } catch { return json({ error: "Body mesti JSON." }, 400); }
  const key = String(body.key || "").trim();
  if (!key || key.length > MAX_RV2_KEY) return json({ error: "key tak sah." }, 400);
  if (!body.data || typeof body.data !== "object") return json({ error: "data wajib (objek)." }, 400);
  if (JSON.stringify(body.data).length > MAX_RV2_NOTE) return json({ error: `data terlalu panjang (max ${MAX_RV2_NOTE} aksara).` }, 400);
  const notes = JSON.parse((await env.KV.get("rv2:notes")) || "{}");
  const hasText = Object.keys(body.data).some((k) => k !== "key" && k !== "at" && String(body.data[k] || "").trim());
  if (!hasText) delete notes[key];
  else notes[key] = { ...body.data, key, at: new Date().toISOString() };
  const out = JSON.stringify(notes);
  if (out.length > MAX_RV2_BYTES) return json({ error: "Storan notes penuh." }, 413);
  await env.KV.put("rv2:notes", out);
  return json({ ok: true, key });
}

async function rv2Meta(env, req) {
  if (req.method === "GET") {
    const meta = JSON.parse((await env.KV.get("rv2:meta")) || '{"at":null,"ver":null,"weeks":{}}');
    return json(meta);
  }
  if (!rv2Auth(env, req)) return json({ error: "Password salah." }, 401);
  let body;
  try { body = await req.json(); } catch { return json({ error: "Body mesti JSON." }, 400); }
  const cur = JSON.parse((await env.KV.get("rv2:meta")) || '{"at":null,"ver":null,"weeks":{}}');
  const weeks = { ...(cur.weeks || {}) };
  if (body.weeks && typeof body.weeks === "object") {
    for (const k in body.weeks) { if (/^\d{1,2}-[1-4]$/.test(k)) weeks[k] = body.weeks[k]; }
  }
  const out = { at: new Date().toISOString(), ver: body.ver || cur.ver || null, weeks };
  const str = JSON.stringify(out);
  if (str.length > MAX_RV2_BYTES) return json({ error: "Storan meta penuh." }, 413);
  await env.KV.put("rv2:meta", str);
  return json({ ok: true, weeks: Object.keys(weeks).length });
}

async function rv2Sources(env, req) {
  if (req.method === "GET") {
    const sources = JSON.parse((await env.KV.get("rv2:sources")) || '{"cc5":{},"cc2":{}}');
    return json(sources);
  }
  if (!rv2Auth(env, req)) return json({ error: "Password salah." }, 401);
  let body;
  try { body = await req.json(); } catch { return json({ error: "Body mesti JSON." }, 400); }
  const kind = String(body.kind || "");
  if (kind !== "cc5" && kind !== "cc2") return json({ error: "kind mesti 'cc5' atau 'cc2'." }, 400);
  const year = parseInt(body.year, 10);
  if (!(year >= 2020 && year <= 2100)) return json({ error: "year tak sah." }, 400);
  const cur = JSON.parse((await env.KV.get("rv2:sources")) || '{"cc5":{},"cc2":{}}');
  cur.cc5 = cur.cc5 || {}; cur.cc2 = cur.cc2 || {};
  if (body.delete) delete cur[kind][String(year)];
  else {
    const id = String(body.id || "").trim();
    if (!/^[a-zA-Z0-9_-]{20,}$/.test(id)) return json({ error: "id Google Sheet tak sah." }, 400);
    cur[kind][String(year)] = id;
  }
  const out = JSON.stringify(cur);
  if (out.length > MAX_RV2_BYTES) return json({ error: "Storan sources penuh." }, 413);
  await env.KV.put("rv2:sources", out);
  return json({ ok: true, kind, year, deleted: !!body.delete });
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const p = url.pathname.replace(/\/+$/, "") || "/";
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

    if (p === "/" || p === "/api/health") return json({ ok: true, service: "report-v2-api" });
    if (p === "/api/rv2/state" && req.method === "GET") return json(await rv2State(env));
    if (p === "/api/rv2/check" && req.method === "POST") return json({ ok: rv2Auth(env, req) });
    if (p === "/api/rv2/lock" && req.method === "POST") return rv2Lock(env, req);
    if (p === "/api/rv2/note" && req.method === "POST") return rv2Note(env, req);
    if (p === "/api/rv2/meta" && (req.method === "GET" || req.method === "POST")) return rv2Meta(env, req);
    if (p === "/api/rv2/sources" && (req.method === "GET" || req.method === "POST")) return rv2Sources(env, req);

    return json({ error: "Tidak dijumpai", routes: ["/api/health", "/api/rv2/state", "/api/rv2/check", "/api/rv2/lock", "/api/rv2/note", "/api/rv2/meta", "/api/rv2/sources"] }, 404);
  },
};

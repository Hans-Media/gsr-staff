/**
 * /api/data — baca 26 sheet CRM LANGSUNG via Google Sheets API (TANPA Apps Script).
 * =========================================================
 * - Pakai Google Sheets API v4 batchGet: 1 request per spreadsheet (ambil 12 tab
 *   sekaligus) → total 26 request, ringan & cepat.
 * - Kredensial di ENV Cloudflare (BUKAN di repo):
 *     GOOGLE_API_KEY = API key (Sheets API di-enable)
 *     SHEETS_JSON    = {"Hans":{"2025":"id","2026":"id"}, ...}  (peta pic->tahun->fileId)
 * - Route di-gate PIN oleh functions/_middleware.js. Hasilnya di-cache 5 menit di edge.
 * - Function ini SENGAJA ringan: cuma fetch + gabung teks mentah (tanpa parse berat),
 *   normalisasi dilakukan di browser (index.html) supaya aman dari limit CPU Worker.
 *
 * Syarat: 26 sheet (atau folder CRM GSR) di-share "Siapa saja yang punya link → Pelihat"
 * supaya bisa dibaca API key. File ID tetap rahasia (cuma ada di ENV, bukan di repo).
 */
const MONTHS = ["JANUARI","FEBRUARI","MARET","APRIL","MEI","JUNI","JULI","AGUSTUS","SEPTEMBER","OKTOBER","NOVEMBER","DESEMBER"];

export async function onRequest(context) {
  const { env, request } = context;
  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url).origin + "/__api_data_cache", { method: "GET" });

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const key = env.GOOGLE_API_KEY;
  if (!key) return json({ error: "GOOGLE_API_KEY belum di-set di Cloudflare." }, 500);
  let sheets;
  try { sheets = JSON.parse(env.SHEETS_JSON || "{}"); }
  catch (e) { return json({ error: "SHEETS_JSON tidak valid (harus JSON)." }, 500); }

  const tasks = [];
  for (const pic of Object.keys(sheets)) {
    const years = sheets[pic];
    for (const y of Object.keys(years)) {
      const id = years[y];
      const ranges = MONTHS.map(m => "ranges=" + encodeURIComponent(m + "!A4:X")).join("&");
      const url = "https://sheets.googleapis.com/v4/spreadsheets/" + id +
        "/values:batchGet?" + ranges +
        "&majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE&key=" + key;
      tasks.push({ pic, year: y, url });
    }
  }

  const settled = await Promise.allSettled(
    tasks.map(t => fetch(t.url).then(r => r.ok ? r.text() : Promise.reject(r.status)))
  );

  const parts = [];
  const errors = [];
  settled.forEach((res, i) => {
    const t = tasks[i];
    if (res.status === "fulfilled") {
      parts.push('{"pic":' + JSON.stringify(t.pic) + ',"year":' + t.year + ',"v":' + res.value + '}');
    } else {
      errors.push(t.pic + " " + t.year + " (HTTP " + res.reason + ")");
    }
  });

  const body = '{"generated":"' + new Date().toISOString() + '",' +
    '"errors":' + JSON.stringify(errors) + ',' +
    '"sheets":[' + parts.join(",") + "]}";

  const resp = new Response(body, {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
  context.waitUntil(cache.put(cacheKey, resp.clone()));
  return resp;
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

/**
 * /api/data — proxy aman ke aggregator Apps Script.
 * =========================================================
 * - URL aggregator disimpan sebagai ENV VAR `AGG_URL` di Cloudflare
 *   (Settings → Environment variables), TIDAK ditaruh di repo.
 * - Route ini sudah di-gate PIN oleh functions/_middleware.js, jadi
 *   hanya sesi yang lolos PIN yang bisa menariknya.
 * - Dashboard fetch "/api/data" (same-origin) → tidak ada masalah CORS,
 *   dan data konsumen (No HP) tidak pernah ada di repo public.
 *
 * Set di Cloudflare: Pages project → Settings → Environment variables →
 *   Production: AGG_URL = https://script.google.com/macros/s/XXXX/exec
 */
export async function onRequest(context) {
  const { env } = context;
  const src = env && env.AGG_URL;
  if (!src) {
    return json({ error: "AGG_URL belum di-set di Cloudflare (Settings → Environment variables)." }, 500);
  }
  try {
    const r = await fetch(src, { cf: { cacheTtl: 120, cacheEverything: true } });
    const body = await r.text();
    return new Response(body, {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=120" },
    });
  } catch (e) {
    return json({ error: "Gagal ambil data aggregator", detail: String(e) }, 502);
  }
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

/**
 * Database Konsumen GSR — PIN gate (Cloudflare Pages Function)
 * =========================================================
 * - PIN BEDA per marketing → tiap PIN menentukan siapa yang login
 *   (dashboard langsung ke-scope ke data marketing itu; admin lihat semua).
 * - Sesi WAJIB PIN ulang tiap 8 JAM (absolut sejak login). Di-refresh atau
 *   tidak, begitu lewat 8 jam cookie tidak valid → form PIN muncul lagi.
 * - HTML dashboard TIDAK dikirim sebelum PIN benar (aman dari DevTools).
 * - Setiap login sukses dicatat ke D1 (kalau binding DB ada).
 *
 * GANTI PIN: edit map PINS di bawah (angka bebas, unik per orang) → commit.
 * GANTI durasi sesi: ubah SESSION_HOURS.
 */

const SESSION_HOURS = 8;
const SECRET = "gsr-konsumen-2026-x7Qp";   // ganti kalau mau; dipakai tanda tangan token

// PIN -> identitas. Nilai = username marketing (huruf kecil, samakan dgn kolom PIC),
// atau "admin" untuk supervisor (lihat semua tim). GANTI angka-angka ini.
const PINS = {
  "41072": "hans",     // admin/owner boleh pakai "admin" kalau mau lihat semua
  "58310": "admin",    // supervisor — semua tim
  "20461": "warih",
  "73925": "abi",
  "16840": "dewa",
  "39517": "nisa",
  "84203": "antok",
  "50968": "indri",
  "27154": "oca",
  "61472": "sekar",
  "38790": "adi",
  "95316": "intan",
  "42687": "jeje",
  "70423": "putu",
  "13958": "fadhil",
  "86201": "syahrul",
};

const COOKIE = "gsr_gate";
const WHO_COOKIE = "gsr_who";

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);

  // Logout
  if (url.pathname === "/logout") {
    return new Response(loginPage(""), {
      status: 401,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Set-Cookie": `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
      },
    });
  }

  // Submit PIN
  if (request.method === "POST" && url.pathname === "/") {
    const form = await request.formData();
    const pin = (form.get("pin") || "").toString().trim();
    const who = PINS[pin];
    if (who) {
      const token = await sign(who);
      const maxAge = SESSION_HOURS * 3600;
      const res = await next();                // sajikan dashboard
      const h = new Headers(res.headers);
      h.append("Set-Cookie", `${COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`);
      // cookie identitas dibaca oleh dashboard (bukan HttpOnly), umur sama
      h.append("Set-Cookie", `${WHO_COOKIE}=${who}; Path=/; Max-Age=${maxAge}; Secure; SameSite=Lax`);
      logLogin(context, pin, who);
      return new Response(res.body, { status: res.status, headers: h });
    }
    return new Response(loginPage("PIN salah. Coba lagi."), {
      status: 401, headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // Cek cookie untuk semua request lain
  const cookies = parseCookies(request.headers.get("Cookie") || "");
  const valid = await verify(cookies[COOKIE]);
  if (valid) return next();

  // Belum/kadaluarsa → minta PIN (jangan kirim dashboard)
  return new Response(loginPage(""), {
    status: 401,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // bersihkan cookie basi
      "Set-Cookie": `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}

/* ---------- token bertanda tangan + kadaluarsa 8 jam absolut ---------- */
async function sign(who) {
  const iat = Date.now();
  const body = `${iat}.${who}`;
  const sig = await hmac(body);
  return `${body}.${sig}`;
}
async function verify(token) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [iatStr, who, sig] = parts;
  const good = await hmac(`${iatStr}.${who}`);
  if (sig !== good) return null;
  const iat = parseInt(iatStr, 10);
  if (!iat) return null;
  if (Date.now() - iat > SESSION_HOURS * 3600 * 1000) return null;  // absolut, tak diperpanjang refresh
  return who;
}
async function hmac(msg) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const buf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/[^a-zA-Z0-9]/g, "").slice(0, 24);
}

function parseCookies(str) {
  const o = {};
  str.split(";").forEach(p => { const i = p.indexOf("="); if (i > -1) o[p.slice(0, i).trim()] = p.slice(i + 1).trim(); });
  return o;
}

/* ---------- log ke D1 (opsional; aman kalau binding DB belum ada) ---------- */
function logLogin(context, pin, who) {
  try {
    const { env, request } = context;
    if (!env || !env.DB) return;
    const cf = request.cf || {};
    const ip = request.headers.get("CF-Connecting-IP") || "";
    const ua = request.headers.get("User-Agent") || "";
    const waktu = new Date().toISOString();
    context.waitUntil(
      env.DB.prepare("INSERT INTO logins (waktu, pin, who, ip, negara, kota, device) VALUES (?,?,?,?,?,?,?)")
        .bind(waktu, pin, who, ip, cf.country || "", cf.city || "", ua).run().catch(() => {})
    );
  } catch (e) {}
}

/* ---------- halaman PIN ---------- */
function loginPage(err) {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Database Konsumen GSR — Masuk</title>
<style>
:root{color-scheme:light dark}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
background:#0f1620;color:#e7edf3;padding:24px}
.card{width:100%;max-width:360px;background:#18222e;border:1px solid #26323f;border-radius:16px;padding:30px 26px;box-shadow:0 20px 50px rgba(0,0,0,.4)}
h1{font-size:19px;margin:0 0 4px}
p{color:#93a2b1;font-size:13px;margin:0 0 20px}
label{display:block;font-size:12px;color:#93a2b1;margin-bottom:6px}
input{width:100%;padding:13px 14px;font-size:20px;letter-spacing:.3em;text-align:center;border-radius:10px;
border:1px solid #2c3a49;background:#0f1620;color:#e7edf3;outline:none}
input:focus{border-color:#3b82f6}
button{width:100%;margin-top:16px;padding:13px;font-size:15px;font-weight:700;border:0;border-radius:10px;
background:#2563eb;color:#fff;cursor:pointer}
button:hover{background:#1d4ed8}
.err{color:#f87171;font-size:12.5px;font-weight:600;min-height:18px;margin-top:10px;text-align:center}
.foot{margin-top:16px;font-size:11px;color:#5b6b7a;text-align:center;line-height:1.6}
</style></head><body>
<form class="card" method="POST" action="/">
  <h1>Database Konsumen GSR</h1>
  <p>Masukkan PIN kamu untuk masuk.</p>
  <label for="pin">PIN</label>
  <input id="pin" name="pin" type="password" inputmode="numeric" autocomplete="off" autofocus placeholder="•••••">
  <button type="submit">Masuk</button>
  <div class="err">${err}</div>
  <div class="foot">Sesi otomatis terkunci tiap ${SESSION_HOURS} jam — PIN wajib dimasukkan ulang.</div>
</form>
<script>document.getElementById("pin").focus();</script>
</body></html>`;
}

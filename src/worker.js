const SESSION_DAYS = 30;
const PASSWORD_ITERATIONS = 120000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      // -----------------------------
      // TEST DATABASE
      // -----------------------------
      if (url.pathname === "/api/test-db") {
        const result = await env.DB
          .prepare("SELECT 1 AS connected")
          .first();

        return json({
          success: true,
          database: result?.connected === 1
        });
      }

      // -----------------------------
      // AUTH API
      // -----------------------------
      if (url.pathname.startsWith("/api/auth/")) {
        return await handleAuth(request, env, url);
      }

      // -----------------------------
      // ADMIN BOOTSTRAP
      // -----------------------------
      if (url.pathname === "/api/admin/bootstrap") {
        return await handleAdminBootstrap(request, env);
      }

      // -----------------------------
      // STATIC ASSETS
      // -----------------------------
      return env.ASSETS.fetch(request);

    } catch (error) {
      console.error(error);

      return json(
        {
          success: false,
          error: "خطای داخلی سرور"
        },
        500
      );
    }
  }
};


// ============================================================
// AUTH ROUTES
// ============================================================

async function handleAuth(request, env, url) {
  const method = request.method;

  if (url.pathname === "/api/auth/register" && method === "POST") {
    return register(request, env);
  }

  if (url.pathname === "/api/auth/login" && method === "POST") {
    return login(request, env);
  }

  if (url.pathname === "/api/auth/logout" && method === "POST") {
    return logout(request, env);
  }

  if (url.pathname === "/api/auth/me" && method === "GET") {
    return getCurrentUser(request, env);
  }

  return json(
    {
      success: false,
      error: "مسیر API پیدا نشد"
    },
    404
  );
}


// ============================================================
// REGISTER
// ============================================================

async function register(request, env) {
  const body = await readJson(request);

  const fullName = cleanText(body.full_name, 100);
  const phone = normalizePhone(body.phone);
  const password = String(body.password || "");

  if (!fullName) {
    return json(
      {
        success: false,
        error: "نام و نام خانوادگی الزامی است"
      },
      400
    );
  }

  if (!isValidPhone(phone)) {
    return json(
      {
        success: false,
        error: "شماره تلفن معتبر نیست"
      },
      400
    );
  }

  if (password.length < 8) {
    return json(
      {
        success: false,
        error: "رمز عبور باید حداقل ۸ کاراکتر باشد"
      },
      400
    );
  }

  const existing = await env.DB
    .prepare("SELECT id FROM users WHERE phone = ? LIMIT 1")
    .bind(phone)
    .first();

  if (existing) {
    return json(
      {
        success: false,
        error: "این شماره تلفن قبلاً ثبت شده است"
      },
      409
    );
  }

  const passwordData = await hashPassword(password);

  const result = await env.DB
    .prepare(`
      INSERT INTO users
      (
        full_name,
        phone,
        password_hash,
        password_salt,
        role,
        is_active
      )
      VALUES (?, ?, ?, ?, 'user', 1)
    `)
    .bind(
      fullName,
      phone,
      passwordData.hash,
      passwordData.salt
    )
    .run();

  if (!result.success) {
    return json(
      {
        success: false,
        error: "ساخت حساب انجام نشد"
      },
      500
    );
  }

  const user = await env.DB
    .prepare(`
      SELECT id, full_name, phone, role, is_active, created_at
      FROM users
      WHERE phone = ?
      LIMIT 1
    `)
    .bind(phone)
    .first();

  const session = await createSession(env, user.id);

  return json(
    {
      success: true,
      message: "حساب با موفقیت ساخته شد",
      user: {
        id: user.id,
        full_name: user.full_name,
        phone: user.phone,
        role: user.role
      }
    },
    201,
    {
      "Set-Cookie": buildSessionCookie(session.token, session.expires)
    }
  );
}


// ============================================================
// LOGIN
// ============================================================

async function login(request, env) {
  const body = await readJson(request);

  const phone = normalizePhone(body.phone);
  const password = String(body.password || "");

  if (!isValidPhone(phone) || !password) {
    return json(
      {
        success: false,
        error: "شماره تلفن یا رمز عبور نادرست است"
      },
      401
    );
  }

  const user = await env.DB
    .prepare(`
      SELECT
        id,
        full_name,
        phone,
        password_hash,
        password_salt,
        role,
        is_active,
        created_at
      FROM users
      WHERE phone = ?
      LIMIT 1
    `)
    .bind(phone)
    .first();

  if (!user || user.is_active !== 1) {
    return json(
      {
        success: false,
        error: "شماره تلفن یا رمز عبور نادرست است"
      },
      401
    );
  }

  const validPassword = await verifyPassword(
    password,
    user.password_hash,
    user.password_salt
  );

  if (!validPassword) {
    return json(
      {
        success: false,
        error: "شماره تلفن یا رمز عبور نادرست است"
      },
      401
    );
  }

  const session = await createSession(env, user.id);

  return json(
    {
      success: true,
      message: "ورود موفق بود",
      user: {
        id: user.id,
        full_name: user.full_name,
        phone: user.phone,
        role: user.role
      }
    },
    200,
    {
      "Set-Cookie": buildSessionCookie(
        session.token,
        session.expires
      )
    }
  );
}


// ============================================================
// LOGOUT
// ============================================================

async function logout(request, env) {
  const token = getSessionToken(request);

  if (token) {
    const tokenHash = await sha256Base64Url(token);

    await env.DB
      .prepare("DELETE FROM sessions WHERE token_hash = ?")
      .bind(tokenHash)
      .run();
  }

  return json(
    {
      success: true,
      message: "از حساب خارج شدید"
    },
    200,
    {
      "Set-Cookie": clearSessionCookie()
    }
  );
}


// ============================================================
// CURRENT USER
// ============================================================

async function getCurrentUser(request, env) {
  const user = await getAuthenticatedUser(request, env);

  if (!user) {
    return json(
      {
        success: false,
        authenticated: false
      },
      401
    );
  }

  return json({
    success: true,
    authenticated: true,
    user: {
      id: user.id,
      full_name: user.full_name,
      phone: user.phone,
      role: user.role,
      created_at: user.created_at
    }
  });
}


// ============================================================
// ADMIN BOOTSTRAP
// ============================================================

async function handleAdminBootstrap(request, env) {
  if (request.method !== "POST") {
    return json(
      {
        success: false,
        error: "Method Not Allowed"
      },
      405
    );
  }

  /*
    این مسیر فقط برای ساخت اولین ادمین است.

    قبل از استفاده باید در Cloudflare یک Secret
    با نام ADMIN_SETUP_KEY ساخته شود.

    این مقدار هرگز داخل GitHub قرار نمی‌گیرد.
  */

  if (!env.ADMIN_SETUP_KEY) {
    return json(
      {
        success: false,
        error: "ADMIN_SETUP_KEY تنظیم نشده است"
      },
      500
    );
  }

  const setupKey = request.headers.get("X-Setup-Key");

  if (!setupKey || setupKey !== env.ADMIN_SETUP_KEY) {
    return json(
      {
        success: false,
        error: "کلید دسترسی نامعتبر است"
      },
      403
    );
  }

  const existingAdmin = await env.DB
    .prepare(`
      SELECT id
      FROM users
      WHERE role = 'admin'
      LIMIT 1
    `)
    .first();

  if (existingAdmin) {
    return json(
      {
        success: false,
        error: "حساب ادمین قبلاً ساخته شده است"
      },
      409
    );
  }

  const body = await readJson(request);

  const fullName = cleanText(body.full_name, 100);
  const phone = normalizePhone(body.phone);
  const password = String(body.password || "");

  if (!fullName) {
    return json(
      {
        success: false,
        error: "نام و نام خانوادگی الزامی است"
      },
      400
    );
  }

  if (!isValidPhone(phone)) {
    return json(
      {
        success: false,
        error: "شماره تلفن معتبر نیست"
      },
      400
    );
  }

  if (password.length < 8) {
    return json(
      {
        success: false,
        error: "رمز عبور باید حداقل ۸ کاراکتر باشد"
      },
      400
    );
  }

  const existingUser = await env.DB
    .prepare("SELECT id FROM users WHERE phone = ? LIMIT 1")
    .bind(phone)
    .first();

  if (existingUser) {
    return json(
      {
        success: false,
        error: "این شماره تلفن قبلاً در سیستم وجود دارد"
      },
      409
    );
  }

  const passwordData = await hashPassword(password);

  const result = await env.DB
    .prepare(`
      INSERT INTO users
      (
        full_name,
        phone,
        password_hash,
        password_salt,
        role,
        is_active
      )
      VALUES (?, ?, ?, ?, 'admin', 1)
    `)
    .bind(
      fullName,
      phone,
      passwordData.hash,
      passwordData.salt
    )
    .run();

  if (!result.success) {
    return json(
      {
        success: false,
        error: "ساخت حساب ادمین انجام نشد"
      },
      500
    );
  }

  return json({
    success: true,
    message: "اولین حساب ادمین با موفقیت ساخته شد"
  }, 201);
}


// ============================================================
// SESSION
// ============================================================

async function createSession(env, userId) {
  const tokenBytes = crypto.getRandomValues(
    new Uint8Array(32)
  );

  const token = bytesToBase64Url(tokenBytes);

  const tokenHash = await sha256Base64Url(token);

  const expiresDate = new Date(
    Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000
  );

  const expires = expiresDate.toISOString();

  await env.DB
    .prepare(`
      INSERT INTO sessions
      (
        user_id,
        token_hash,
        expires_at
      )
      VALUES (?, ?, ?)
    `)
    .bind(
      userId,
      tokenHash,
      expires
    )
    .run();

  return {
    token,
    expires
  };
}


async function getAuthenticatedUser(request, env) {
  const token = getSessionToken(request);

  if (!token) {
    return null;
  }

  const tokenHash = await sha256Base64Url(token);

  const session = await env.DB
    .prepare(`
      SELECT
        s.id AS session_id,
        s.expires_at,
        u.id,
        u.full_name,
        u.phone,
        u.role,
        u.is_active,
        u.created_at
      FROM sessions s
      INNER JOIN users u
        ON u.id = s.user_id
      WHERE s.token_hash = ?
      LIMIT 1
    `)
    .bind(tokenHash)
    .first();

  if (!session) {
    return null;
  }

  if (session.is_active !== 1) {
    return null;
  }

  const expiresTime = Date.parse(session.expires_at);

  if (!Number.isFinite(expiresTime) || expiresTime <= Date.now()) {
    await env.DB
      .prepare("DELETE FROM sessions WHERE id = ?")
      .bind(session.session_id)
      .run();

    return null;
  }

  return session;
}


// ============================================================
// PASSWORD HASHING
// ============================================================

async function hashPassword(password) {
  const saltBytes = crypto.getRandomValues(
    new Uint8Array(16)
  );

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: PASSWORD_ITERATIONS,
      hash: "SHA-256"
    },
    keyMaterial,
    256
  );

  return {
    salt: bytesToBase64Url(saltBytes),
    hash: bytesToBase64Url(
      new Uint8Array(derivedBits)
    )
  };
}


async function verifyPassword(
  password,
  storedHash,
  storedSalt
) {
  try {
    const salt = base64UrlToBytes(storedSalt);

    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations: PASSWORD_ITERATIONS,
        hash: "SHA-256"
      },
      keyMaterial,
      256
    );

    const calculated = new Uint8Array(derivedBits);
    const expected = base64UrlToBytes(storedHash);

    return constantTimeEqual(calculated, expected);

  } catch {
    return false;
  }
}


// ============================================================
// CRYPTO HELPERS
// ============================================================

async function sha256Base64Url(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(value)
  );

  return bytesToBase64Url(
    new Uint8Array(digest)
  );
}


function constantTimeEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  let difference = 0;

  for (let i = 0; i < a.length; i++) {
    difference |= a[i] ^ b[i];
  }

  return difference === 0;
}


function bytesToBase64Url(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}


function base64UrlToBytes(value) {
  const base64 = value
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const padded =
    base64 + "=".repeat((4 - (base64.length % 4)) % 4);

  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}


// ============================================================
// PHONE / INPUT HELPERS
// ============================================================

function normalizePhone(value) {
  let phone = String(value || "").trim();

  const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";

  phone = phone.replace(/[۰-۹]/g, char =>
    String(persianDigits.indexOf(char))
  );

  phone = phone.replace(/[٠-٩]/g, char =>
    String(arabicDigits.indexOf(char))
  );

  phone = phone.replace(/[\s()-]/g, "");

  if (phone.startsWith("+98")) {
    phone = "0" + phone.slice(3);
  }

  if (phone.startsWith("0098")) {
    phone = "0" + phone.slice(4);
  }

  return phone;
}


function isValidPhone(phone) {
  return /^09\d{9}$/.test(phone);
}


function cleanText(value, maxLength) {
  return String(value || "")
    .trim()
    .slice(0, maxLength);
}


async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}


// ============================================================
// COOKIE HELPERS
// ============================================================

function getSessionToken(request) {
  const cookieHeader = request.headers.get("Cookie");

  if (!cookieHeader) {
    return null;
  }

  const cookies = {};

  for (const part of cookieHeader.split(";")) {
    const index = part.indexOf("=");

    if (index === -1) {
      continue;
    }

    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    cookies[name] = value;
  }

  return cookies.session || null;
}


function buildSessionCookie(token, expires) {
  return [
    `session=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Expires=${new Date(expires).toUTCString()}`
  ].join("; ");
}


function clearSessionCookie() {
  return [
    "session=",
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=0"
  ].join("; ");
}


// ============================================================
// RESPONSE
// ============================================================

function json(data, status = 200, extraHeaders = {}) {
  const headers = new Headers();

  headers.set(
    "Content-Type",
    "application/json; charset=UTF-8"
  );

  headers.set(
    "Cache-Control",
    "no-store"
  );

  for (const [key, value] of Object.entries(extraHeaders)) {
    headers.set(key, value);
  }

  return new Response(
    JSON.stringify(data),
    {
      status,
      headers
    }
  );
    }

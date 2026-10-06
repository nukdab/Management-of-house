const SESSION_DAYS = 30;
const PASSWORD_ITERATIONS = 120000;
const MAX_DESCRIPTION = 10000;
const MAX_TEXT = 500;

const encoder = new TextEncoder();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/test-db" && request.method === "GET") {
        const result = await env.DB
          .prepare("SELECT 1 AS connected")
          .first();

        return json({
          success: true,
          database: result?.connected === 1
        });
      }

      if (url.pathname.startsWith("/api/auth/")) {
        return await handleAuth(request, env, url);
      }

      if (url.pathname === "/api/admin/bootstrap") {
        return await handleAdminBootstrap(request, env);
      }

      if (url.pathname === "/api/cases" && request.method === "GET") {
        return await listCases(request, env);
      }

      if (url.pathname === "/api/cases" && request.method === "POST") {
        return await createCase(request, env);
      }

      const caseMatch = url.pathname.match(/^\/api\/cases\/(\d+)$/);

      if (caseMatch) {
        const caseId = Number(caseMatch[1]);

        if (request.method === "GET") {
          return await getCase(request, env, caseId);
        }

        if (request.method === "PATCH") {
          return await updateCase(request, env, caseId);
        }
      }

      const eventsMatch =
        url.pathname.match(/^\/api\/cases\/(\d+)\/events$/);

      if (eventsMatch && request.method === "GET") {
        return await getCaseEvents(request, env, Number(eventsMatch[1]));
      }

      if (
        url.pathname === "/api/notifications" &&
        request.method === "GET"
      ) {
        return await listNotifications(request, env);
      }

      const notificationMatch =
        url.pathname.match(/^\/api\/notifications\/(\d+)$/);

      if (notificationMatch && request.method === "PATCH") {
        return await updateNotification(
          request,
          env,
          Number(notificationMatch[1])
        );
      }

      if (
        url.pathname === "/api/admin/cases" &&
        request.method === "GET"
      ) {
        return await adminListCases(request, env);
      }

      if (
        url.pathname === "/api/admin/notifications" &&
        request.method === "POST"
      ) {
        return await createNotification(request, env);
      }

      if (
        url.pathname === "/api/admin/audit-logs" &&
        request.method === "GET"
      ) {
        return await getAuditLogs(request, env);
      }

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
// AUTH
// ============================================================

async function handleAuth(request, env, url) {
  if (
    url.pathname === "/api/auth/register" &&
    request.method === "POST"
  ) {
    return register(request, env);
  }

  if (
    url.pathname === "/api/auth/login" &&
    request.method === "POST"
  ) {
    return login(request, env);
  }

  if (
    url.pathname === "/api/auth/logout" &&
    request.method === "POST"
  ) {
    return logout(request, env);
  }

  if (
    url.pathname === "/api/auth/me" &&
    request.method === "GET"
  ) {
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


async function register(request, env) {
  const body = await readJson(request);

  const fullName = cleanText(body.full_name, 100);
  const phone = normalizePhone(body.phone);
  const password = String(body.password || "");

  if (!fullName) {
    return json({
      success: false,
      error: "نام و نام خانوادگی الزامی است"
    }, 400);
  }

  if (!isValidPhone(phone)) {
    return json({
      success: false,
      error: "شماره تلفن معتبر نیست"
    }, 400);
  }

  if (password.length < 8) {
    return json({
      success: false,
      error: "رمز عبور باید حداقل ۸ کاراکتر باشد"
    }, 400);
  }

  const existing = await env.DB
    .prepare("SELECT id FROM users WHERE phone = ? LIMIT 1")
    .bind(phone)
    .first();

  if (existing) {
    return json({
      success: false,
      error: "این شماره تلفن قبلاً ثبت شده است"
    }, 409);
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
    return json({
      success: false,
      error: "ساخت حساب انجام نشد"
    }, 500);
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
      "Set-Cookie": buildSessionCookie(
        session.token,
        session.expires
      )
    }
  );
}


async function login(request, env) {
  const body = await readJson(request);

  const phone = normalizePhone(body.phone);
  const password = String(body.password || "");

  if (!isValidPhone(phone) || !password) {
    return json({
      success: false,
      error: "شماره تلفن یا رمز عبور نادرست است"
    }, 401);
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
    return json({
      success: false,
      error: "شماره تلفن یا رمز عبور نادرست است"
    }, 401);
  }

  const validPassword = await verifyPassword(
    password,
    user.password_hash,
    user.password_salt
  );

  if (!validPassword) {
    return json({
      success: false,
      error: "شماره تلفن یا رمز عبور نادرست است"
    }, 401);
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


async function logout(request, env) {
  const token = getSessionToken(request);

  if (token) {
    const tokenHash = await sha256Base64Url(token);

    await env.DB
      .prepare(
        "DELETE FROM sessions WHERE token_hash = ?"
      )
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


async function getCurrentUser(request, env) {
  const user = await getAuthenticatedUser(
    request,
    env
  );

  if (!user) {
    return json({
      success: false,
      authenticated: false
    }, 401);
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
    return json({
      success: false,
      error: "Method Not Allowed"
    }, 405);
  }

  if (!env.ADMIN_SETUP_KEY) {
    return json({
      success: false,
      error: "ADMIN_SETUP_KEY تنظیم نشده است"
    }, 500);
  }

  const setupKey =
    request.headers.get("X-Setup-Key");

  if (
    !setupKey ||
    setupKey !== env.ADMIN_SETUP_KEY
  ) {
    return json({
      success: false,
      error: "کلید دسترسی نامعتبر است"
    }, 403);
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
    return json({
      success: false,
      error: "حساب ادمین قبلاً ساخته شده است"
    }, 409);
  }

  const body = await readJson(request);

  const fullName =
    cleanText(body.full_name, 100);

  const phone =
    normalizePhone(body.phone);

  const password =
    String(body.password || "");

  if (!fullName) {
    return json({
      success: false,
      error: "نام و نام خانوادگی الزامی است"
    }, 400);
  }

  if (!isValidPhone(phone)) {
    return json({
      success: false,
      error: "شماره تلفن معتبر نیست"
    }, 400);
  }

  if (password.length < 8) {
    return json({
      success: false,
      error: "رمز عبور باید حداقل ۸ کاراکتر باشد"
    }, 400);
  }

  const existingUser = await env.DB
    .prepare(
      "SELECT id FROM users WHERE phone = ? LIMIT 1"
    )
    .bind(phone)
    .first();

  if (existingUser) {
    return json({
      success: false,
      error: "این شماره تلفن قبلاً در سیستم وجود دارد"
    }, 409);
  }

  const passwordData =
    await hashPassword(password);

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
    return json({
      success: false,
      error: "ساخت حساب ادمین انجام نشد"
    }, 500);
  }

  return json({
    success: true,
    message: "اولین حساب ادمین با موفقیت ساخته شد"
  }, 201);
}


// ============================================================
// CASES - USER
// ============================================================

async function createCase(request, env) {
  const user =
    await getAuthenticatedUser(request, env);

  if (!user) {
    return json({
      success: false,
      error: "ابتدا وارد حساب شوید"
    }, 401);
  }

  const body = await readJson(request);

  const complainantType =
    body.complainant_type === "other"
      ? "other"
      : "self";

  const category =
    cleanText(body.category, 50);

  const subject =
    cleanText(body.subject, 200);

  const description =
    cleanText(body.description, MAX_DESCRIPTION);

  if (!category) {
    return json({
      success: false,
      error: "دسته‌بندی شکایت را انتخاب کنید"
    }, 400);
  }

  if (!subject) {
    return json({
      success: false,
      error: "موضوع شکایت الزامی است"
    }, 400);
  }

  if (!description) {
    return json({
      success: false,
      error: "شرح شکایت الزامی است"
    }, 400);
  }

  let otherFullName = null;
  let otherPhone = null;
  let otherNationalId = null;

  if (complainantType === "other") {
    otherFullName =
      cleanText(body.other_full_name, 100);

    otherPhone =
      normalizePhone(body.other_phone);

    otherNationalId =
      normalizeDigits(
        cleanText(body.other_national_id, 20)
      );

    if (!otherFullName) {
      return json({
        success: false,
        error: "نام شخص موردنظر الزامی است"
      }, 400);
    }
  }

  const signatureData =
    typeof body.signature_data === "string"
      ? body.signature_data.slice(0, 300000)
      : null;

  const trackingCode =
    await generateTrackingCode(
      env,
      complainantType
    );

  const result = await env.DB
    .prepare(`
      INSERT INTO cases
      (
        tracking_code,
        user_id,
        complainant_type,
        other_full_name,
        other_phone,
        other_national_id,
        category,
        subject,
        description,
        signature_data,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')
    `)
    .bind(
      trackingCode,
      user.id,
      complainantType,
      otherFullName,
      otherPhone,
      otherNationalId,
      category,
      subject,
      description,
      signatureData
    )
    .run();

  if (!result.success) {
    return json({
      success: false,
      error: "ثبت شکایت انجام نشد"
    }, 500);
  }

  const caseId =
    result.meta?.last_row_id;

  await env.DB
    .prepare(`
      INSERT INTO case_events
      (
        case_id,
        actor_user_id,
        event_type,
        description
      )
      VALUES (?, ?, 'created', ?)
    `)
    .bind(
      caseId,
      user.id,
      "پرونده توسط کاربر ثبت شد"
    )
    .run();

  return json({
    success: true,
    message: "شکایت با موفقیت ثبت شد",
    case: {
      id: caseId,
      tracking_code: trackingCode,
      status: "new"
    }
  }, 201);
}


async function listCases(request, env) {
  const user =
    await getAuthenticatedUser(request, env);

  if (!user) {
    return json({
      success: false,
      error: "ابتدا وارد حساب شوید"
    }, 401);
  }

  const rows = await env.DB
    .prepare(`
      SELECT
        id,
        tracking_code,
        complainant_type,
        category,
        subject,
        status,
        created_at,
        updated_at
      FROM cases
      WHERE user_id = ?
      ORDER BY id DESC
    `)
    .bind(user.id)
    .all();

  return json({
    success: true,
    cases: rows.results || []
  });
}


async function getCase(request, env, caseId) {
  const user =
    await getAuthenticatedUser(request, env);

  if (!user) {
    return json({
      success: false,
      error: "ابتدا وارد حساب شوید"
    }, 401);
  }

  const item = await env.DB
    .prepare(`
      SELECT *
      FROM cases
      WHERE id = ?
      LIMIT 1
    `)
    .bind(caseId)
    .first();

  if (!item) {
    return json({
      success: false,
      error: "پرونده پیدا نشد"
    }, 404);
  }

  if (
    user.role !== "admin" &&
    item.user_id !== user.id
  ) {
    return json({
      success: false,
      error: "دسترسی به این پرونده مجاز نیست"
    }, 403);
  }

  const events = await env.DB
    .prepare(`
      SELECT
        e.*,
        u.full_name AS actor_name
      FROM case_events e
      LEFT JOIN users u
        ON u.id = e.actor_user_id
      WHERE e.case_id = ?
      ORDER BY e.id DESC
    `)
    .bind(caseId)
    .all();

  const attachments = await env.DB
    .prepare(`
      SELECT
        id,
        file_name,
        content_type,
        file_size,
        created_at
      FROM attachments
      WHERE case_id = ?
      ORDER BY id DESC
    `)
    .bind(caseId)
    .all();

  return json({
    success: true,
    case: item,
    events: events.results || [],
    attachments: attachments.results || []
  });
}


// ============================================================
// CASE UPDATE - ADMIN
// ============================================================

async function updateCase(request, env, caseId) {
  const admin =
    await requireAdmin(request, env);

  if (!admin) {
    return json({
      success: false,
      error: "دسترسی مدیر لازم است"
    }, 403);
  }

  const existing = await env.DB
    .prepare(`
      SELECT *
      FROM cases
      WHERE id = ?
      LIMIT 1
    `)
    .bind(caseId)
    .first();

  if (!existing) {
    return json({
      success: false,
      error: "پرونده پیدا نشد"
    }, 404);
  }

  const body = await readJson(request);

  const allowedStatuses = [
    "new",
    "under_review",
    "answered",
    "closed"
  ];

  const status =
    allowedStatuses.includes(body.status)
      ? body.status
      : existing.status;

  const subject =
    body.subject !== undefined
      ? cleanText(body.subject, 200)
      : existing.subject;

  const description =
    body.description !== undefined
      ? cleanText(
          body.description,
          MAX_DESCRIPTION
        )
      : existing.description;

  await env.DB
    .prepare(`
      UPDATE cases
      SET
        status = ?,
        subject = ?,
        description = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .bind(
      status,
      subject,
      description,
      caseId
    )
    .run();

  if (status !== existing.status) {
    await env.DB
      .prepare(`
        INSERT INTO case_events
        (
          case_id,
          actor_user_id,
          event_type,
          description
        )
        VALUES (?, ?, 'status_changed', ?)
      `)
      .bind(
        caseId,
        admin.id,
        `وضعیت پرونده به «${statusLabel(status)}» تغییر کرد`
      )
      .run();
  }

  await writeAuditLog(
    env,
    admin.id,
    "update_case",
    "case",
    caseId,
    JSON.stringify({
      old_status: existing.status,
      new_status: status
    })
  );

  return json({
    success: true,
    message: "پرونده به‌روزرسانی شد"
  });
}


// ============================================================
// CASE EVENTS
// ============================================================

async function getCaseEvents(request, env, caseId) {
  const user =
    await getAuthenticatedUser(request, env);

  if (!user) {
    return json({
      success: false,
      error: "ابتدا وارد حساب شوید"
    }, 401);
  }

  const item = await env.DB
    .prepare(`
      SELECT id, user_id
      FROM cases
      WHERE id = ?
      LIMIT 1
    `)
    .bind(caseId)
    .first();

  if (!item) {
    return json({
      success: false,
      error: "پرونده پیدا نشد"
    }, 404);
  }

  if (
    user.role !== "admin" &&
    item.user_id !== user.id
  ) {
    return json({
      success: false,
      error: "دسترسی غیرمجاز"
    }, 403);
  }

  const events = await env.DB
    .prepare(`
      SELECT
        e.id,
        e.event_type,
        e.description,
        e.created_at,
        u.full_name AS actor_name
      FROM case_events e
      LEFT JOIN users u
        ON u.id = e.actor_user_id
      WHERE e.case_id = ?
      ORDER BY e.id DESC
    `)
    .bind(caseId)
    .all();

  return json({
    success: true,
    events: events.results || []
  });
}


// ============================================================
// ADMIN CASES
// ============================================================

async function adminListCases(request, env) {
  const admin =
    await requireAdmin(request, env);

  if (!admin) {
    return json({
      success: false,
      error: "دسترسی مدیر لازم است"
    }, 403);
  }

  const url = new URL(request.url);
  const search =
    cleanText(url.searchParams.get("search"), 100);

  let rows;

  if (search) {
    const like = `%${search}%`;

    rows = await env.DB
      .prepare(`
        SELECT
          c.*,
          u.full_name AS owner_name,
          u.phone AS owner_phone
        FROM cases c
        INNER JOIN users u
          ON u.id = c.user_id
        WHERE
          c.tracking_code LIKE ?
          OR c.subject LIKE ?
          OR c.category LIKE ?
          OR u.phone LIKE ?
          OR u.full_name LIKE ?
        ORDER BY c.id DESC
      `)
      .bind(
        like,
        like,
        like,
        like,
        like
      )
      .all();
  } else {
    rows = await env.DB
      .prepare(`
        SELECT
          c.*,
          u.full_name AS owner_name,
          u.phone AS owner_phone
        FROM cases c
        INNER JOIN users u
          ON u.id = c.user_id
        ORDER BY c.id DESC
      `)
      .all();
  }

  return json({
    success: true,
    cases: rows.results || []
  });
}


// ============================================================
// NOTIFICATIONS
// ============================================================

async function createNotification(request, env) {
  const admin =
    await requireAdmin(request, env);

  if (!admin) {
    return json({
      success: false,
      error: "دسترسی مدیر لازم است"
    }, 403);
  }

  const body = await readJson(request);

  const userId =
    Number(body.user_id);

  const caseId =
    body.case_id
      ? Number(body.case_id)
      : null;

  const title =
    cleanText(body.title, 200);

  const message =
    cleanText(body.message, 5000);

  if (!Number.isInteger(userId) || userId <= 0) {
    return json({
      success: false,
      error: "کاربر نامعتبر است"
    }, 400);
  }

  if (!title || !message) {
    return json({
      success: false,
      error: "عنوان و متن ابلاغیه الزامی است"
    }, 400);
  }

  const targetUser = await env.DB
    .prepare(`
      SELECT id
      FROM users
      WHERE id = ?
      LIMIT 1
    `)
    .bind(userId)
    .first();

  if (!targetUser) {
    return json({
      success: false,
      error: "کاربر پیدا نشد"
    }, 404);
  }

  const result = await env.DB
    .prepare(`
      INSERT INTO notifications
      (
        user_id,
        case_id,
        title,
        message
      )
      VALUES (?, ?, ?, ?)
    `)
    .bind(
      userId,
      caseId,
      title,
      message
    )
    .run();

  if (!result.success) {
    return json({
      success: false,
      error: "ارسال ابلاغیه انجام نشد"
    }, 500);
  }

  await writeAuditLog(
    env,
    admin.id,
    "create_notification",
    "notification",
    result.meta?.last_row_id || null,
    JSON.stringify({
      user_id: userId,
      case_id: caseId
    })
  );

  return json({
    success: true,
    message: "ابلاغیه با موفقیت ثبت شد"
  }, 201);
}


async function listNotifications(request, env) {
  const user =
    await getAuthenticatedUser(request, env);

  if (!user) {
    return json({
      success: false,
      error: "ابتدا وارد حساب شوید"
    }, 401);
  }

  const rows = await env.DB
    .prepare(`
      SELECT
        id,
        case_id,
        title,
        message,
        is_viewed,
        is_confirmed,
        created_at,
        viewed_at,
        confirmed_at
      FROM notifications
      WHERE user_id = ?
      ORDER BY id DESC
    `)
    .bind(user.id)
    .all();

  return json({
    success: true,
    notifications: rows.results || []
  });
}


async function updateNotification(
  request,
  env,
  notificationId
) {
  const user =
    await getAuthenticatedUser(request, env);

  if (!user) {
    return json({
      success: false,
      error: "ابتدا وارد حساب شوید"
    }, 401);
  }

  const item = await env.DB
    .prepare(`
      SELECT *
      FROM notifications
      WHERE id = ?
      LIMIT 1
    `)
    .bind(notificationId)
    .first();

  if (!item) {
    return json({
      success: false,
      error: "ابلاغیه پیدا نشد"
    }, 404);
  }

  if (
    user.role !== "admin" &&
    item.user_id !== user.id
  ) {
    return json({
      success: false,
      error: "دسترسی غیرمجاز"
    }, 403);
  }

  const body = await readJson(request);

  const changes = [];

  if (
    user.role !== "admin" &&
    body.viewed === true &&
    item.is_viewed !== 1
  ) {
    await env.DB
      .prepare(`
        UPDATE notifications
        SET
          is_viewed = 1,
          viewed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .bind(notificationId)
      .run();

    changes.push("viewed");
  }

  if (
    user.role !== "admin" &&
    body.confirmed === true &&
    item.is_confirmed !== 1
  ) {
    await env.DB
      .prepare(`
        UPDATE notifications
        SET
          is_confirmed = 1,
          confirmed_at = CURRENT_TIMESTAMP,
          is_viewed = 1,
          viewed_at = COALESCE(
            viewed_at,
            CURRENT_TIMESTAMP
          )
        WHERE id = ?
      `)
      .bind(notificationId)
      .run();

    changes.push("confirmed");
  }

  return json({
    success: true,
    changes
  });
}


// ============================================================
// ADMIN AUDIT LOG
// ============================================================

async function getAuditLogs(request, env) {
  const admin =
    await requireAdmin(request, env);

  if (!admin) {
    return json({
      success: false,
      error: "دسترسی مدیر لازم است"
    }, 403);
  }

  const rows = await env.DB
    .prepare(`
      SELECT
        a.*,
        u.full_name AS admin_name
      FROM admin_audit_logs a
      LEFT JOIN users u
        ON u.id = a.admin_user_id
      ORDER BY a.id DESC
      LIMIT 500
    `)
    .all();

  return json({
    success: true,
    logs: rows.results || []
  });
}


async function writeAuditLog(
  env,
  adminId,
  action,
  targetType,
  targetId,
  details
) {
  await env.DB
    .prepare(`
      INSERT INTO admin_audit_logs
      (
        admin_user_id,
        action,
        target_type,
        target_id,
        details
      )
      VALUES (?, ?, ?, ?, ?)
    `)
    .bind(
      adminId,
      action,
      targetType,
      targetId,
      details
    )
    .run();
}


// ============================================================
// AUTHORIZATION
// ============================================================

async function requireAdmin(request, env) {
  const user =
    await getAuthenticatedUser(request, env);

  if (!user || user.role !== "admin") {
    return null;
  }

  return user;
}


// ============================================================
// SESSION
// ============================================================

async function createSession(env, userId) {
  const tokenBytes =
    crypto.getRandomValues(
      new Uint8Array(32)
    );

  const token =
    bytesToBase64Url(tokenBytes);

  const tokenHash =
    await sha256Base64Url(token);

  const expiresDate =
    new Date(
      Date.now() +
      SESSION_DAYS *
      24 *
      60 *
      60 *
      1000
    );

  const expires =
    expiresDate.toISOString();

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


async function getAuthenticatedUser(
  request,
  env
) {
  const token =
    getSessionToken(request);

  if (!token) {
    return null;
  }

  const tokenHash =
    await sha256Base64Url(token);

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

  const expiresTime =
    Date.parse(session.expires_at);

  if (
    !Number.isFinite(expiresTime) ||
    expiresTime <= Date.now()
  ) {
    await env.DB
      .prepare(
        "DELETE FROM sessions WHERE id = ?"
      )
      .bind(session.session_id)
      .run();

    return null;
  }

  return session;
}


// ============================================================
// TRACKING CODE
// ============================================================

async function generateTrackingCode(
  env,
  complainantType
) {
  /*
    ساختار:
    سال شمسی
    + ماه میلادی
    + روز قمری
    + سال میلادی
    + ساعت
    + نوع

    مثال:
    ۱۴۰۵۱۰۰۲۲۰۲۶۱۴۲
  */

  for (let attempt = 0; attempt < 10; attempt++) {
    const now = new Date();

    const persianYear =
      getCalendarPart(
        now,
        "en-US-u-ca-persian",
        "year"
      );

    const gregorianMonth =
      String(now.getUTCMonth() + 1)
        .padStart(2, "0");

    const islamicDay =
      getCalendarPart(
        now,
        "en-US-u-ca-islamic",
        "day"
      ).padStart(2, "0");

    const gregorianYear =
      String(now.getUTCFullYear());

    const hour =
      String(now.getUTCHours())
        .padStart(2, "0");

    const typeCode =
      complainantType === "other"
        ? "2"
        : "1";

    const random =
      String(
        crypto.getRandomValues(
          new Uint8Array(2)
        )[0] % 10
      );

    const raw =
      `${persianYear}` +
      `${gregorianMonth}` +
      `${islamicDay}` +
      `${gregorianYear}` +
      `${hour}` +
      `${typeCode}` +
      `${random}`;

    const code =
      normalizeDigits(raw);

    const exists = await env.DB
      .prepare(`
        SELECT id
        FROM cases
        WHERE tracking_code = ?
        LIMIT 1
      `)
      .bind(code)
      .first();

    if (!exists) {
      return code;
    }
  }

  throw new Error(
    "امکان تولید کد رهگیری یکتا وجود ندارد"
  );
}


function getCalendarPart(
  date,
  calendar,
  part
) {
  const formatter =
    new Intl.DateTimeFormat(
      calendar,
      {
        timeZone: "UTC",
        [part]: "2-digit"
      }
    );

  return formatter
    .formatToParts(date)
    .find(x => x.type === part)
    ?.value || "";
}


// ============================================================
// PASSWORD
// ============================================================

async function hashPassword(password) {
  const saltBytes =
    crypto.getRandomValues(
      new Uint8Array(16)
    );

  const keyMaterial =
    await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

  const derivedBits =
    await crypto.subtle.deriveBits(
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
    salt:
      bytesToBase64Url(saltBytes),

    hash:
      bytesToBase64Url(
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
    const salt =
      base64UrlToBytes(storedSalt);

    const keyMaterial =
      await crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        "PBKDF2",
        false,
        ["deriveBits"]
      );

    const derivedBits =
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt,
          iterations: PASSWORD_ITERATIONS,
          hash: "SHA-256"
        },
        keyMaterial,
        256
      );

    const calculated =
      new Uint8Array(derivedBits);

    const expected =
      base64UrlToBytes(storedHash);

    return constantTimeEqual(
      calculated,
      expected
    );

  } catch {
    return false;
  }
}


// ============================================================
// CRYPTO
// ============================================================

async function sha256Base64Url(value) {
  const digest =
    await crypto.subtle.digest(
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
  const base64 =
    value
      .replace(/-/g, "+")
      .replace(/_/g, "/");

  const padded =
    base64 +
    "=".repeat(
      (4 - (base64.length % 4)) % 4
    );

  const binary =
    atob(padded);

  const bytes =
    new Uint8Array(binary.length);

  for (
    let i = 0;
    i < binary.length;
    i++
  ) {
    bytes[i] =
      binary.charCodeAt(i);
  }

  return bytes;
}


// ============================================================
// INPUT
// ============================================================

function normalizePhone(value) {
  let phone =
    String(value || "").trim();

  phone =
    normalizeDigits(phone);

  phone =
    phone.replace(
      /[\s()-]/g,
      ""
    );

  if (phone.startsWith("+98")) {
    phone =
      "0" + phone.slice(3);
  }

  if (phone.startsWith("0098")) {
    phone =
      "0" + phone.slice(4);
  }

  return phone;
}


function normalizeDigits(value) {
  const persian =
    "۰۱۲۳۴۵۶۷۸۹";

  const arabic =
    "٠١٢٣٤٥٦٧٨٩";

  return String(value || "")
    .replace(
      /[۰-۹]/g,
      char =>
        String(
          persian.indexOf(char)
        )
    )
    .replace(
      /[٠-٩]/g,
      char =>
        String(
          arabic.indexOf(char)
        )
    );
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
// COOKIE
// ============================================================

function getSessionToken(request) {
  const cookieHeader =
    request.headers.get("Cookie");

  if (!cookieHeader) {
    return null;
  }

  const cookies = {};

  for (
    const part of cookieHeader.split(";")
  ) {
    const index =
      part.indexOf("=");

    if (index === -1) {
      continue;
    }

    const name =
      part.slice(0, index).trim();

    const value =
      part.slice(index + 1).trim();

    cookies[name] = value;
  }

  return cookies.session || null;
}


function buildSessionCookie(
  token,
  expires
) {
  return [
    `session=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Expires=${new Date(
      expires
    ).toUTCString()}`
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
// STATUS
// ============================================================

function statusLabel(status) {
  const labels = {
    new: "جدید",
    under_review: "در حال بررسی",
    answered: "پاسخ داده شده",
    closed: "بسته شده"
  };

  return labels[status] || status;
}


// ============================================================
// RESPONSE
// ============================================================

function json(
  data,
  status = 200,
  extraHeaders = {}
) {
  const headers =
    new Headers();

  headers.set(
    "Content-Type",
    "application/json; charset=UTF-8"
  );

  headers.set(
    "Cache-Control",
    "no-store"
  );

  for (
    const [key, value]
    of Object.entries(extraHeaders)
  ) {
    headers.set(
      key,
      value
    );
  }

  return new Response(
    JSON.stringify(data),
    {
      status,
      headers
    }
  );
      }

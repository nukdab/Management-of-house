const SESSION_DAYS = 30;
const PASSWORD_ITERATIONS = 120000;

const MAX_DESCRIPTION = 10000;
const MAX_ATTACHMENTS = 5;
const MAX_FILE_SIZE = 500 * 1024;
const MAX_TOTAL_FILE_SIZE = 1500 * 1024;
const MAX_FILE_DATA_LENGTH = 750000;

const encoder = new TextEncoder();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      // ======================================================
      // TEST DATABASE
      // ======================================================

      if (
        url.pathname === "/api/test-db" &&
        request.method === "GET"
      ) {
        const result = await env.DB
          .prepare("SELECT 1 AS connected")
          .first();

        return json({
          success: true,
          database: result?.connected === 1
        });
      }

      // ======================================================
      // AUTH
      // ======================================================

      if (url.pathname.startsWith("/api/auth/")) {
        return await handleAuth(request, env, url);
      }

      // ======================================================
      // ADMIN BOOTSTRAP
      // ======================================================

      if (
        url.pathname === "/api/admin/bootstrap" &&
        request.method === "POST"
      ) {
        return await handleAdminBootstrap(request, env);
      }

      // ======================================================
      // CASES
      // ======================================================

      if (
        url.pathname === "/api/cases" &&
        request.method === "GET"
      ) {
        return await listCases(request, env);
      }

      if (
        url.pathname === "/api/cases" &&
        request.method === "POST"
      ) {
        return await createCase(request, env);
      }

      const caseMatch =
        url.pathname.match(/^\/api\/cases\/(\d+)$/);

      if (caseMatch) {
        const caseId = Number(caseMatch[1]);

        if (request.method === "GET") {
          return await getCase(
            request,
            env,
            caseId
          );
        }

        if (request.method === "PATCH") {
          return await updateCase(
            request,
            env,
            caseId
          );
        }
      }

      // ======================================================
      // CASE EVENTS
      // ======================================================

      const eventsMatch =
        url.pathname.match(
          /^\/api\/cases\/(\d+)\/events$/
        );

      if (
        eventsMatch &&
        request.method === "GET"
      ) {
        return await getCaseEvents(
          request,
          env,
          Number(eventsMatch[1])
        );
      }

      // ======================================================
      // ATTACHMENTS
      // ======================================================

      const attachmentMatch =
        url.pathname.match(
          /^\/api\/attachments\/(\d+)$/
        );

      if (
        attachmentMatch &&
        request.method === "GET"
      ) {
        return await downloadAttachment(
          request,
          env,
          Number(attachmentMatch[1])
        );
      }

      if (
        url.pathname === "/api/admin/attachments" &&
        request.method === "POST"
      ) {
        return await adminAddAttachments(
          request,
          env
        );
      }

      // ======================================================
      // NOTIFICATIONS - USER
      // ======================================================

      if (
        url.pathname === "/api/notifications" &&
        request.method === "GET"
      ) {
        return await listNotifications(
          request,
          env
        );
      }

      const notificationMatch =
        url.pathname.match(
          /^\/api\/notifications\/(\d+)$/
        );

      if (
        notificationMatch &&
        request.method === "PATCH"
      ) {
        return await updateNotification(
          request,
          env,
          Number(notificationMatch[1])
        );
      }

      // ======================================================
      // ADMIN CASES
      // ======================================================

      if (
        url.pathname === "/api/admin/cases" &&
        request.method === "GET"
      ) {
        return await adminListCases(
          request,
          env
        );
      }

      // ======================================================
      // ADMIN NOTIFICATIONS
      // ======================================================

      if (
        url.pathname === "/api/admin/notifications" &&
        request.method === "POST"
      ) {
        return await createNotification(
          request,
          env
        );
      }

      // ======================================================
      // ADMIN AUDIT LOGS
      // ======================================================

      if (
        url.pathname === "/api/admin/audit-logs" &&
        request.method === "GET"
      ) {
        return await getAuditLogs(
          request,
          env
        );
      }

      // ======================================================
      // STATIC ASSETS
      // ======================================================

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

async function handleAuth(
  request,
  env,
  url
) {
  if (
    url.pathname === "/api/auth/register" &&
    request.method === "POST"
  ) {
    return await register(request, env);
  }

  if (
    url.pathname === "/api/auth/login" &&
    request.method === "POST"
  ) {
    return await login(request, env);
  }

  if (
    url.pathname === "/api/auth/logout" &&
    request.method === "POST"
  ) {
    return await logout(request, env);
  }

  if (
    url.pathname === "/api/auth/me" &&
    request.method === "GET"
  ) {
    return await getCurrentUser(request, env);
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

  const fullName = cleanText(
    body.full_name,
    100
  );

  const phone = normalizePhone(
    body.phone
  );

  const password = String(
    body.password || ""
  );

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
    .prepare(
      "SELECT id FROM users WHERE phone = ? LIMIT 1"
    )
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
      SELECT
        id,
        full_name,
        phone,
        role,
        created_at
      FROM users
      WHERE phone = ?
      LIMIT 1
    `)
    .bind(phone)
    .first();

  const session =
    await createSession(
      env,
      user.id
    );

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
      "Set-Cookie":
        buildSessionCookie(
          session.token,
          session.expires
        )
    }
  );
}


async function login(request, env) {
  const body = await readJson(request);

  const phone = normalizePhone(
    body.phone
  );

  const password = String(
    body.password || ""
  );

  if (
    !isValidPhone(phone) ||
    !password
  ) {
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

  if (
    !user ||
    user.is_active !== 1
  ) {
    return json(
      {
        success: false,
        error: "شماره تلفن یا رمز عبور نادرست است"
      },
      401
    );
  }

  const validPassword =
    await verifyPassword(
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

  const session =
    await createSession(
      env,
      user.id
    );

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
      "Set-Cookie":
        buildSessionCookie(
          session.token,
          session.expires
        )
    }
  );
}


async function logout(request, env) {
  const token =
    getSessionToken(request);

  if (token) {
    const tokenHash =
      await sha256Base64Url(token);

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
      "Set-Cookie":
        clearSessionCookie()
    }
  );
}


async function getCurrentUser(
  request,
  env
) {
  const user =
    await getAuthenticatedUser(
      request,
      env
    );

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

async function handleAdminBootstrap(
  request,
  env
) {
  if (!env.ADMIN_SETUP_KEY) {
    return json(
      {
        success: false,
        error: "ADMIN_SETUP_KEY تنظیم نشده است"
      },
      500
    );
  }

  const setupKey =
    request.headers.get(
      "X-Setup-Key"
    );

  if (
    !setupKey ||
    setupKey !== env.ADMIN_SETUP_KEY
  ) {
    return json(
      {
        success: false,
        error: "کلید دسترسی نامعتبر است"
      },
      403
    );
  }

  const existingAdmin =
    await env.DB
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

  const body =
    await readJson(request);

  const fullName =
    cleanText(
      body.full_name,
      100
    );

  const phone =
    normalizePhone(
      body.phone
    );

  const password =
    String(
      body.password || ""
    );

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

  const existingUser =
    await env.DB
      .prepare(
        "SELECT id FROM users WHERE phone = ? LIMIT 1"
      )
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

  const passwordData =
    await hashPassword(password);

  const result =
    await env.DB
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

  return json(
    {
      success: true,
      message: "اولین حساب ادمین با موفقیت ساخته شد"
    },
    201
  );
}


// ============================================================
// CREATE CASE
// ============================================================

async function createCase(
  request,
  env
) {
  const user =
    await getAuthenticatedUser(
      request,
      env
    );

  if (!user) {
    return json(
      {
        success: false,
        error: "ابتدا وارد حساب شوید"
      },
      401
    );
  }

  const body =
    await readJson(request);

  const complainantType =
    body.complainant_type === "other"
      ? "other"
      : "self";

  const category =
    cleanText(
      body.category,
      50
    );

  const subject =
    cleanText(
      body.subject,
      200
    );

  const description =
    cleanText(
      body.description,
      MAX_DESCRIPTION
    );

  if (!category) {
    return json(
      {
        success: false,
        error: "دسته‌بندی شکایت را انتخاب کنید"
      },
      400
    );
  }

  if (!subject) {
    return json(
      {
        success: false,
        error: "موضوع شکایت الزامی است"
      },
      400
    );
  }

  if (!description) {
    return json(
      {
        success: false,
        error: "شرح شکایت الزامی است"
      },
      400
    );
  }

  let otherFullName = null;
  let otherPhone = null;
  let otherNationalId = null;

  if (complainantType === "other") {
    otherFullName =
      cleanText(
        body.other_full_name,
        100
      );

    otherPhone =
      normalizePhone(
        body.other_phone
      );

    otherNationalId =
      normalizeDigits(
        cleanText(
          body.other_national_id,
          20
        )
      );

    if (!otherFullName) {
      return json(
        {
          success: false,
          error: "نام شخص موردنظر الزامی است"
        },
        400
      );
    }

    if (
      otherPhone &&
      !isValidPhone(otherPhone)
    ) {
      return json(
        {
          success: false,
          error: "شماره تلفن شخص موردنظر معتبر نیست"
        },
        400
      );
    }

    if (
      otherNationalId &&
      !/^\d{10}$/.test(
        otherNationalId
      )
    ) {
      return json(
        {
          success: false,
          error: "کد ملی باید ۱۰ رقم باشد"
        },
        400
      );
    }
  }

  let signatureData = null;

  if (
    typeof body.signature_data === "string" &&
    body.signature_data.trim()
  ) {
    signatureData =
      body.signature_data.slice(
        0,
        300000
      );

    if (
      !signatureData.startsWith(
        "data:image/"
      )
    ) {
      return json(
        {
          success: false,
          error: "فرمت امضا نامعتبر است"
        },
        400
      );
    }
  }

  const attachments =
    Array.isArray(body.attachments)
      ? body.attachments
      : [];

  const validatedAttachments =
    validateAttachments(
      attachments
    );

  if (!validatedAttachments.ok) {
    return json(
      {
        success: false,
        error: validatedAttachments.error
      },
      400
    );
  }

  const trackingCode =
    await generateTrackingCode(
      env,
      complainantType
    );

  const result =
    await env.DB
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
    return json(
      {
        success: false,
        error: "ثبت شکایت انجام نشد"
      },
      500
    );
  }

  const caseId =
    result.meta?.last_row_id;

  if (!caseId) {
    return json(
      {
        success: false,
        error: "شناسه پرونده تولید نشد"
      },
      500
    );
  }

  for (
    const file of validatedAttachments.files
  ) {
    await insertAttachment(
      env,
      caseId,
      file
    );
  }

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

  return json(
    {
      success: true,
      message: "شکایت با موفقیت ثبت شد",
      case: {
        id: caseId,
        tracking_code: trackingCode,
        status: "new"
      }
    },
    201
  );
}


// ============================================================
// USER CASES
// ============================================================

async function listCases(
  request,
  env
) {
  const user =
    await getAuthenticatedUser(
      request,
      env
    );

  if (!user) {
    return json(
      {
        success: false,
        error: "ابتدا وارد حساب شوید"
      },
      401
    );
  }

  const rows =
    await env.DB
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


async function getCase(
  request,
  env,
  caseId
) {
  const user =
    await getAuthenticatedUser(
      request,
      env
    );

  if (!user) {
    return json(
      {
        success: false,
        error: "ابتدا وارد حساب شوید"
      },
      401
    );
  }

  const item =
    await env.DB
      .prepare(`
        SELECT
          c.*,
          u.full_name AS user_full_name,
          u.phone AS user_phone
        FROM cases c
        INNER JOIN users u
          ON u.id = c.user_id
        WHERE c.id = ?
        LIMIT 1
      `)
      .bind(caseId)
      .first();

  if (!item) {
    return json(
      {
        success: false,
        error: "پرونده پیدا نشد"
      },
      404
    );
  }

  if (
    user.role !== "admin" &&
    Number(item.user_id) !== Number(user.id)
  ) {
    return json(
      {
        success: false,
        error: "دسترسی به این پرونده مجاز نیست"
      },
      403
    );
  }

  const events =
    await env.DB
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

  const attachments =
    await env.DB
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
// UPDATE CASE - ADMIN
// ============================================================

async function updateCase(
  request,
  env,
  caseId
) {
  const admin =
    await requireAdmin(
      request,
      env
    );

  if (!admin) {
    return json(
      {
        success: false,
        error: "دسترسی مدیر لازم است"
      },
      403
    );
  }

  const existing =
    await env.DB
      .prepare(`
        SELECT *
        FROM cases
        WHERE id = ?
        LIMIT 1
      `)
      .bind(caseId)
      .first();

  if (!existing) {
    return json(
      {
        success: false,
        error: "پرونده پیدا نشد"
      },
      404
    );
  }

  const body =
    await readJson(request);

  const allowedStatuses = [
    "new",
    "under_review",
    "answered",
    "closed"
  ];

  const status =
    allowedStatuses.includes(
      body.status
    )
      ? body.status
      : existing.status;

  const subject =
    body.subject !== undefined
      ? cleanText(
          body.subject,
          200
        )
      : existing.subject;

  const description =
    body.description !== undefined
      ? cleanText(
          body.description,
          MAX_DESCRIPTION
        )
      : existing.description;

  if (!subject) {
    return json(
      {
        success: false,
        error: "موضوع نمی‌تواند خالی باشد"
      },
      400
    );
  }

  if (!description) {
    return json(
      {
        success: false,
        error: "شرح پرونده نمی‌تواند خالی باشد"
      },
      400
    );
  }

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

  if (
    status !== existing.status
  ) {
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

  if (
    subject !== existing.subject ||
    description !== existing.description
  ) {
    await env.DB
      .prepare(`
        INSERT INTO case_events
        (
          case_id,
          actor_user_id,
          event_type,
          description
        )
        VALUES (?, ?, 'updated', ?)
      `)
      .bind(
        caseId,
        admin.id,
        "اطلاعات پرونده توسط مدیر ویرایش شد"
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

async function getCaseEvents(
  request,
  env,
  caseId
) {
  const user =
    await getAuthenticatedUser(
      request,
      env
    );

  if (!user) {
    return json(
      {
        success: false,
        error: "ابتدا وارد حساب شوید"
      },
      401
    );
  }

  const item =
    await env.DB
      .prepare(`
        SELECT
          id,
          user_id
        FROM cases
        WHERE id = ?
        LIMIT 1
      `)
      .bind(caseId)
      .first();

  if (!item) {
    return json(
      {
        success: false,
        error: "پرونده پیدا نشد"
      },
      404
    );
  }

  if (
    user.role !== "admin" &&
    Number(item.user_id) !== Number(user.id)
  ) {
    return json(
      {
        success: false,
        error: "دسترسی غیرمجاز"
      },
      403
    );
  }

  const events =
    await env.DB
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
// ADMIN CASE LIST
// ============================================================

async function adminListCases(
  request,
  env
) {
  const admin =
    await requireAdmin(
      request,
      env
    );

  if (!admin) {
    return json(
      {
        success: false,
        error: "دسترسی مدیر لازم است"
      },
      403
    );
  }

  const url =
    new URL(request.url);

  const search =
    cleanText(
      url.searchParams.get("search"),
      100
    );

  const status =
    cleanText(
      url.searchParams.get("status"),
      50
    );

  const allowedStatuses = [
    "new",
    "under_review",
    "answered",
    "closed"
  ];

  let sql = `
    SELECT
      c.*,
      u.full_name AS owner_name,
      u.full_name AS user_full_name,
      u.phone AS owner_phone,
      u.phone AS user_phone
    FROM cases c
    INNER JOIN users u
      ON u.id = c.user_id
    WHERE 1 = 1
  `;

  const bindings = [];

  if (search) {
    sql += `
      AND (
        c.tracking_code LIKE ?
        OR c.subject LIKE ?
        OR c.category LIKE ?
        OR u.phone LIKE ?
        OR u.full_name LIKE ?
      )
    `;

    const like =
      `%${search}%`;

    bindings.push(
      like,
      like,
      like,
      like,
      like
    );
  }

  if (
    allowedStatuses.includes(status)
  ) {
    sql += `
      AND c.status = ?
    `;

    bindings.push(status);
  }

  sql += `
    ORDER BY c.id DESC
  `;

  const statement =
    env.DB.prepare(sql);

  const rows =
    await statement
      .bind(...bindings)
      .all();

  return json({
    success: true,
    cases: rows.results || []
  });
}


// ============================================================
// ADMIN ATTACHMENTS
// ============================================================

async function adminAddAttachments(
  request,
  env
) {
  const admin =
    await requireAdmin(
      request,
      env
    );

  if (!admin) {
    return json(
      {
        success: false,
        error: "دسترسی مدیر لازم است"
      },
      403
    );
  }

  const body =
    await readJson(request);

  const caseId =
    Number(body.case_id);

  if (
    !Number.isInteger(caseId) ||
    caseId <= 0
  ) {
    return json(
      {
        success: false,
        error: "شناسه پرونده نامعتبر است"
      },
      400
    );
  }

  const targetCase =
    await env.DB
      .prepare(`
        SELECT
          id,
          user_id
        FROM cases
        WHERE id = ?
        LIMIT 1
      `)
      .bind(caseId)
      .first();

  if (!targetCase) {
    return json(
      {
        success: false,
        error: "پرونده پیدا نشد"
      },
      404
    );
  }

  const attachments =
    Array.isArray(body.attachments)
      ? body.attachments
      : [];

  const validated =
    validateAttachments(
      attachments
    );

  if (!validated.ok) {
    return json(
      {
        success: false,
        error: validated.error
      },
      400
    );
  }

  const existingSize =
    await env.DB
      .prepare(`
        SELECT
          COALESCE(
            SUM(file_size),
            0
          ) AS total_size
        FROM attachments
        WHERE case_id = ?
      `)
      .bind(caseId)
      .first();

  const currentSize =
    Number(
      existingSize?.total_size || 0
    );

  const newSize =
    validated.files.reduce(
      (
        total,
        file
      ) =>
        total +
        file.fileSize,
      0
    );

  if (
    currentSize + newSize >
    MAX_TOTAL_FILE_SIZE
  ) {
    return json(
      {
        success: false,
        error:
          "حجم مجموع پیوست‌های این پرونده نباید بیشتر از ۱.۵ مگابایت باشد"
      },
      400
    );
  }

  for (
    const file of validated.files
  ) {
    await insertAttachment(
      env,
      caseId,
      file
    );
  }

  const fileNames =
    validated.files
      .map(
        file =>
          file.fileName
      )
      .join("، ");

  await env.DB
    .prepare(`
      INSERT INTO case_events
      (
        case_id,
        actor_user_id,
        event_type,
        description
      )
      VALUES (?, ?, 'attachment_added', ?)
    `)
    .bind(
      caseId,
      admin.id,
      `مدیر پیوست جدید اضافه کرد: ${fileNames}`
    )
    .run();

  await writeAuditLog(
    env,
    admin.id,
    "add_case_attachment",
    "case",
    caseId,
    JSON.stringify({
      files:
        validated.files.map(
          file => ({
            file_name:
              file.fileName,
            content_type:
              file.contentType,
            file_size:
              file.fileSize
          })
        )
    })
  );

  return json(
    {
      success: true,
      message:
        "پیوست با موفقیت به پرونده اضافه شد"
    },
    201
  );
}


async function downloadAttachment(
  request,
  env,
  attachmentId
) {
  const user =
    await getAuthenticatedUser(
      request,
      env
    );

  if (!user) {
    return new Response(
      "Unauthorized",
      {
        status: 401
      }
    );
  }

  const attachment =
    await env.DB
      .prepare(`
        SELECT
          a.id,
          a.case_id,
          a.file_name,
          a.content_type,
          a.file_size,
          a.file_data,
          c.user_id
        FROM attachments a
        INNER JOIN cases c
          ON c.id = a.case_id
        WHERE a.id = ?
        LIMIT 1
      `)
      .bind(attachmentId)
      .first();

  if (!attachment) {
    return new Response(
      "Attachment Not Found",
      {
        status: 404
      }
    );
  }

  if (
    user.role !== "admin" &&
    Number(attachment.user_id) !== Number(user.id)
  ) {
    return new Response(
      "Forbidden",
      {
        status: 403
      }
    );
  }

  const parsed =
    parseDataUrl(
      attachment.file_data
    );

  if (!parsed) {
    return new Response(
      "Invalid attachment",
      {
        status: 500
      }
    );
  }

  const bytes =
    base64ToUint8Array(
      parsed.base64
    );

  const contentType =
    attachment.content_type ||
    parsed.mimeType ||
    "application/octet-stream";

  const safeFileName =
    String(
      attachment.file_name ||
        "attachment"
    ).replace(
      /[\r\n"]/g,
      "_"
    );

  const encodedFileName =
    encodeURIComponent(
      safeFileName
    );

  return new Response(
    bytes,
    {
      status: 200,
      headers: {
        "Content-Type":
          contentType,

        "Content-Length":
          String(bytes.length),

        "Content-Disposition":
          "inline; filename=\"attachment\"; filename*=UTF-8''" +
          encodedFileName,

        "Cache-Control":
          "private, no-store"
      }
    }
  );
}


// ============================================================
// NOTIFICATIONS
// ============================================================

async function createNotification(
  request,
  env
) {
  const admin =
    await requireAdmin(
      request,
      env
    );

  if (!admin) {
    return json(
      {
        success: false,
        error: "دسترسی مدیر لازم است"
      },
      403
    );
  }

  const body =
    await readJson(request);

  const userId =
    Number(body.user_id);

  const caseId =
    body.case_id
      ? Number(body.case_id)
      : null;

  const title =
    cleanText(
      body.title,
      200
    );

  const message =
    cleanText(
      body.message,
      5000
    );

  if (
    !Number.isInteger(userId) ||
    userId <= 0
  ) {
    return json(
      {
        success: false,
        error: "کاربر نامعتبر است"
      },
      400
    );
  }

  if (!title || !message) {
    return json(
      {
        success: false,
        error:
          "عنوان و متن ابلاغیه الزامی است"
      },
      400
    );
  }

  const targetUser =
    await env.DB
      .prepare(`
        SELECT
          id
        FROM users
        WHERE id = ?
        LIMIT 1
      `)
      .bind(userId)
      .first();

  if (!targetUser) {
    return json(
      {
        success: false,
        error: "کاربر پیدا نشد"
      },
      404
    );
  }

  if (caseId !== null) {
    const targetCase =
      await env.DB
        .prepare(`
          SELECT
            id,
            user_id
          FROM cases
          WHERE id = ?
          LIMIT 1
        `)
        .bind(caseId)
        .first();

    if (!targetCase) {
      return json(
        {
          success: false,
          error: "پرونده موردنظر پیدا نشد"
        },
        404
      );
    }

    if (
      Number(targetCase.user_id) !==
      userId
    ) {
      return json(
        {
          success: false,
          error:
            "این پرونده متعلق به این کاربر نیست"
        },
        400
      );
    }
  }

  const result =
    await env.DB
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
    return json(
      {
        success: false,
        error:
          "ارسال ابلاغیه انجام نشد"
      },
      500
    );
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

  return json(
    {
      success: true,
      message:
        "ابلاغیه با موفقیت ثبت شد"
    },
    201
  );
}


async function listNotifications(
  request,
  env
) {
  const user =
    await getAuthenticatedUser(
      request,
      env
    );

  if (!user) {
    return json(
      {
        success: false,
        error: "ابتدا وارد حساب شوید"
      },
      401
    );
  }

  const rows =
    await env.DB
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
    notifications:
      rows.results || []
  });
}


async function updateNotification(
  request,
  env,
  notificationId
) {
  const user =
    await getAuthenticatedUser(
      request,
      env
    );

  if (!user) {
    return json(
      {
        success: false,
        error: "ابتدا وارد حساب شوید"
      },
      401
    );
  }

  const item =
    await env.DB
      .prepare(`
        SELECT *
        FROM notifications
        WHERE id = ?
        LIMIT 1
      `)
      .bind(notificationId)
      .first();

  if (!item) {
    return json(
      {
        success: false,
        error: "ابلاغیه پیدا نشد"
      },
      404
    );
  }

  if (
    Number(item.user_id) !==
    Number(user.id)
  ) {
    return json(
      {
        success: false,
        error: "دسترسی غیرمجاز"
      },
      403
    );
  }

  const body =
    await readJson(request);

  const changes = [];

  if (
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
// AUDIT LOG
// ============================================================

async function getAuditLogs(
  request,
  env
) {
  const admin =
    await requireAdmin(
      request,
      env
    );

  if (!admin) {
    return json(
      {
        success: false,
        error: "دسترسی مدیر لازم است"
      },
      403
    );
  }

  const rows =
    await env.DB
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
    logs:
      rows.results || []
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
// ATTACHMENT HELPERS
// ============================================================

function validateAttachments(
  attachments
) {
  if (
    !Array.isArray(attachments)
  ) {
    return {
      ok: true,
      files: []
    };
  }

  if (
    attachments.length >
    MAX_ATTACHMENTS
  ) {
    return {
      ok: false,
      error:
        "حداکثر ۵ فایل را می‌توانید پیوست کنید"
    };
  }

  let totalSize = 0;
  const files = [];

  for (
    const file of attachments
  ) {
    const fileName =
      cleanText(
        file?.file_name,
        200
      );

    const contentType =
      cleanText(
        file?.content_type,
        100
      );

    const fileSize =
      Number(
        file?.file_size
      );

    const fileData =
      typeof file?.file_data === "string"
        ? file.file_data
        : "";

    if (
      !fileName ||
      !contentType ||
      !Number.isInteger(fileSize) ||
      fileSize < 0 ||
      !fileData
    ) {
      return {
        ok: false,
        error:
          "اطلاعات یکی از فایل‌های پیوست نامعتبر است"
      };
    }

    if (
      fileSize >
      MAX_FILE_SIZE
    ) {
      return {
        ok: false,
        error:
          "حجم هر فایل نباید بیشتر از ۵۰۰ کیلوبایت باشد"
      };
    }

    totalSize += fileSize;

    if (
      totalSize >
      MAX_TOTAL_FILE_SIZE
    ) {
      return {
        ok: false,
        error:
          "حجم مجموع فایل‌ها نباید بیشتر از ۱.۵ مگابایت باشد"
      };
    }

    if (
      fileData.length >
      MAX_FILE_DATA_LENGTH
    ) {
      return {
        ok: false,
        error:
          "داده یکی از فایل‌ها بیش از حد مجاز است"
      };
    }

    if (
      !fileData.startsWith("data:")
    ) {
      return {
        ok: false,
        error:
          "فرمت یکی از فایل‌های پیوست نامعتبر است"
      };
    }

    files.push({
      fileName,
      contentType,
      fileSize,
      fileData
    });
  }

  return {
    ok: true,
    files
  };
}


async function insertAttachment(
  env,
  caseId,
  file
) {
  await env.DB
    .prepare(`
      INSERT INTO attachments
      (
        case_id,
        file_name,
        content_type,
        file_size,
        file_data
      )
      VALUES (?, ?, ?, ?, ?)
    `)
    .bind(
      caseId,
      file.fileName,
      file.contentType,
      file.fileSize,
      file.fileData
    )
    .run();
}


function parseDataUrl(
  dataUrl
) {
  if (
    typeof dataUrl !== "string" ||
    !dataUrl.startsWith("data:")
  ) {
    return null;
  }

  const commaIndex =
    dataUrl.indexOf(",");

  if (commaIndex === -1) {
    return null;
  }

  const metadata =
    dataUrl.slice(
      5,
      commaIndex
    );

  const base64 =
    dataUrl.slice(
      commaIndex + 1
    );

  if (
    !metadata.includes(";base64") ||
    !base64
  ) {
    return null;
  }

  return {
    mimeType:
      metadata.split(";")[0] ||
      "application/octet-stream",
    base64
  };
}


function base64ToUint8Array(
  base64
) {
  const binary =
    atob(base64);

  const bytes =
    new Uint8Array(
      binary.length
    );

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
// AUTHORIZATION
// ============================================================

async function requireAdmin(
  request,
  env
) {
  const user =
    await getAuthenticatedUser(
      request,
      env
    );

  if (
    !user ||
    user.role !== "admin"
  ) {
    return null;
  }

  return user;
}


// ============================================================
// SESSION
// ============================================================

async function createSession(
  env,
  userId
) {
  const tokenBytes =
    crypto.getRandomValues(
      new Uint8Array(32)
    );

  const token =
    bytesToBase64Url(
      tokenBytes
    );

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

  const session =
    await env.DB
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

  if (
    session.is_active !== 1
  ) {
    return null;
  }

  const expiresTime =
    Date.parse(
      session.expires_at
    );

  if (
    !Number.isFinite(
      expiresTime
    ) ||
    expiresTime <= Date.now()
  ) {
    await env.DB
      .prepare(
        "DELETE FROM sessions WHERE id = ?"
      )
      .bind(
        session.session_id
      )
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
  const now =
    new Date();

  const persianYear =
    getCalendarPart(
      now,
      "en-US-u-ca-persian",
      "year",
      "Asia/Tehran"
    );

  const gregorianMonth =
    getCalendarPart(
      now,
      "en-US",
      "month",
      "Asia/Tehran"
    );

  const islamicDay =
    getCalendarPart(
      now,
      "en-US-u-ca-islamic",
      "day",
      "Asia/Tehran"
    );

  const gregorianYear =
    getCalendarPart(
      now,
      "en-US",
      "year",
      "Asia/Tehran"
    );

  const hour =
    getCalendarPart(
      now,
      "en-US",
      "hour",
      "Asia/Tehran"
    );

  const typeCode =
    complainantType === "other"
      ? "2"
      : "1";

  const base =
    normalizeDigits(
      `${persianYear}${gregorianMonth}${islamicDay}${gregorianYear}${hour}`
    );

  const preferred =
    `${base}${typeCode}`;

  const exists =
    await env.DB
      .prepare(`
        SELECT id
        FROM cases
        WHERE tracking_code = ?
        LIMIT 1
      `)
      .bind(preferred)
      .first();

  if (!exists) {
    return preferred;
  }

  /*
    ساختار اصلی کد حفظ می‌شود.
    در صورت ثبت چند پرونده در یک ساعت،
    رقم انتهایی برای جلوگیری از collision
    تغییر می‌کند.
  */

  for (let suffix = 0; suffix <= 9; suffix++) {
    const candidate =
      `${base}${suffix}`;

    const candidateExists =
      await env.DB
        .prepare(`
          SELECT id
          FROM cases
          WHERE tracking_code = ?
          LIMIT 1
        `)
        .bind(candidate)
        .first();

    if (!candidateExists) {
      return candidate;
    }
  }

  throw new Error(
    "امکان تولید کد رهگیری یکتا وجود ندارد"
  );
}


function getCalendarPart(
  date,
  calendar,
  part,
  timeZone
) {
  const formatter =
    new Intl.DateTimeFormat(
      calendar,
      {
        timeZone,
        [part]:
          part === "year"
            ? "numeric"
            : "2-digit"
      }
    );

  const value =
    formatter
      .formatToParts(date)
      .find(
        item =>
          item.type === part
      )
      ?.value || "";

  return normalizeDigits(
    value
  ).padStart(
    part === "year"
      ? 4
      : 2,
    "0"
  );
}


// ============================================================
// PASSWORD
// ============================================================

async function hashPassword(
  password
) {
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
        iterations:
          PASSWORD_ITERATIONS,
        hash: "SHA-256"
      },
      keyMaterial,
      256
    );

  return {
    salt:
      bytesToBase64Url(
        saltBytes
      ),

    hash:
      bytesToBase64Url(
        new Uint8Array(
          derivedBits
        )
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
      base64UrlToBytes(
        storedSalt
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
          salt,
          iterations:
            PASSWORD_ITERATIONS,
          hash: "SHA-256"
        },
        keyMaterial,
        256
      );

    const calculated =
      new Uint8Array(
        derivedBits
      );

    const expected =
      base64UrlToBytes(
        storedHash
      );

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

async function sha256Base64Url(
  value
) {
  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      encoder.encode(value)
    );

  return bytesToBase64Url(
    new Uint8Array(
      digest
    )
  );
}


function constantTimeEqual(
  a,
  b
) {
  if (
    a.length !== b.length
  ) {
    return false;
  }

  let difference = 0;

  for (
    let i = 0;
    i < a.length;
    i++
  ) {
    difference |=
      a[i] ^ b[i];
  }

  return difference === 0;
}


function bytesToBase64Url(
  bytes
) {
  let binary = "";

  for (
    const byte of bytes
  ) {
    binary +=
      String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}


function base64UrlToBytes(
  value
) {
  const base64 =
    value
      .replace(/-/g, "+")
      .replace(/_/g, "/");

  const padded =
    base64 +
    "=".repeat(
      (4 -
        (base64.length % 4)) %
        4
    );

  const binary =
    atob(padded);

  const bytes =
    new Uint8Array(
      binary.length
    );

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

function normalizePhone(
  value
) {
  let phone =
    String(
      value || ""
    ).trim();

  phone =
    normalizeDigits(phone);

  phone =
    phone.replace(
      /[\s()-]/g,
      ""
    );

  if (
    phone.startsWith("+98")
  ) {
    phone =
      "0" +
      phone.slice(3);
  }

  if (
    phone.startsWith("0098")
  ) {
    phone =
      "0" +
      phone.slice(4);
  }

  return phone;
}


function normalizeDigits(
  value
) {
  const persian =
    "۰۱۲۳۴۵۶۷۸۹";

  const arabic =
    "٠١٢٣٤٥٦٧٨٩";

  return String(
    value || ""
  )
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


function isValidPhone(
  phone
) {
  return /^09\d{9}$/.test(
    phone
  );
}


function cleanText(
  value,
  maxLength
) {
  return String(
    value || ""
  )
    .trim()
    .slice(
      0,
      maxLength
    );
}


async function readJson(
  request
) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}


// ============================================================
// COOKIE
// ============================================================

function getSessionToken(
  request
) {
  const cookieHeader =
    request.headers.get(
      "Cookie"
    );

  if (!cookieHeader) {
    return null;
  }

  const cookies = {};

  for (
    const part of
      cookieHeader.split(";")
  ) {
    const index =
      part.indexOf("=");

    if (index === -1) {
      continue;
    }

    const name =
      part
        .slice(0, index)
        .trim();

    const value =
      part
        .slice(index + 1)
        .trim();

    cookies[name] =
      value;
  }

  return (
    cookies.session ||
    null
  );
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

function statusLabel(
  status
) {
  const labels = {
    new: "جدید",
    under_review: "در حال بررسی",
    answered: "پاسخ داده شده",
    closed: "بسته شده"
  };

  return (
    labels[status] ||
    status
  );
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
    const [
      key,
      value
    ] of Object.entries(
      extraHeaders
    )
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

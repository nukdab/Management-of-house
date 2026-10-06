"use strict";

const state = {
  admin: null,
  cases: [],
  selectedCase: null,
  selectedFiles: [],
};

const STATUS_LABELS = {
  new: "جدید",
  under_review: "در حال بررسی",
  answered: "پاسخ داده‌شده",
  closed: "بسته‌شده",
};

const CATEGORY_LABELS = {
  services: "خدمات",
  financial: "مالی",
  administrative: "اداری",
  technical: "فنی",
  behavior: "رفتار و نحوه برخورد",
  other: "سایر",
};

const MAX_FILE_SIZE = 500 * 1024;
const MAX_TOTAL_SIZE = 1.5 * 1024 * 1024;
const MAX_FILES = 5;

const $ = (selector) => document.querySelector(selector);

function normalizeDigits(value) {
  return String(value ?? "")
    .replace(/[۰-۹]/g, (char) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(char)))
    .replace(/[٠-٩]/g, (char) => String("٠١٢٣٤٥٦٧٨٩".indexOf(char)));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showMessage(message, type = "info", target = $("#adminMessage")) {
  if (!target) return;

  target.hidden = false;
  target.textContent = message;
  target.className = `form-message ${type}`;

  window.clearTimeout(target._timer);

  target._timer = window.setTimeout(() => {
    target.hidden = true;
  }, 6000);
}

function hideMessage(target = $("#adminMessage")) {
  if (!target) return;
  target.hidden = true;
}

async function api(url, options = {}) {
  const config = {
    credentials: "include",
    ...options,
    headers: {
      ...(options.headers || {}),
    },
  };

  if (
    config.body &&
    typeof config.body === "object" &&
    !(config.body instanceof FormData)
  ) {
    config.headers["Content-Type"] = "application/json";
    config.body = JSON.stringify(config.body);
  }

  const response = await fetch(url, config);

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message =
      data?.error ||
      data?.message ||
      `خطا در ارتباط با سرور (${response.status})`;

    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

function formatDate(value) {
  if (!value) return "—";

  const normalized = String(value).replace(" ", "T");
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status || "نامشخص";
}

function categoryLabel(category) {
  return CATEGORY_LABELS[category] || category || "—";
}

function statusClass(status) {
  switch (status) {
    case "new":
      return "status-new";

    case "under_review":
      return "status-review";

    case "answered":
      return "status-answered";

    case "closed":
      return "status-closed";

    default:
      return "";
  }
}

function complainantTypeLabel(type) {
  return type === "other" ? "برای شخص دیگر" : "برای خودم";
}

function renderStatus(status) {
  return `
    <span class="status-badge ${statusClass(status)}">
      ${escapeHtml(statusLabel(status))}
    </span>
  `;
}

async function loadAdmin() {
  try {
    const result = await api("/api/auth/me");

    if (!result?.authenticated || !result.user) {
      window.location.href = "/auth.html";
      return false;
    }

    if (result.user.role !== "admin") {
      window.location.href = "/user.html";
      return false;
    }

    state.admin = result.user;

    const welcome = $("#adminWelcome");

    if (welcome) {
      welcome.textContent =
        `خوش آمدید ${result.user.full_name || ""} — مدیریت پرونده‌ها، پیوست‌ها و ابلاغیه‌ها`;
    }

    return true;
  } catch (error) {
    console.error(error);
    window.location.href = "/auth.html";
    return false;
  }
}

async function loadCases() {
  const loading = $("#casesLoading");
  const empty = $("#casesEmpty");
  const wrapper = $("#casesTableWrapper");
  const tbody = $("#casesTableBody");

  if (!loading || !empty || !wrapper || !tbody) return;

  loading.hidden = false;
  empty.hidden = true;
  wrapper.hidden = true;

  try {
    const result = await api("/api/admin/cases");

    state.cases = Array.isArray(result?.cases)
      ? result.cases
      : [];

    renderCases();
    updateStats();
  } catch (error) {
    console.error(error);

    loading.hidden = true;
    empty.hidden = false;
    empty.textContent =
      error.message || "دریافت پرونده‌ها با خطا مواجه شد.";

    showMessage(
      error.message || "دریافت پرونده‌ها با خطا مواجه شد.",
      "error"
    );

    return;
  }

  loading.hidden = true;
}

function getFilteredCases() {
  const searchInput = $("#caseSearch");
  const statusInput = $("#statusFilter");

  const search = normalizeDigits(
    searchInput?.value || ""
  )
    .trim()
    .toLowerCase();

  const status = statusInput?.value || "";

  return state.cases.filter((item) => {
    if (status && item.status !== status) {
      return false;
    }

    if (!search) {
      return true;
    }

    const searchable = [
      item.tracking_code,
      item.owner_name,
      item.full_name,
      item.owner_phone,
      item.phone,
      item.subject,
      item.category,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return normalizeDigits(searchable).includes(search);
  });
}

function renderCases() {
  const empty = $("#casesEmpty");
  const wrapper = $("#casesTableWrapper");
  const tbody = $("#casesTableBody");

  if (!empty || !wrapper || !tbody) return;

  const filtered = getFilteredCases();

  tbody.innerHTML = "";

  if (!filtered.length) {
    wrapper.hidden = true;
    empty.hidden = false;
    empty.textContent = "پرونده‌ای مطابق جستجو پیدا نشد.";
    return;
  }

  empty.hidden = true;
  wrapper.hidden = false;

  for (const item of filtered) {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>
        <strong>${escapeHtml(item.tracking_code || "—")}</strong>
      </td>

      <td>
        ${escapeHtml(
          item.owner_name ||
          item.full_name ||
          "—"
        )}

        ${
          item.owner_phone || item.phone
            ? `
              <div class="table-subtext">
                ${escapeHtml(
                  item.owner_phone ||
                  item.phone ||
                  ""
                )}
              </div>
            `
            : ""
        }
      </td>

      <td>
        ${escapeHtml(item.subject || "—")}
      </td>

      <td>
        ${escapeHtml(categoryLabel(item.category))}
      </td>

      <td>
        ${renderStatus(item.status)}
      </td>

      <td>
        ${escapeHtml(formatDate(item.created_at))}
      </td>

      <td>
        <button
          type="button"
          class="btn btn-small btn-primary"
          data-case-id="${escapeHtml(item.id)}"
        >
          مشاهده
        </button>
      </td>
    `;

    const button = row.querySelector("[data-case-id]");

    button?.addEventListener("click", () => {
      openCase(item.id);
    });

    tbody.appendChild(row);
  }
}

function updateStats() {
  const total = state.cases.length;

  const newCount = state.cases.filter(
    (item) => item.status === "new"
  ).length;

  const reviewCount = state.cases.filter(
    (item) => item.status === "under_review"
  ).length;

  const answeredCount = state.cases.filter(
    (item) => item.status === "answered"
  ).length;

  const closedCount = state.cases.filter(
    (item) => item.status === "closed"
  ).length;

  setText("#totalCases", toPersianDigits(total));
  setText("#newCases", toPersianDigits(newCount));
  setText("#reviewCases", toPersianDigits(reviewCount));
  setText("#answeredCases", toPersianDigits(answeredCount));
  setText("#closedCases", toPersianDigits(closedCount));
}

function toPersianDigits(value) {
  return String(value ?? "").replace(
    /\d/g,
    (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]
  );
}

function setText(selector, value) {
  const element = $(selector);

  if (element) {
    element.textContent = value;
  }
}

async function openCase(caseId) {
  const section = $("#caseDetailsSection");

  if (!section) return;

  section.hidden = false;

  section.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });

  showCaseLoading();

  try {
    const result = await api(
      `/api/cases/${encodeURIComponent(caseId)}`
    );

    state.selectedCase = result?.case || result;

    renderCaseDetails(state.selectedCase);

    await Promise.all([
      loadCaseEvents(caseId),
    ]);
  } catch (error) {
    console.error(error);

    showMessage(
      error.message || "دریافت جزئیات پرونده ناموفق بود.",
      "error",
      $("#caseDetailsMessage")
    );
  }
}

function showCaseLoading() {
  setText("#detailTrackingCode", "در حال دریافت...");
  setText("#detailStatus", "در حال دریافت...");
  setText("#detailCategory", "در حال دریافت...");
  setText("#detailCreatedAt", "در حال دریافت...");
  setText("#detailOwnerName", "در حال دریافت...");
  setText("#detailOwnerPhone", "در حال دریافت...");
  setText("#detailComplainantType", "در حال دریافت...");
  setText("#detailSubject", "در حال دریافت...");
  setText("#detailDescription", "در حال دریافت...");

  const signatureImage = $("#signatureImage");
  const signatureEmpty = $("#signatureEmpty");

  if (signatureImage) {
    signatureImage.hidden = true;
    signatureImage.removeAttribute("src");
  }

  if (signatureEmpty) {
    signatureEmpty.hidden = false;
    signatureEmpty.textContent = "در حال دریافت امضا...";
  }
}

function renderCaseDetails(caseData) {
  if (!caseData) return;

  setText(
    "#detailTrackingCode",
    caseData.tracking_code || "—"
  );

  const statusElement = $("#detailStatus");

  if (statusElement) {
    statusElement.innerHTML = renderStatus(caseData.status);
  }

  setText(
    "#detailCategory",
    categoryLabel(caseData.category)
  );

  setText(
    "#detailCreatedAt",
    formatDate(caseData.created_at)
  );

  setText(
    "#detailOwnerName",
    caseData.owner_name ||
    caseData.full_name ||
    "—"
  );

  setText(
    "#detailOwnerPhone",
    caseData.owner_phone ||
    caseData.phone ||
    "—"
  );

  setText(
    "#detailComplainantType",
    complainantTypeLabel(
      caseData.complainant_type
    )
  );

  setText(
    "#detailSubject",
    caseData.subject || "—"
  );

  setText(
    "#detailDescription",
    caseData.description || "—"
  );

  const otherSection = $("#otherPersonSection");

  if (
    otherSection &&
    caseData.complainant_type === "other"
  ) {
    otherSection.hidden = false;

    setText(
      "#detailOtherName",
      caseData.other_full_name || "—"
    );

    setText(
      "#detailOtherPhone",
      caseData.other_phone || "—"
    );

    setText(
      "#detailOtherNationalId",
      caseData.other_national_id || "—"
    );
  } else if (otherSection) {
    otherSection.hidden = true;
  }

  const statusSelect = $("#caseStatusSelect");

  if (statusSelect) {
    statusSelect.value =
      caseData.status || "new";
  }

  const statusNote = $("#statusNote");

  if (statusNote) {
    statusNote.value = "";
  }

  renderSignature(caseData.signature_data);
  renderAttachments(caseData.attachments || []);
}

function renderSignature(signatureData) {
  const image = $("#signatureImage");
  const empty = $("#signatureEmpty");

  if (!image || !empty) return;

  if (
    typeof signatureData === "string" &&
    signatureData.startsWith("data:image/")
  ) {
    image.src = signatureData;
    image.hidden = false;
    empty.hidden = true;
    return;
  }

  image.hidden = true;
  image.removeAttribute("src");
  empty.hidden = false;
  empty.textContent =
    "برای این پرونده امضایی ثبت نشده است.";
}

function renderAttachments(attachments) {
  const container = $("#attachmentsContainer");

  if (!container) return;

  container.innerHTML = "";

  if (!Array.isArray(attachments) || !attachments.length) {
    container.innerHTML = `
      <div class="empty-state">
        هنوز پیوستی برای این پرونده ثبت نشده است.
      </div>
    `;

    return;
  }

  const list = document.createElement("div");
  list.className = "attachment-list";

  for (const attachment of attachments) {
    const item = document.createElement("div");

    item.className = "attachment-item";

    const size =
      Number(attachment.file_size || 0);

    item.innerHTML = `
      <div class="attachment-info">

        <strong>
          ${escapeHtml(
            attachment.file_name || "فایل"
          )}
        </strong>

        <small>
          ${escapeHtml(
            attachment.content_type ||
            "نوع فایل نامشخص"
          )}

          ${size ? ` — ${formatFileSize(size)}` : ""}

          ${
            attachment.created_at
              ? ` — ${escapeHtml(
                  formatDate(
                    attachment.created_at
                  )
                )}`
              : ""
          }
        </small>

      </div>

      <a
        class="btn btn-small btn-secondary"
        href="/api/attachments/${encodeURIComponent(
          attachment.id
        )}"
        target="_blank"
        rel="noopener"
      >
        مشاهده / دریافت
      </a>
    `;

    list.appendChild(item);
  }

  container.appendChild(list);
}

function formatFileSize(bytes) {
  const value = Number(bytes);

  if (!Number.isFinite(value) || value <= 0) {
    return "۰ بایت";
  }

  if (value < 1024) {
    return `${toPersianDigits(value)} بایت`;
  }

  if (value < 1024 * 1024) {
    return `${toPersianDigits(
      Math.round(value / 1024)
    )} کیلوبایت`;
  }

  return `${(
    value /
    (1024 * 1024)
  ).toFixed(2)} مگابایت`;
}

async function loadCaseEvents(caseId) {
  const container = $("#caseEventsContainer");

  if (!container) return;

  container.innerHTML = `
    <div class="empty-state">
      در حال دریافت سوابق رسیدگی...
    </div>
  `;

  try {
    const result = await api(
      `/api/cases/${encodeURIComponent(caseId)}/events`
    );

    const events = Array.isArray(result?.events)
      ? result.events
      : [];

    renderCaseEvents(events);
  } catch (error) {
    console.error(error);

    container.innerHTML = `
      <div class="empty-state">
        دریافت سوابق با خطا مواجه شد.
      </div>
    `;
  }
}

function renderCaseEvents(events) {
  const container = $("#caseEventsContainer");

  if (!container) return;

  container.innerHTML = "";

  if (!events.length) {
    container.innerHTML = `
      <div class="empty-state">
        هنوز رویدادی برای این پرونده ثبت نشده است.
      </div>
    `;

    return;
  }

  for (const event of events) {
    const item = document.createElement("div");

    item.className = "timeline-item";

    item.innerHTML = `
      <div class="timeline-dot"></div>

      <div class="timeline-content">

        <strong>
          ${escapeHtml(
            event.event_type ||
            "رویداد پرونده"
          )}
        </strong>

        <p>
          ${escapeHtml(
            event.description ||
            "بدون توضیح"
          )}
        </p>

        <small>
          ${escapeHtml(
            formatDate(event.created_at)
          )}
        </small>

      </div>
    `;

    container.appendChild(item);
  }
}

async function updateCaseStatus() {
  if (!state.selectedCase?.id) {
    showMessage(
      "ابتدا یک پرونده را انتخاب کنید.",
      "error",
      $("#caseDetailsMessage")
    );
    return;
  }

  const button = $("#updateStatusButton");
  const select = $("#caseStatusSelect");
  const note = $("#statusNote");

  const status = select?.value || "";
  const description =
    note?.value.trim() || "";

  if (!status) {
    showMessage(
      "وضعیت جدید را انتخاب کنید.",
      "error",
      $("#caseDetailsMessage")
    );
    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = "در حال ذخیره...";
  }

  try {
    const result = await api(
      `/api/cases/${encodeURIComponent(
        state.selectedCase.id
      )}`,
      {
        method: "PATCH",
        body: {
          status,
          event_description:
            description ||
            `وضعیت پرونده به «${statusLabel(
              status
            )}» تغییر کرد.`,
        },
      }
    );

    state.selectedCase =
      result?.case ||
      {
        ...state.selectedCase,
        status,
      };

    renderCaseDetails(state.selectedCase);

    await loadCases();

    await loadCaseEvents(
      state.selectedCase.id
    );

    showMessage(
      "وضعیت پرونده با موفقیت تغییر کرد.",
      "success",
      $("#caseDetailsMessage")
    );
  } catch (error) {
    console.error(error);

    showMessage(
      error.message ||
        "تغییر وضعیت انجام نشد.",
      "error",
      $("#caseDetailsMessage")
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "ذخیره وضعیت";
    }
  }
}

function handleAttachmentSelection(event) {
  const files = Array.from(
    event.target.files || []
  );

  const list = $("#adminAttachmentList");

  if (!list) return;

  state.selectedFiles = [];

  if (files.length > MAX_FILES) {
    showMessage(
      `حداکثر ${MAX_FILES} فایل می‌توانید انتخاب کنید.`,
      "error",
      $("#caseDetailsMessage")
    );

    event.target.value = "";
    renderSelectedFiles();
    return;
  }

  let total = 0;

  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      showMessage(
        `فایل «${file.name}» بیشتر از ۵۰۰ کیلوبایت است.`,
        "error",
        $("#caseDetailsMessage")
      );

      event.target.value = "";
      state.selectedFiles = [];
      renderSelectedFiles();
      return;
    }

    total += file.size;
  }

  if (total > MAX_TOTAL_SIZE) {
    showMessage(
      "مجموع حجم فایل‌ها نمی‌تواند بیشتر از ۱.۵ مگابایت باشد.",
      "error",
      $("#caseDetailsMessage")
    );

    event.target.value = "";
    state.selectedFiles = [];
    renderSelectedFiles();
    return;
  }

  state.selectedFiles = files;
  renderSelectedFiles();
}

function renderSelectedFiles() {
  const container = $("#adminAttachmentList");

  if (!container) return;

  container.innerHTML = "";

  if (!state.selectedFiles.length) {
    return;
  }

  for (const file of state.selectedFiles) {
    const item = document.createElement("div");

    item.className = "attachment-item";

    item.innerHTML = `
      <div class="attachment-info">

        <strong>
          ${escapeHtml(file.name)}
        </strong>

        <small>
          ${escapeHtml(
            file.type ||
            "نوع فایل نامشخص"
          )}

          — ${formatFileSize(file.size)}
        </small>

      </div>
    `;

    container.appendChild(item);
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(reader.result);
    };

    reader.onerror = () => {
      reject(
        new Error(
          `خواندن فایل «${file.name}» ناموفق بود.`
        )
      );
    };

    reader.readAsDataURL(file);
  });
}

async function uploadAttachments() {
  if (!state.selectedCase?.id) {
    showMessage(
      "ابتدا یک پرونده را انتخاب کنید.",
      "error",
      $("#caseDetailsMessage")
    );
    return;
  }

  if (!state.selectedFiles.length) {
    showMessage(
      "حداقل یک فایل انتخاب کنید.",
      "error",
      $("#caseDetailsMessage")
    );
    return;
  }

  const button = $("#uploadAttachmentsButton");

  if (button) {
    button.disabled = true;
    button.textContent = "در حال بارگذاری...";
  }

  try {
    const attachments = [];

    for (const file of state.selectedFiles) {
      const dataUrl = await fileToDataUrl(file);

      attachments.push({
        file_name: file.name,
        content_type:
          file.type ||
          "application/octet-stream",
        file_size: file.size,
        file_data: dataUrl,
      });
    }

    const result = await api(
      "/api/admin/attachments",
      {
        method: "POST",
        body: {
          case_id: state.selectedCase.id,
          attachments,
        },
      }
    );

    if (Array.isArray(result?.attachments)) {
      renderAttachments(
        result.attachments
      );
    }

    state.selectedFiles = [];

    const input =
      $("#adminAttachmentInput");

    if (input) {
      input.value = "";
    }

    renderSelectedFiles();

    const refreshed = await api(
      `/api/cases/${encodeURIComponent(
        state.selectedCase.id
      )}`
    );

    state.selectedCase =
      refreshed?.case ||
      state.selectedCase;

    renderCaseDetails(
      state.selectedCase
    );

    await loadCaseEvents(
      state.selectedCase.id
    );

    showMessage(
      "پیوست‌ها با موفقیت به پرونده اضافه شدند.",
      "success",
      $("#caseDetailsMessage")
    );
  } catch (error) {
    console.error(error);

    showMessage(
      error.message ||
        "افزودن پیوست انجام نشد.",
      "error",
      $("#caseDetailsMessage")
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent =
        "افزودن پیوست به پرونده";
    }
  }
}

async function sendNotification() {
  if (!state.selectedCase?.id) {
    showMessage(
      "ابتدا یک پرونده را انتخاب کنید.",
      "error",
      $("#caseDetailsMessage")
    );
    return;
  }

  const title =
    $("#notificationTitle")?.value.trim() || "";

  const message =
    $("#notificationMessage")?.value.trim() || "";

  if (!title) {
    showMessage(
      "عنوان ابلاغیه را وارد کنید.",
      "error",
      $("#caseDetailsMessage")
    );
    return;
  }

  if (!message) {
    showMessage(
      "متن ابلاغیه را وارد کنید.",
      "error",
      $("#caseDetailsMessage")
    );
    return;
  }

  const button =
    $("#sendNotificationButton");

  if (button) {
    button.disabled = true;
    button.textContent = "در حال ارسال...";
  }

  try {
    await api(
      "/api/admin/notifications",
      {
        method: "POST",
        body: {
          case_id: state.selectedCase.id,
          title,
          message,
        },
      }
    );

    if ($("#notificationTitle")) {
      $("#notificationTitle").value = "";
    }

    if ($("#notificationMessage")) {
      $("#notificationMessage").value = "";
    }

    await loadCaseEvents(
      state.selectedCase.id
    );

    showMessage(
      "ابلاغیه با موفقیت ثبت و ارسال شد.",
      "success",
      $("#caseDetailsMessage")
    );
  } catch (error) {
    console.error(error);

    showMessage(
      error.message ||
        "ارسال ابلاغیه انجام نشد.",
      "error",
      $("#caseDetailsMessage")
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent =
        "ارسال ابلاغیه";
    }
  }
}

function closeCaseDetails() {
  const section =
    $("#caseDetailsSection");

  if (section) {
    section.hidden = true;
  }

  state.selectedCase = null;
  state.selectedFiles = [];
}

async function loadAuditLogs() {
  const container =
    $("#auditLogsContainer");

  if (!container) return;

  container.innerHTML = `
    <div class="empty-state">
      در حال دریافت سوابق فعالیت...
    </div>
  `;

  try {
    const result = await api(
      "/api/admin/audit-logs"
    );

    const logs = Array.isArray(result?.logs)
      ? result.logs
      : [];

    renderAuditLogs(logs);
  } catch (error) {
    console.error(error);

    container.innerHTML = `
      <div class="empty-state">
        دریافت سوابق فعالیت ناموفق بود.
      </div>
    `;
  }
}

function renderAuditLogs(logs) {
  const container =
    $("#auditLogsContainer");

  if (!container) return;

  container.innerHTML = "";

  if (!logs.length) {
    container.innerHTML = `
      <div class="empty-state">
        هنوز فعالیت مدیریتی ثبت نشده است.
      </div>
    `;

    return;
  }

  for (const log of logs) {
    const item = document.createElement("div");

    item.className = "timeline-item";

    item.innerHTML = `
      <div class="timeline-dot"></div>

      <div class="timeline-content">

        <strong>
          ${escapeHtml(
            log.action ||
            "فعالیت مدیریتی"
          )}
        </strong>

        <p>
          ${escapeHtml(
            log.details ||
            "بدون توضیح"
          )}
        </p>

        <small>
          ${escapeHtml(
            formatDate(log.created_at)
          )}
        </small>

      </div>
    `;

    container.appendChild(item);
  }
}

async function logout() {
  const button =
    $("#logoutButton");

  if (button) {
    button.disabled = true;
    button.textContent = "در حال خروج...";
  }

  try {
    await api(
      "/api/auth/logout",
      {
        method: "POST",
      }
    );
  } catch (error) {
    console.error(error);
  } finally {
    window.location.href = "/auth.html";
  }
}

function bindEvents() {
  $("#logoutButton")?.addEventListener(
    "click",
    logout
  );

  $("#refreshCasesButton")?.addEventListener(
    "click",
    loadCases
  );

  $("#refreshAuditButton")?.addEventListener(
    "click",
    loadAuditLogs
  );

  $("#caseSearch")?.addEventListener(
    "input",
    renderCases
  );

  $("#statusFilter")?.addEventListener(
    "change",
    renderCases
  );

  $("#closeCaseDetailsButton")?.addEventListener(
    "click",
    closeCaseDetails
  );

  $("#updateStatusButton")?.addEventListener(
    "click",
    updateCaseStatus
  );

  $("#adminAttachmentInput")?.addEventListener(
    "change",
    handleAttachmentSelection
  );

  $("#uploadAttachmentsButton")?.addEventListener(
    "click",
    uploadAttachments
  );

  $("#sendNotificationButton")?.addEventListener(
    "click",
    sendNotification
  );
}

async function initAdminPanel() {
  bindEvents();

  const authenticated =
    await loadAdmin();

  if (!authenticated) {
    return;
  }

  await Promise.all([
    loadCases(),
    loadAuditLogs(),
  ]);
}

document.addEventListener(
  "DOMContentLoaded",
  initAdminPanel
);

"use strict";

const state = {
  admin: null,
  cases: [],
  selectedCase: null
};

const STATUS_LABELS = {
  new: "جدید",
  under_review: "در حال بررسی",
  answered: "پاسخ داده شده",
  closed: "مختومه"
};

const CATEGORY_LABELS = {
  services: "خدمات",
  financial: "مالی",
  administrative: "اداری",
  technical: "فنی",
  behavior: "رفتار و نحوه برخورد",
  other: "سایر",
  "خدمات": "خدمات",
  "مالی": "مالی",
  "اداری": "اداری",
  "فنی": "فنی",
  "رفتار و نحوه برخورد": "رفتار و نحوه برخورد",
  "سایر": "سایر"
};

const $ = (selector) => document.querySelector(selector);

function normalizePersianDigits(value) {
  if (value === null || value === undefined) return "";

  return String(value)
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function toPersianDigits(value) {
  return String(value ?? "").replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[digit]);
}

function showAlert(message, type = "error") {
  const alert = $("#adminAlert");

  if (!alert) return;

  alert.textContent = message;
  alert.className = `alert alert-${type}`;

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function hideAlert() {
  const alert = $("#adminAlert");

  if (!alert) return;

  alert.className = "alert hidden";
  alert.textContent = "";
}

function showNotificationResult(message, type = "success") {
  const box = $("#notificationResult");

  if (!box) return;

  box.textContent = message;
  box.className = `alert alert-${type}`;

  setTimeout(() => {
    box.className = "alert hidden";
    box.textContent = "";
  }, 5000);
}

async function api(url, options = {}) {
  const config = {
    credentials: "include",
    ...options,
    headers: {
      ...(options.headers || {})
    }
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

  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(
      data.message ||
      data.error ||
      "در ارتباط با سرور مشکلی پیش آمد."
    );
  }

  return data;
}

async function loadAdmin() {
  try {
    const data = await api("/api/auth/me");

    if (!data.user) {
      window.location.href = "/auth.html";
      return false;
    }

    if (data.user.role !== "admin") {
      window.location.href = "/user.html";
      return false;
    }

    state.admin = data.user;

    const welcome = $("#adminWelcome");

    if (welcome) {
      welcome.textContent =
        `مدیر محترم، ${data.user.full_name || "کاربر مدیر"} خوش آمدید.`;
    }

    return true;
  } catch (error) {
    window.location.href = "/auth.html";
    return false;
  }
}

function getCaseUserName(caseItem) {
  return (
    caseItem.user_full_name ||
    caseItem.full_name ||
    caseItem.user_name ||
    caseItem.created_by_name ||
    "—"
  );
}

function getCaseUserPhone(caseItem) {
  return (
    caseItem.user_phone ||
    caseItem.phone ||
    caseItem.created_by_phone ||
    "—"
  );
}

function getCategoryLabel(category) {
  return CATEGORY_LABELS[category] || category || "—";
}

function getStatusLabel(status) {
  return STATUS_LABELS[status] || status || "—";
}

function statusBadge(status) {
  const label = getStatusLabel(status);

  return `
    <span class="status-badge status-${escapeHtml(status || "new")}">
      ${escapeHtml(label)}
    </span>
  `;
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return escapeHtml(value);
  }

  try {
    return new Intl.DateTimeFormat("fa-IR", {
      dateStyle: "short",
      timeStyle: "short"
    }).format(date);
  } catch {
    return date.toLocaleString("fa-IR");
  }
}

function calculateStats(cases) {
  const total = cases.length;

  let newCount = 0;
  let reviewCount = 0;
  let answeredCount = 0;
  let closedCount = 0;

  for (const item of cases) {
    switch (item.status) {
      case "new":
        newCount++;
        break;

      case "under_review":
        reviewCount++;
        break;

      case "answered":
        answeredCount++;
        break;

      case "closed":
        closedCount++;
        break;
    }
  }

  $("#totalCases").textContent = toPersianDigits(total);
  $("#newCases").textContent = toPersianDigits(newCount);
  $("#reviewCases").textContent = toPersianDigits(reviewCount);
  $("#answeredCases").textContent = toPersianDigits(answeredCount);
  $("#closedCases").textContent = toPersianDigits(closedCount);
}

function renderCases(cases) {
  const tbody = $("#casesTableBody");
  const tableWrapper = $("#casesTableWrapper");
  const empty = $("#casesEmpty");

  if (!tbody || !tableWrapper || !empty) return;

  tbody.innerHTML = "";

  if (!cases.length) {
    tableWrapper.classList.add("hidden");
    empty.classList.remove("hidden");
    return;
  }

  tableWrapper.classList.remove("hidden");
  empty.classList.add("hidden");

  for (const item of cases) {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>
        <strong class="tracking-code">
          ${escapeHtml(item.tracking_code || "—")}
        </strong>
      </td>

      <td>
        ${escapeHtml(item.subject || "—")}
      </td>

      <td>
        ${escapeHtml(getCategoryLabel(item.category))}
      </td>

      <td>
        ${escapeHtml(getCaseUserName(item))}
      </td>

      <td>
        ${statusBadge(item.status)}
      </td>

      <td>
        ${formatDate(item.created_at)}
      </td>

      <td>
        <button
          type="button"
          class="btn btn-secondary btn-small view-case-button"
          data-case-id="${escapeHtml(item.id)}"
        >
          مشاهده
        </button>
      </td>
    `;

    tbody.appendChild(row);
  }

  document.querySelectorAll(".view-case-button").forEach((button) => {
    button.addEventListener("click", () => {
      const id = Number(button.dataset.caseId);

      if (Number.isFinite(id)) {
        openCase(id);
      }
    });
  });
}

async function loadCases(search = "", status = "") {
  const loading = $("#casesLoading");

  if (loading) {
    loading.classList.remove("hidden");
  }

  try {
    const params = new URLSearchParams();

    if (search) {
      params.set("search", normalizePersianDigits(search).trim());
    }

    if (status) {
      params.set("status", status);
    }

    const query = params.toString();

    const data = await api(
      `/api/admin/cases${query ? `?${query}` : ""}`
    );

    state.cases = Array.isArray(data.cases)
      ? data.cases
      : Array.isArray(data)
        ? data
        : [];

    calculateStats(state.cases);
    renderCases(state.cases);
  } catch (error) {
    showAlert(error.message);
  } finally {
    if (loading) {
      loading.classList.add("hidden");
    }
  }
}

async function openCase(caseId) {
  hideAlert();

  const panel = $("#caseDetailsPanel");

  if (!panel) return;

  try {
    panel.classList.remove("hidden");

    const data = await api(`/api/cases/${caseId}`);

    const caseItem = data.case || data;

    state.selectedCase = caseItem;

    renderCaseDetails(caseItem, data);
    window.scrollTo({
      top: panel.offsetTop - 20,
      behavior: "smooth"
    });
  } catch (error) {
    panel.classList.add("hidden");
    showAlert(error.message);
  }
}

function renderCaseDetails(caseItem, data) {
  const trackingCode = caseItem.tracking_code || "—";

  $("#detailSubject").textContent =
    caseItem.subject || "بدون عنوان";

  $("#detailTrackingCode").textContent =
    `کد پیگیری: ${trackingCode}`;

  $("#detailCode").textContent = trackingCode;

  $("#detailStatus").innerHTML =
    statusBadge(caseItem.status);

  $("#detailCategory").textContent =
    getCategoryLabel(caseItem.category);

  $("#detailCreatedAt").textContent =
    formatDate(caseItem.created_at);

  $("#detailUserName").textContent =
    getCaseUserName(caseItem);

  $("#detailUserPhone").textContent =
    getCaseUserPhone(caseItem);

  $("#detailDescription").textContent =
    caseItem.description || "شرحی ثبت نشده است.";

  const otherSection = $("#otherPersonSection");

  if (caseItem.complainant_type === "other") {
    otherSection.classList.remove("hidden");

    $("#detailOtherName").textContent =
      caseItem.other_full_name || "—";

    $("#detailOtherPhone").textContent =
      caseItem.other_phone || "—";

    $("#detailOtherNationalId").textContent =
      caseItem.other_national_id || "—";
  } else {
    otherSection.classList.add("hidden");
  }

  renderSignature(caseItem.signature_data);
  renderAttachments(data.attachments || []);
  renderTimeline(data.events || []);

  $("#statusCaseId").value = caseItem.id;
  $("#caseStatus").value = caseItem.status || "new";
  $("#statusDescription").value = "";

  $("#notificationCaseId").value = caseItem.id;
  $("#notificationTitle").value = "";
  $("#notificationMessage").value = "";
}

function renderSignature(signatureData) {
  const image = $("#detailSignature");
  const message = $("#noSignatureMessage");

  if (!image || !message) return;

  if (
    typeof signatureData === "string" &&
    signatureData.startsWith("data:image/")
  ) {
    image.src = signatureData;
    image.classList.remove("hidden");
    message.classList.add("hidden");
  } else {
    image.removeAttribute("src");
    image.classList.add("hidden");
    message.classList.remove("hidden");
  }
}

function renderAttachments(attachments) {
  const container = $("#detailAttachments");

  if (!container) return;

  container.innerHTML = "";

  if (!attachments.length) {
    container.innerHTML = `
      <p class="muted-text">
        پیوستی برای این پرونده ثبت نشده است.
      </p>
    `;

    return;
  }

  for (const attachment of attachments) {
    const item = document.createElement("div");

    item.className = "attachment-item";

    const name = attachment.file_name || "فایل پیوست";
    const size = formatFileSize(attachment.file_size);

    item.innerHTML = `
      <div>
        <strong>${escapeHtml(name)}</strong>
        <small>${escapeHtml(size)}</small>
      </div>

      <a
        href="/api/attachments/${encodeURIComponent(attachment.id)}"
        target="_blank"
        rel="noopener noreferrer"
        class="btn btn-secondary btn-small"
      >
        مشاهده
      </a>
    `;

    container.appendChild(item);
  }
}

function formatFileSize(bytes) {
  const value = Number(bytes);

  if (!Number.isFinite(value) || value <= 0) {
    return "حجم نامشخص";
  }

  if (value < 1024) {
    return `${toPersianDigits(value)} بایت`;
  }

  if (value < 1024 * 1024) {
    return `${toPersianDigits(
      Math.round(value / 1024)
    )} کیلوبایت`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} مگابایت`;
}

function renderTimeline(events) {
  const timeline = $("#caseTimeline");

  if (!timeline) return;

  timeline.innerHTML = "";

  if (!events.length) {
    timeline.innerHTML = `
      <p class="muted-text">
        رویدادی برای این پرونده ثبت نشده است.
      </p>
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
          ${escapeHtml(event.event_type || "رویداد")}
        </strong>

        <p>
          ${escapeHtml(event.description || "بدون توضیح")}
        </p>

        <small>
          ${formatDate(event.created_at)}
        </small>
      </div>
    `;

    timeline.appendChild(item);
  }
}

async function updateCaseStatus(event) {
  event.preventDefault();

  const caseId = Number($("#statusCaseId").value);
  const status = $("#caseStatus").value;
  const description = $("#statusDescription").value.trim();

  if (!caseId) {
    showAlert("پرونده‌ای انتخاب نشده است.");
    return;
  }

  const button = event.submitter;

  if (button) {
    button.disabled = true;
    button.dataset.originalText = button.textContent;
    button.textContent = "در حال ذخیره...";
  }

  try {
    await api(`/api/cases/${caseId}`, {
      method: "PATCH",
      body: {
        status,
        description
      }
    });

    showAlert("وضعیت پرونده با موفقیت تغییر کرد.", "success");

    await loadCases(
      $("#searchInput").value.trim(),
      $("#statusFilter").value
    );

    await openCase(caseId);
  } catch (error) {
    showAlert(error.message);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent =
        button.dataset.originalText || "ذخیره وضعیت";
    }
  }
}

async function sendNotification(event) {
  event.preventDefault();

  const caseId = Number($("#notificationCaseId").value);
  const title = $("#notificationTitle").value.trim();
  const message = $("#notificationMessage").value.trim();

  if (!caseId) {
    showNotificationResult(
      "ابتدا یک پرونده را انتخاب کنید.",
      "error"
    );

    return;
  }

  if (!title || !message) {
    showNotificationResult(
      "عنوان و متن ابلاغیه را کامل کنید.",
      "error"
    );

    return;
  }

  const button = event.submitter;

  if (button) {
    button.disabled = true;
    button.dataset.originalText = button.textContent;
    button.textContent = "در حال ارسال...";
  }

  try {
    const caseItem = state.selectedCase;

    if (!caseItem) {
      throw new Error("پرونده انتخاب‌شده پیدا نشد.");
    }

    const userId = Number(
      caseItem.user_id ||
      caseItem.userId
    );

    if (!userId) {
      throw new Error(
        "شناسه کاربر این پرونده در اطلاعات پرونده موجود نیست."
      );
    }

    await api("/api/admin/notifications", {
      method: "POST",
      body: {
        user_id: userId,
        case_id: caseId,
        title,
        message
      }
    });

    $("#notificationTitle").value = "";
    $("#notificationMessage").value = "";

    showNotificationResult(
      "ابلاغیه با موفقیت ارسال شد.",
      "success"
    );
  } catch (error) {
    showNotificationResult(error.message, "error");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent =
        button.dataset.originalText || "ارسال ابلاغیه";
    }
  }
}

async function logout() {
  try {
    await api("/api/auth/logout", {
      method: "POST"
    });
  } catch {
    // حتی اگر درخواست خروج با خطا مواجه شد،
    // کاربر را به صفحه ورود می‌بریم.
  }

  window.location.href = "/auth.html";
}

function setupSearch() {
  const form = $("#searchForm");

  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const search = normalizePersianDigits(
      $("#searchInput").value
    ).trim();

    const status = $("#statusFilter").value;

    await loadCases(search, status);
  });

  $("#clearSearchButton").addEventListener("click", async () => {
    $("#searchInput").value = "";
    $("#statusFilter").value = "";

    await loadCases();
  });
}

function setupDetails() {
  const closeButton = $("#closeDetailsButton");

  if (closeButton) {
    closeButton.addEventListener("click", () => {
      $("#caseDetailsPanel").classList.add("hidden");
      state.selectedCase = null;
    });
  }

  const statusForm = $("#statusForm");

  if (statusForm) {
    statusForm.addEventListener("submit", updateCaseStatus);
  }

  const notificationForm = $("#notificationForm");

  if (notificationForm) {
    notificationForm.addEventListener(
      "submit",
      sendNotification
    );
  }
}

function setupLogout() {
  const button = $("#logoutButton");

  if (button) {
    button.addEventListener("click", logout);
  }
}

async function init() {
  const isAdmin = await loadAdmin();

  if (!isAdmin) return;

  setupSearch();
  setupDetails();
  setupLogout();

  await loadCases();
}

document.addEventListener("DOMContentLoaded", init);

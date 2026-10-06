(() => {
  "use strict";

  const userName = document.getElementById("userName");
  const totalCases = document.getElementById("totalCases");
  const reviewCases = document.getElementById("reviewCases");
  const answeredCases = document.getElementById("answeredCases");
  const unreadNotifications = document.getElementById("unreadNotifications");

  const casesContainer = document.getElementById("casesContainer");
  const notificationsContainer =
    document.getElementById("notificationsContainer");

  const dashboardMessage =
    document.getElementById("dashboardMessage");

  const logoutButton =
    document.getElementById("logoutButton");

  const STATUS_LABELS = {
    new: "جدید",
    under_review: "در حال بررسی",
    answered: "پاسخ داده شده",
    closed: "بسته شده"
  };

  function escapeHTML(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function showMessage(message, type = "error") {
    if (!dashboardMessage) return;

    dashboardMessage.hidden = false;
    dashboardMessage.textContent = message;
    dashboardMessage.className =
      `auth-message ${type}`;
  }

  function hideMessage() {
    if (!dashboardMessage) return;

    dashboardMessage.hidden = true;
    dashboardMessage.textContent = "";
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });

    let data = {};

    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok) {
      throw new Error(
        data.error ||
        data.message ||
        "خطا در ارتباط با سامانه."
      );
    }

    return data;
  }

  function formatDate(value) {
    if (!value) return "نامشخص";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat("fa-IR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function getStatusClass(status) {
    return {
      new: "status-new",
      under_review: "status-under-review",
      answered: "status-answered",
      closed: "status-closed"
    }[status] || "status-new";
  }

  function renderCases(cases) {
    if (!casesContainer) return;

    if (!Array.isArray(cases) || cases.length === 0) {
      casesContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <h3>هنوز شکایتی ثبت نکرده‌اید</h3>
          <p>
            برای شروع، روی «ثبت شکایت جدید» بزنید.
          </p>
          <a
            href="/complaint.html"
            class="btn btn-primary"
            style="margin-top:16px"
          >
            ثبت شکایت
          </a>
        </div>
      `;

      return;
    }

    casesContainer.innerHTML = cases.map(item => {
      const status =
        STATUS_LABELS[item.status] || item.status || "نامشخص";

      const statusClass =
        getStatusClass(item.status);

      return `
        <article class="case-card">

          <div class="case-main">

            <div class="case-top">

              <strong class="case-title">
                ${escapeHTML(item.subject)}
              </strong>

              <span class="status-badge ${statusClass}">
                ${escapeHTML(status)}
              </span>

            </div>

            <p class="case-description">
              ${escapeHTML(item.description)}
            </p>

            <div class="case-meta">

              <span>
                🗂 ${escapeHTML(item.category)}
              </span>

              <span>
                📅 ${escapeHTML(formatDate(item.created_at))}
              </span>

            </div>

          </div>

          <div class="case-actions">

            <div>
              <div class="case-code">
                ${escapeHTML(item.tracking_code)}
              </div>

              <a
                href="/complaint.html?case=${encodeURIComponent(item.id)}"
                class="btn btn-secondary"
                style="margin-top:10px"
              >
                مشاهده
              </a>
            </div>

          </div>

        </article>
      `;
    }).join("");
  }

  function renderNotifications(notifications) {
    if (!notificationsContainer) return;

    if (
      !Array.isArray(notifications) ||
      notifications.length === 0
    ) {
      notificationsContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔔</div>
          <h3>اعلان جدیدی ندارید</h3>
          <p>
            در صورت ثبت ابلاغیه یا پیام جدید، اینجا نمایش داده می‌شود.
          </p>
        </div>
      `;

      return;
    }

    notificationsContainer.innerHTML =
      notifications.map(notification => {

        const unread =
          Number(notification.is_viewed) !== 1;

        return `
          <article
            class="notification-card ${unread ? "unread" : ""}"
            data-notification-id="${Number(notification.id)}"
          >

            <div class="notification-header">

              <div>
                <div class="notification-title">
                  ${escapeHTML(notification.title)}
                </div>

                ${
                  unread
                    ? `<span class="status-badge status-new">
                         جدید
                       </span>`
                    : ""
                }
              </div>

              <span class="notification-date">
                ${escapeHTML(
                  formatDate(notification.created_at)
                )}
              </span>

            </div>

            <div class="notification-message">
              ${escapeHTML(notification.message)}
            </div>

            <div class="notification-actions">

              ${
                unread
                  ? `
                    <button
                      type="button"
                      class="btn btn-secondary notification-view"
                      data-id="${Number(notification.id)}"
                    >
                      علامت به‌عنوان مشاهده‌شده
                    </button>
                  `
                  : ""
              }

              ${
                Number(notification.is_confirmed) !== 1
                  ? `
                    <button
                      type="button"
                      class="btn btn-primary notification-confirm"
                      data-id="${Number(notification.id)}"
                    >
                      تأیید دریافت
                    </button>
                  `
                  : `
                    <span class="status-badge status-answered">
                      دریافت تأیید شده ✓
                    </span>
                  `
              }

            </div>

          </article>
        `;
      }).join("");
  }

  async function loadUser() {
    const data = await api("/api/auth/me");

    if (!data.authenticated || !data.user) {
      window.location.replace("/auth.html");
      return null;
    }

    if (data.user.role === "admin") {
      window.location.replace("/admin.html");
      return null;
    }

    if (userName) {
      userName.textContent =
        data.user.full_name || "کاربر";
    }

    return data.user;
  }

  async function loadCases() {
    const data = await api("/api/cases");

    const cases = Array.isArray(data)
      ? data
      : data.cases || [];

    renderCases(cases);

    if (totalCases) {
      totalCases.textContent =
        cases.length.toLocaleString("fa-IR");
    }

    if (reviewCases) {
      reviewCases.textContent =
        cases.filter(
          item => item.status === "under_review"
        ).length.toLocaleString("fa-IR");
    }

    if (answeredCases) {
      answeredCases.textContent =
        cases.filter(
          item =>
            item.status === "answered" ||
            item.status === "closed"
        ).length.toLocaleString("fa-IR");
    }

    return cases;
  }

  async function loadNotifications() {
    const data =
      await api("/api/notifications");

    const notifications = Array.isArray(data)
      ? data
      : data.notifications || [];

    renderNotifications(notifications);

    if (unreadNotifications) {
      unreadNotifications.textContent =
        notifications
          .filter(item =>
            Number(item.is_viewed) !== 1
          )
          .length
          .toLocaleString("fa-IR");
    }

    return notifications;
  }

  async function updateNotification(id, action) {
    await api(`/api/notifications/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ action })
    });

    await loadNotifications();
  }

  notificationsContainer?.addEventListener(
    "click",
    async event => {

      const viewButton =
        event.target.closest(".notification-view");

      const confirmButton =
        event.target.closest(".notification-confirm");

      if (!viewButton && !confirmButton) {
        return;
      }

      const button =
        viewButton || confirmButton;

      const id = button.dataset.id;

      if (!id) return;

      button.disabled = true;

      try {
        if (viewButton) {
          await updateNotification(
            id,
            "view"
          );
        } else {
          await updateNotification(
            id,
            "confirm"
          );
        }
      } catch (error) {
        showMessage(error.message);
        button.disabled = false;
      }
    }
  );

  logoutButton?.addEventListener(
    "click",
    async () => {

      logoutButton.disabled = true;
      logoutButton.textContent =
        "در حال خروج...";

      try {
        await api("/api/auth/logout", {
          method: "POST"
        });
      } catch {
        // حتی اگر پاسخ logout خطا داشته باشد،
        // نشست محلی کاربر باید پایان یابد.
      }

      window.location.replace("/auth.html");
    }
  );

  async function init() {
    try {
      hideMessage();

      const user = await loadUser();

      if (!user) return;

      await Promise.all([
        loadCases(),
        loadNotifications()
      ]);

    } catch (error) {
      console.error(error);

      showMessage(
        error.message ||
        "دریافت اطلاعات با خطا مواجه شد."
      );
    }
  }

  init();
})();

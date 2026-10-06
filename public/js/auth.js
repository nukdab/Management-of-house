(() => {
  "use strict";

  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");

  const loginTab = document.getElementById("loginTab");
  const registerTab = document.getElementById("registerTab");

  const authMessage = document.getElementById("authMessage");
  const authTitle = document.getElementById("authTitle");
  const authDescription = document.getElementById("authDescription");

  const loginButton = document.getElementById("loginButton");
  const registerButton = document.getElementById("registerButton");

  function showMessage(message, type = "error") {
    if (!authMessage) return;

    authMessage.hidden = false;
    authMessage.textContent = message;
    authMessage.className = `auth-message ${type}`;
  }

  function hideMessage() {
    if (!authMessage) return;

    authMessage.hidden = true;
    authMessage.textContent = "";
  }

  function setLoading(button, loading, normalText) {
    if (!button) return;

    button.disabled = loading;
    button.textContent = loading ? "لطفاً صبر کنید..." : normalText;
  }

  function normalizePhone(value) {
    let phone = String(value || "").trim();

    const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
    const arabicDigits = "٠١٢٣٤٥٦٧٨٩";

    phone = phone.replace(/[۰-۹]/g, digit =>
      String(persianDigits.indexOf(digit))
    );

    phone = phone.replace(/[٠-٩]/g, digit =>
      String(arabicDigits.indexOf(digit))
    );

    phone = phone.replace(/[\s\-()]/g, "");

    if (phone.startsWith("+98")) {
      phone = "0" + phone.slice(3);
    } else if (phone.startsWith("98") && phone.length === 12) {
      phone = "0" + phone.slice(2);
    }

    return phone;
  }

  function isValidPhone(phone) {
    return /^09\d{9}$/.test(phone);
  }

  function switchMode(mode) {
    hideMessage();

    const loginMode = mode === "login";

    loginForm.hidden = !loginMode;
    registerForm.hidden = loginMode;

    loginTab.classList.toggle("active", loginMode);
    registerTab.classList.toggle("active", !loginMode);

    if (loginMode) {
      authTitle.textContent = "ورود به سامانه";
      authDescription.textContent =
        "با شماره تلفن و رمز عبور خود وارد حساب کاربری شوید.";
    } else {
      authTitle.textContent = "ایجاد حساب کاربری";
      authDescription.textContent =
        "برای ثبت و پیگیری شکایت، حساب کاربری خود را ایجاد کنید.";
    }
  }

  async function apiRequest(url, options = {}) {
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
        "درخواست با خطا مواجه شد."
      );
    }

    return data;
  }

  async function checkExistingSession() {
    try {
      const response = await fetch("/api/auth/me", {
        credentials: "same-origin"
      });

      if (!response.ok) return;

      const data = await response.json();

      if (!data.authenticated || !data.user) return;

      if (data.user.role === "admin") {
        window.location.replace("/admin.html");
      } else {
        window.location.replace("/user.html");
      }
    } catch {
      // اگر نشست وجود نداشته باشد، کاربر در صفحه ورود می‌ماند.
    }
  }

  loginTab?.addEventListener("click", () => {
    switchMode("login");
  });

  registerTab?.addEventListener("click", () => {
    switchMode("register");
  });

  loginForm?.addEventListener("submit", async event => {
    event.preventDefault();

    hideMessage();

    const phoneInput = document.getElementById("loginPhone");
    const passwordInput = document.getElementById("loginPassword");

    const phone = normalizePhone(phoneInput.value);
    const password = passwordInput.value;

    phoneInput.value = phone;

    if (!isValidPhone(phone)) {
      showMessage(
        "شماره تلفن معتبر نیست. شماره را به صورت 09123456789 وارد کنید."
      );
      phoneInput.focus();
      return;
    }

    if (password.length < 6) {
      showMessage("رمز عبور باید حداقل ۶ کاراکتر باشد.");
      passwordInput.focus();
      return;
    }

    setLoading(loginButton, true, "ورود به حساب");

    try {
      const data = await apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          phone,
          password
        })
      });

      showMessage("ورود با موفقیت انجام شد.", "success");

      const role = data.user?.role;

      setTimeout(() => {
        if (role === "admin") {
          window.location.replace("/admin.html");
        } else {
          window.location.replace("/user.html");
        }
      }, 400);

    } catch (error) {
      showMessage(error.message);
      setLoading(loginButton, false, "ورود به حساب");
    }
  });

  registerForm?.addEventListener("submit", async event => {
    event.preventDefault();

    hideMessage();

    const nameInput = document.getElementById("registerName");
    const phoneInput = document.getElementById("registerPhone");
    const passwordInput = document.getElementById("registerPassword");
    const confirmInput =
      document.getElementById("registerPasswordConfirm");
    const termsInput = document.getElementById("acceptTerms");

    const fullName = nameInput.value.trim();
    const phone = normalizePhone(phoneInput.value);
    const password = passwordInput.value;
    const passwordConfirm = confirmInput.value;

    phoneInput.value = phone;

    if (fullName.length < 3) {
      showMessage("نام و نام خانوادگی را کامل وارد کنید.");
      nameInput.focus();
      return;
    }

    if (!isValidPhone(phone)) {
      showMessage(
        "شماره تلفن معتبر نیست. شماره را به صورت 09123456789 وارد کنید."
      );
      phoneInput.focus();
      return;
    }

    if (password.length < 6) {
      showMessage("رمز عبور باید حداقل ۶ کاراکتر باشد.");
      passwordInput.focus();
      return;
    }

    if (password !== passwordConfirm) {
      showMessage("رمز عبور و تکرار آن یکسان نیستند.");
      confirmInput.focus();
      return;
    }

    if (!termsInput.checked) {
      showMessage("برای ایجاد حساب باید قوانین و شرایط را بپذیرید.");
      return;
    }

    setLoading(
      registerButton,
      true,
      "ایجاد حساب کاربری"
    );

    try {
      await apiRequest("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          full_name: fullName,
          phone,
          password
        })
      });

      showMessage(
        "حساب کاربری با موفقیت ایجاد شد. اکنون وارد حساب شوید.",
        "success"
      );

      registerForm.reset();

      setTimeout(() => {
        switchMode("login");

        const loginPhone =
          document.getElementById("loginPhone");

        if (loginPhone) {
          loginPhone.value = phone;
          loginPhone.focus();
        }
      }, 700);

    } catch (error) {
      showMessage(error.message);
    } finally {
      setLoading(
        registerButton,
        false,
        "ایجاد حساب کاربری"
      );
    }
  });

  checkExistingSession();
})();

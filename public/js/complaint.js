(() => {
  "use strict";

  const form = document.getElementById("complaintForm");
  const formSection = document.getElementById("complaintFormSection");
  const successSection = document.getElementById("successSection");
  const formMessage = document.getElementById("formMessage");
  const submitButton = document.getElementById("submitButton");

  const otherPersonFields = document.getElementById("otherPersonFields");
  const otherFullName = document.getElementById("otherFullName");
  const otherPhone = document.getElementById("otherPhone");
  const otherNationalId = document.getElementById("otherNationalId");

  const description = document.getElementById("description");
  const descriptionCount = document.getElementById("descriptionCount");

  const attachmentsInput = document.getElementById("attachments");
  const attachmentList = document.getElementById("attachmentList");

  const canvas = document.getElementById("signatureCanvas");
  const clearSignatureButton = document.getElementById("clearSignature");
  const signatureStatus = document.getElementById("signatureStatus");

  const trackingCode = document.getElementById("trackingCode");
  const copyTrackingCode = document.getElementById("copyTrackingCode");
  const newComplaintButton = document.getElementById("newComplaintButton");

  let drawing = false;
  let signatureDirty = false;

  const ctx = canvas.getContext("2d");

  function normalizeDigits(value) {
    const persian = "۰۱۲۳۴۵۶۷۸۹";
    const arabic = "٠١٢٣٤٥٦٧٨٩";

    return String(value || "")
      .replace(/[۰-۹]/g, char => String(persian.indexOf(char)))
      .replace(/[٠-٩]/g, char => String(arabic.indexOf(char)));
  }

  function normalizePhone(value) {
    let phone = normalizeDigits(value)
      .trim()
      .replace(/[\s()-]/g, "");

    if (phone.startsWith("+98")) {
      phone = "0" + phone.slice(3);
    }

    if (phone.startsWith("0098")) {
      phone = "0" + phone.slice(4);
    }

    return phone;
  }

  function showMessage(message, type = "error") {
    formMessage.textContent = message;
    formMessage.hidden = false;
    formMessage.className = `form-message ${type}`;

    formMessage.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }

  function hideMessage() {
    formMessage.hidden = true;
    formMessage.textContent = "";
  }

  async function readJson(response) {
    try {
      return await response.json();
    } catch {
      return {};
    }
  }

  async function checkAuth() {
    try {
      const response = await fetch("/api/auth/me", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store"
      });

      if (!response.ok) {
        window.location.replace("/auth.html");
        return null;
      }

      const data = await readJson(response);

      if (!data.success || !data.authenticated) {
        window.location.replace("/auth.html");
        return null;
      }

      return data.user;
    } catch {
      window.location.replace("/auth.html");
      return null;
    }
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.max(window.devicePixelRatio || 1, 1);

    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }

  function clearSignature() {
    ctx.clearRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    signatureDirty = false;

    signatureStatus.textContent =
      "هنوز امضایی ثبت نشده است.";
  }

  function getPoint(event) {
    const rect = canvas.getBoundingClientRect();

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  function startDrawing(event) {
    event.preventDefault();

    drawing = true;

    const point = getPoint(event);

    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  }

  function draw(event) {
    if (!drawing) return;

    event.preventDefault();

    const point = getPoint(event);

    ctx.lineTo(point.x, point.y);
    ctx.stroke();

    signatureDirty = true;

    signatureStatus.textContent =
      "امضا ثبت شده است.";
  }

  function stopDrawing(event) {
    if (!drawing) return;

    event.preventDefault();

    drawing = false;

    ctx.closePath();
  }

  function isCanvasBlank() {
    const pixels = ctx.getImageData(
      0,
      0,
      canvas.width,
      canvas.height
    ).data;

    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] !== 0) {
        return false;
      }
    }

    return true;
  }

  function updateOtherPersonFields() {
    const selected = document.querySelector(
      "input[name='complainant_type']:checked"
    );

    const isOther = selected?.value === "other";

    otherPersonFields.hidden = !isOther;

    otherFullName.required = isOther;

    if (!isOther) {
      otherFullName.value = "";
      otherPhone.value = "";
      otherNationalId.value = "";
    }
  }

  function updateDescriptionCount() {
    descriptionCount.textContent =
      normalizeDigits(description.value.length);
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return "۰ بایت";
    }

    const units = [
      "بایت",
      "کیلوبایت",
      "مگابایت",
      "گیگابایت"
    ];

    const index = Math.min(
      Math.floor(Math.log(bytes) / Math.log(1024)),
      units.length - 1
    );

    const value =
      bytes / Math.pow(1024, index);

    return (
      normalizeDigits(
        value.toFixed(index === 0 ? 0 : 1)
      ) +
      " " +
      units[index]
    );
  }

  function renderAttachmentList() {
    attachmentList.innerHTML = "";

    const files = Array.from(
      attachmentsInput.files || []
    );

    if (!files.length) {
      attachmentList.textContent =
        "فایلی انتخاب نشده است.";

      return;
    }

    files.forEach(file => {
      const item = document.createElement("div");

      item.className =
        "attachment-item";

      const name = document.createElement("strong");

      name.textContent =
        file.name;

      const size = document.createElement("span");

      size.textContent =
        formatBytes(file.size);

      item.append(name, size);

      attachmentList.appendChild(item);
    });
  }

  async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const result =
          String(reader.result || "");

        const comma =
          result.indexOf(",");

        resolve(
          comma >= 0
            ? result.slice(comma + 1)
            : result
        );
      };

      reader.onerror = () => {
        reject(
          new Error(
            "خواندن فایل انجام نشد."
          )
        );
      };

      reader.readAsDataURL(file);
    });
  }

  async function collectAttachments() {
    const files = Array.from(
      attachmentsInput.files || []
    );

    const maxFileSize =
      500 * 1024;

    const maxTotalSize =
      1500 * 1024;

    let totalSize = 0;

    for (const file of files) {
      totalSize += file.size;

      if (file.size > maxFileSize) {
        throw new Error(
          "حجم هر فایل باید حداکثر ۵۰۰ کیلوبایت باشد."
        );
      }
    }

    if (totalSize > maxTotalSize) {
      throw new Error(
        "حجم مجموع فایل‌ها باید حداکثر ۱.۵ مگابایت باشد."
      );
    }

    const attachments = [];

    for (const file of files) {
      attachments.push({
        file_name:
          file.name.slice(0, 200),

        content_type:
          file.type ||
          "application/octet-stream",

        file_size:
          file.size,

        file_data:
          await fileToBase64(file)
      });
    }

    return attachments;
  }

  async function submitComplaint(event) {
    event.preventDefault();

    hideMessage();

    if (submitButton.disabled) {
      return;
    }

    const complainantType =
      document.querySelector(
        "input[name='complainant_type']:checked"
      )?.value || "self";

    const category =
      document.getElementById(
        "category"
      ).value.trim();

    const subject =
      document.getElementById(
        "subject"
      ).value.trim();

    const descriptionValue =
      description.value.trim();

    if (!category) {
      showMessage(
        "لطفاً دسته‌بندی شکایت را انتخاب کنید."
      );
      return;
    }

    if (!subject) {
      showMessage(
        "موضوع شکایت را وارد کنید."
      );
      return;
    }

    if (!descriptionValue) {
      showMessage(
        "شرح شکایت را وارد کنید."
      );
      return;
    }

    if (
      complainantType === "other" &&
      !otherFullName.value.trim()
    ) {
      showMessage(
        "نام شخص موردنظر را وارد کنید."
      );
      return;
    }

    const normalizedPhone =
      normalizePhone(
        otherPhone.value
      );

    if (
      complainantType === "other" &&
      normalizedPhone &&
      !/^09\d{9}$/.test(
        normalizedPhone
      )
    ) {
      showMessage(
        "شماره تلفن شخص موردنظر معتبر نیست."
      );
      return;
    }

    const nationalId =
      normalizeDigits(
        otherNationalId.value
      ).replace(/\D/g, "");

    if (
      complainantType === "other" &&
      nationalId &&
      !/^\d{10}$/.test(
        nationalId
      )
    ) {
      showMessage(
        "کد ملی باید ۱۰ رقم باشد."
      );
      return;
    }

    if (isCanvasBlank()) {
      showMessage(
        "لطفاً امضای خود را داخل کادر رسم کنید."
      );
      return;
    }

    submitButton.disabled = true;

    submitButton.textContent =
      "در حال ثبت...";

    try {
      const attachments =
        await collectAttachments();

      const payload = {
        complainant_type:
          complainantType,

        other_full_name:
          complainantType === "other"
            ? otherFullName.value.trim()
            : null,

        other_phone:
          complainantType === "other"
            ? normalizedPhone
            : null,

        other_national_id:
          complainantType === "other"
            ? nationalId
            : null,

        category,

        subject,

        description:
          descriptionValue,

        signature_data:
          canvas.toDataURL(
            "image/png"
          ),

        attachments
      };

      const response =
        await fetch(
          "/api/cases",
          {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "Content-Type":
                "application/json"
            },
            body:
              JSON.stringify(payload)
          }
        );

      const data =
        await readJson(response);

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
          "ثبت شکایت انجام نشد."
        );
      }

      const code =
        data.case?.tracking_code;

      if (!code) {
        throw new Error(
          "ثبت انجام شد اما کد رهگیری از سرور دریافت نشد."
        );
      }

      trackingCode.textContent =
        code;

      formSection.hidden = true;
      successSection.hidden = false;

      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });

    } catch (error) {
      showMessage(
        error.message ||
        "خطایی هنگام ثبت شکایت رخ داد."
      );
    } finally {
      submitButton.disabled = false;

      submitButton.textContent =
        "ثبت نهایی شکایت";
    }
  }

  async function copyCode() {
    const code =
      trackingCode.textContent.trim();

    if (!code) return;

    try {
      await navigator.clipboard.writeText(
        code
      );

      copyTrackingCode.textContent =
        "کپی شد ✓";

      setTimeout(() => {
        copyTrackingCode.textContent =
          "کپی کد رهگیری";
      }, 1600);

    } catch {
      showMessage(
        "کپی خودکار در این مرورگر در دسترس نیست.",
        "warning"
      );
    }
  }

  function resetForm() {
    form.reset();

    document.querySelector(
      "input[name='complainant_type'][value='self']"
    ).checked = true;

    updateOtherPersonFields();
    updateDescriptionCount();
    renderAttachmentList();
    clearSignature();

    successSection.hidden = true;
    formSection.hidden = false;

    hideMessage();

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }

  async function init() {
    const user =
      await checkAuth();

    if (!user) return;

    resizeCanvas();

    updateOtherPersonFields();
    updateDescriptionCount();
    renderAttachmentList();

    document
      .querySelectorAll(
        "input[name='complainant_type']"
      )
      .forEach(input => {
        input.addEventListener(
          "change",
          updateOtherPersonFields
        );
      });

    description.addEventListener(
      "input",
      updateDescriptionCount
    );

    attachmentsInput.addEventListener(
      "change",
      renderAttachmentList
    );

    clearSignatureButton.addEventListener(
      "click",
      clearSignature
    );

    canvas.addEventListener(
      "pointerdown",
      startDrawing
    );

    canvas.addEventListener(
      "pointermove",
      draw
    );

    canvas.addEventListener(
      "pointerup",
      stopDrawing
    );

    canvas.addEventListener(
      "pointercancel",
      stopDrawing
    );

    canvas.addEventListener(
      "pointerleave",
      stopDrawing
    );

    form.addEventListener(
      "submit",
      submitComplaint
    );

    copyTrackingCode.addEventListener(
      "click",
      copyCode
    );

    newComplaintButton.addEventListener(
      "click",
      resetForm
    );
  }

  init();
})();

// ==========================================
// سامانه ثبت و پیگیری شکایات
// Main Frontend JavaScript
// ==========================================


// ==========================================
// Helpers
// ==========================================

const $ = (selector) => document.querySelector(selector);

const $$ = (selector) => document.querySelectorAll(selector);


// ==========================================
// Theme
// ==========================================

const body = document.body;
const themeToggle = $("#themeToggle");

const savedTheme = localStorage.getItem("complaint-theme");

if (savedTheme === "light") {
  body.classList.add("light");
}


function updateThemeIcon() {
  if (!themeToggle) return;

  if (body.classList.contains("light")) {
    themeToggle.textContent = "🌙";
    themeToggle.setAttribute(
      "aria-label",
      "فعال کردن حالت تاریک"
    );
  } else {
    themeToggle.textContent = "☀️";
    themeToggle.setAttribute(
      "aria-label",
      "فعال کردن حالت روشن"
    );
  }
}


updateThemeIcon();


if (themeToggle) {

  themeToggle.addEventListener("click", () => {

    body.classList.toggle("light");

    const theme =
      body.classList.contains("light")
        ? "light"
        : "dark";

    localStorage.setItem(
      "complaint-theme",
      theme
    );

    updateThemeIcon();

  });

}


// ==========================================
// Modal
// ==========================================

const modal = $("#modal");
const modalContent = $("#modalContent");
const closeModalButton = $("#closeModal");


const modalTemplates = {

  login: `
    <div class="modal-title">
      ورود به پنل کاربری
    </div>

    <p class="modal-description">
      برای ورود، شماره موبایل خود را وارد کنید
      تا کد تأیید برای شما ارسال شود.
    </p>

    <div class="form-group">
      <label for="loginPhone">
        شماره موبایل
      </label>

      <input
        id="loginPhone"
        type="tel"
        inputmode="numeric"
        placeholder="09xxxxxxxxx"
        autocomplete="tel"
      >
    </div>

    <button
      type="button"
      class="btn btn-primary modal-submit"
      id="sendOtpButton"
    >
      ارسال کد تأیید
    </button>
  `,


  complaint: `
    <div class="modal-title">
      ثبت شکایت
    </div>

    <p class="modal-description">
      اطلاعات اولیه درخواست یا شکایت خود را
      وارد کنید.
    </p>

    <div class="form-group">
      <label for="complaintSubject">
        موضوع شکایت
      </label>

      <input
        id="complaintSubject"
        type="text"
        placeholder="موضوع پرونده"
      >
    </div>

    <div class="form-group">
      <label for="complaintDescription">
        شرح شکایت
      </label>

      <textarea
        id="complaintDescription"
        placeholder="شرح کامل درخواست یا شکایت..."
      ></textarea>
    </div>

    <button
      type="button"
      class="btn btn-primary modal-submit"
      id="continueComplaintButton"
    >
      ادامه و بررسی اطلاعات
    </button>
  `,


  tracking: `
    <div class="modal-title">
      پیگیری پرونده
    </div>

    <p class="modal-description">
      کد پیگیری پرونده خود را وارد کنید
      تا وضعیت آن را مشاهده کنید.
    </p>

    <div class="form-group">
      <label for="trackingCode">
        کد پیگیری
      </label>

      <input
        id="trackingCode"
        type="text"
        placeholder="مثلاً CMP-1405-0001"
      >
    </div>

    <button
      type="button"
      class="btn btn-primary modal-submit"
      id="trackingButton"
    >
      مشاهده وضعیت پرونده
    </button>
  `

};


// ==========================================
// Open Modal
// ==========================================

function openModal(type) {

  if (!modal || !modalContent) return;

  if (!modalTemplates[type]) return;

  modalContent.innerHTML =
    modalTemplates[type];

  modal.classList.add("open");

  modal.setAttribute(
    "aria-hidden",
    "false"
  );

  document.body.style.overflow = "hidden";

  setupModalActions();

}


// ==========================================
// Close Modal
// ==========================================

function closeModal() {

  if (!modal) return;

  modal.classList.remove("open");

  modal.setAttribute(
    "aria-hidden",
    "true"
  );

  document.body.style.overflow = "";

}


// ==========================================
// Modal Buttons
// ==========================================

$$("[data-modal]").forEach((button) => {

  button.addEventListener(
    "click",
    () => {

      const type =
        button.dataset.modal;

      openModal(type);

    }
  );

});


if (closeModalButton) {

  closeModalButton.addEventListener(
    "click",
    closeModal
  );

}


// ==========================================
// Close when clicking outside
// ==========================================

if (modal) {

  modal.addEventListener(
    "click",
    (event) => {

      if (
        event.target.classList.contains(
          "modal-backdrop"
        )
      ) {

        closeModal();

      }

    }
  );

}


// ==========================================
// Escape key
// ==========================================

document.addEventListener(
  "keydown",
  (event) => {

    if (
      event.key === "Escape" &&
      modal &&
      modal.classList.contains("open")
    ) {

      closeModal();

    }

  }
);


// ==========================================
// Modal Actions
// ==========================================

function setupModalActions() {

  const sendOtpButton =
    $("#sendOtpButton");


  const continueComplaintButton =
    $("#continueComplaintButton");


  const trackingButton =
    $("#trackingButton");


  // ----------------------------------------
  // Login
  // ----------------------------------------

  if (sendOtpButton) {

    sendOtpButton.addEventListener(
      "click",
      () => {

        const phone =
          $("#loginPhone")?.value.trim();


        if (!phone) {

          showModalMessage(
            "لطفاً شماره موبایل خود را وارد کنید."
          );

          return;

        }


        if (
          !/^09\d{9}$/.test(phone)
        ) {

          showModalMessage(
            "شماره موبایل واردشده معتبر نیست."
          );

          return;

        }


        showModalMessage(
          "در نسخه فعلی، ارسال واقعی کد تأیید هنوز به سرویس OTP متصل نشده است."
        );

      }
    );

  }


  // ----------------------------------------
  // Complaint
  // ----------------------------------------

  if (continueComplaintButton) {

    continueComplaintButton.addEventListener(
      "click",
      () => {

        const subject =
          $("#complaintSubject")?.value.trim();


        const description =
          $("#complaintDescription")?.value.trim();


        if (!subject) {

          showModalMessage(
            "لطفاً موضوع شکایت را وارد کنید."
          );

          return;

        }


        if (!description) {

          showModalMessage(
            "لطفاً شرح شکایت را وارد کنید."
          );

          return;

        }


        showModalMessage(
          "اطلاعات اولیه دریافت شد. مرحله بررسی و ثبت نهایی در نسخه بعدی فعال می‌شود."
        );

      }
    );

  }


  // ----------------------------------------
  // Tracking
  // ----------------------------------------

  if (trackingButton) {

    trackingButton.addEventListener(
      "click",
      () => {

        const code =
          $("#trackingCode")?.value.trim();


        if (!code) {

          showModalMessage(
            "لطفاً کد پیگیری را وارد کنید."
          );

          return;

        }


        showModalMessage(
          "پیگیری واقعی پرونده پس از اتصال سامانه به پایگاه داده فعال خواهد شد."
        );

      }
    );

  }

}


// ==========================================
// Modal Message
// ==========================================

function showModalMessage(message) {

  if (!modalContent) return;


  const oldMessage =
    modalContent.querySelector(
      ".modal-message"
    );


  if (oldMessage) {
    oldMessage.remove();
  }


  const messageElement =
    document.createElement("div");


  messageElement.className =
    "modal-message";


  messageElement.style.marginTop =
    "14px";


  messageElement.style.padding =
    "11px 13px";


  messageElement.style.border =
    "1px solid var(--border)";


  messageElement.style.borderRadius =
    "12px";


  messageElement.style.background =
    "var(--glass-light)";


  messageElement.style.color =
    "var(--text-secondary)";


  messageElement.style.fontSize =
    "11px";


  messageElement.textContent =
    message;


  modalContent.appendChild(
    messageElement
  );

}


// ==========================================
// Scroll Reveal Animation
// ==========================================

const revealElements =
  $$(".reveal");


if (
  "IntersectionObserver" in window
) {

  const observer =
    new IntersectionObserver(
      (entries) => {

        entries.forEach(
          (entry) => {

            if (
              entry.isIntersecting
            ) {

              entry.target.classList.add(
                "show"
              );

              observer.unobserve(
                entry.target
              );

            }

          }
        );

      },
      {
        threshold: 0.12
      }
    );


  revealElements.forEach(
    (element) => {

      observer.observe(
        element
      );

    }
  );

} else {

  revealElements.forEach(
    (element) => {

      element.classList.add(
        "show"
      );

    }
  );

}


// ==========================================
// Smooth Navigation
// ==========================================

$$('a[href^="#"]').forEach(
  (link) => {

    link.addEventListener(
      "click",
      (event) => {

        const targetId =
          link.getAttribute("href");


        if (
          !targetId ||
          targetId === "#"
        ) {
          return;
        }


        const target =
          document.querySelector(
            targetId
          );


        if (!target) {
          return;
        }


        event.preventDefault();


        target.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });

      }
    );

  }
);


// ==========================================
// Initial Page State
// ==========================================

window.addEventListener(
  "load",
  () => {

    document
      .querySelectorAll(".hero .reveal")
      .forEach((element) => {

        setTimeout(() => {

          element.classList.add(
            "show"
          );

        }, 150);

      });

  }
);

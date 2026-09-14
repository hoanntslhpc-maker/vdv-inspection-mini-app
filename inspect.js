<!DOCTYPE html>
<html lang="vi">
<head>

  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0, viewport-fit=cover"
  >

  <title>Kiểm tra thiết bị</title>

  <link
    rel="stylesheet"
    href="./inspect.css"
  >

  <script
    src="https://telegram.org/js/telegram-web-app.js"
  ></script>

</head>


<body>

  <main class="app-container">

    <!-- ===================================================
         HEADER
    ==================================================== -->

    <section class="page-header">

      <h1>
        KIỂM TRA THIẾT BỊ
      </h1>

    </section>


    <!-- ===================================================
         LOADING / ERROR
    ==================================================== -->

    <section
      id="loading"
      class="loading-card"
    >

      Đang tải dữ liệu...

    </section>


    <!-- ===================================================
         JOB INFO
    ==================================================== -->

    <section
      id="jobInfo"
      class="card hidden"
    >

      <div class="job-grid">

        <div class="job-field">

          <div class="job-label">
            Mã công việc
          </div>

          <div
            id="jobId"
            class="job-value"
          >
            -
          </div>

        </div>


        <div class="job-field">

          <div class="job-label">
            Nội dung
          </div>

          <div
            id="jobRequest"
            class="job-value"
          >
            -
          </div>

        </div>


        <div class="job-field">

          <div class="job-label">
            Người yêu cầu
          </div>

          <div
            id="jobRequester"
            class="job-value"
          >
            -
          </div>

        </div>


        <div class="job-field">

          <div class="job-label">
            Tổng thiết bị
          </div>

          <div
            id="deviceCount"
            class="job-value"
          >
            0
          </div>

        </div>


        <div class="job-field">

          <div class="job-label">
            Trạng thái
          </div>

          <div
            id="jobStatus"
            class="job-value"
          >
            -
          </div>

        </div>

      </div>

    </section>


    <!-- ===================================================
         DEVICE TYPE
    ==================================================== -->

    <section
      id="deviceTypeSection"
      class="section hidden"
    >

      <h2>
        1. Chọn loại thiết bị
      </h2>

      <div
        id="deviceTypes"
        class="device-type-grid"
      ></div>

    </section>


    <!-- ===================================================
         DEVICE LIST
    ==================================================== -->

    <section
      id="deviceSection"
      class="section hidden"
    >

      <h2>
        2. Chọn thiết bị kiểm tra
      </h2>

      <div
        id="deviceList"
        class="device-list"
      ></div>

    </section>


    <!-- ===================================================
         PROCEDURE
    ==================================================== -->

    <section
      id="procedureSection"
      class="section hidden"
    >

      <h2>
        3. Thực hiện quy trình kiểm tra
      </h2>


      <div
        id="selectedDeviceBox"
        class="selected-device-box"
      >

        <div class="selected-device-label">
          Thiết bị đang kiểm tra
        </div>

        <div
          id="selectedDeviceCode"
          class="selected-device-code"
        ></div>

      </div>


      <!--
        Không dùng <form>.
        Toàn bộ input nằm trực tiếp trong div
        để tránh browser/WebView tự submit.
      -->

      <div
        id="procedureList"
      ></div>

    </section>


    <!-- ===================================================
         SAVE
    ==================================================== -->

    <section
      id="saveSection"
      class="save-section hidden"
    >

      <button
        id="saveInspectionButton"
        type="button"
        class="btn btn-primary btn-save"
        onclick="saveInspection(event)"
      >
        💾 LƯU KẾT QUẢ KIỂM TRA
      </button>

    </section>


    <!-- ===================================================
         BACK
    ==================================================== -->

    <section class="bottom-actions">

      <button
        type="button"
        class="btn btn-secondary"
        onclick="goBackToTelegram()"
      >
        ← Quay lại
      </button>

    </section>

  </main>


  <!-- =====================================================
       JS
  ====================================================== -->

  <script src="./inspect.js"></script>


  <script>

    /* =====================================================
       TELEGRAM WEB APP INITIALIZATION
    ===================================================== */

    try {

      if (
        window.Telegram
        &&
        window.Telegram.WebApp
      ) {

        window.Telegram.WebApp.ready();

        window.Telegram.WebApp.expand();

      }

    }

    catch (error) {

      console.log(
        "Telegram WebApp init error:",
        error
      );

    }


    /* =====================================================
       BACK BUTTON
    ===================================================== */

    function goBackToTelegram() {

      try {

        if (
          window.Telegram
          &&
          window.Telegram.WebApp
          &&
          typeof window.Telegram.WebApp.close === "function"
        ) {

          window.Telegram.WebApp.close();

          return;

        }

      }

      catch (error) {

        console.log(
          "Telegram close error:",
          error
        );

      }


      if (
        window.history.length > 1
      ) {

        window.history.back();

      }

    }


    /* =====================================================
       CHẶN SUBMIT TOÀN CỤC
       phòng trường hợp browser hiểu Enter là submit
    ===================================================== */

    document.addEventListener(
      "submit",
      function(event) {

        event.preventDefault();

        return false;

      }
    );

  </script>

</body>
</html>
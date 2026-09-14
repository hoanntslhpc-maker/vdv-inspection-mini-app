/* =========================================================
   VDV INSPECTION MINI APP
   inspect.js
========================================================= */


/* =========================================================
   1. API CONFIG
========================================================= */

const API_BASE =
  "https://kiemtrathietbi.app.n8n.cloud/webhook";

const GET_JOB_API =
  `${API_BASE}/get-job`;

const GET_PROCEDURE_API =
  `${API_BASE}/get-procedure`;


/* =========================================================
   2. GLOBAL STATE
========================================================= */

let currentJob = null;

let devices = [];

let deviceGroups = {};

let selectedType = null;

let selectedDevice = null;

let currentProcedure = [];

let inspectionResults = {};


/* =========================================================
   3. GET JOB ID FROM URL
========================================================= */

const params =
  new URLSearchParams(
    window.location.search
  );

const jobId =
  params.get("job");


/* =========================================================
   4. DOM READY
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    if (!jobId) {

      showError(
        "Không tìm thấy mã công việc trong URL."
      );

      return;
    }

    loadJob();

  }
);


/* =========================================================
   5. LOAD JOB
========================================================= */

async function loadJob() {

  setLoading(
    "Đang tải thông tin công việc..."
  );

  try {

    const url =
      `${GET_JOB_API}?job=${encodeURIComponent(jobId)}`;

    const response =
      await fetch(url);

    if (!response.ok) {

      throw new Error(
        `HTTP ${response.status}`
      );

    }

    const data =
      await response.json();


    /* -----------------------------------------
       n8n có thể trả object hoặc array
    ----------------------------------------- */

    if (Array.isArray(data)) {

      if (data.length === 0) {

        throw new Error(
          "Không tìm thấy công việc."
        );

      }

      currentJob = data[0];

    } else {

      currentJob = data;

    }


    /* -----------------------------------------
       Parse devices_json
    ----------------------------------------- */

    devices =
      parseDevices(
        currentJob.devices_json
      );


    if (!devices.length) {

      throw new Error(
        "Công việc không có thiết bị."
      );

    }


    /* -----------------------------------------
       Group devices
    ----------------------------------------- */

    deviceGroups =
      groupDevicesByType(devices);


    renderJob();

    renderDeviceTypes();

  }

  catch (error) {

    console.error(
      "LOAD JOB ERROR:",
      error
    );

    showError(
      "Không tải được thông tin công việc. " +
      error.message
    );

  }

}


/* =========================================================
   6. PARSE DEVICES
========================================================= */

function parseDevices(value) {

  if (Array.isArray(value)) {
    return value;
  }

  if (!value) {
    return [];
  }

  try {

    const parsed =
      JSON.parse(value);

    return Array.isArray(parsed)
      ? parsed
      : [];

  }

  catch (error) {

    console.error(
      "devices_json invalid:",
      error
    );

    return [];

  }

}


/* =========================================================
   7. GROUP DEVICE BY SENSOR TYPE
========================================================= */

function groupDevicesByType(list) {

  const groups = {};

  list.forEach(device => {

    const type =
      String(
        device.sensor_type ||
        "OTHER"
      )
      .trim()
      .toUpperCase();

    if (!groups[type]) {
      groups[type] = [];
    }

    groups[type].push(device);

  });

  return groups;

}


/* =========================================================
   8. RENDER JOB INFORMATION
========================================================= */

function renderJob() {

  const loading =
    document.getElementById("loading");

  if (loading) {
    loading.style.display = "none";
  }


  setText(
    "jobId",
    currentJob.job_id || jobId
  );

  setText(
    "jobRequest",
    currentJob.request || "-"
  );

  setText(
    "jobRequester",
    currentJob.requester_name ||
    "Không xác định"
  );

  setText(
    "deviceCount",
    devices.length
  );

  setText(
    "jobStatus",
    formatStatus(
      currentJob.status
    )
  );


  showElement(
    "jobInfo"
  );

  showElement(
    "deviceTypeSection"
  );

}


/* =========================================================
   9. RENDER DEVICE TYPES
========================================================= */

function renderDeviceTypes() {

  const container =
    document.getElementById(
      "deviceTypes"
    );

  if (!container) {

    console.error(
      "Không tìm thấy #deviceTypes"
    );

    return;
  }

  container.innerHTML = "";


  Object.entries(
    deviceGroups
  ).forEach(
    ([type, list]) => {

      const button =
        document.createElement(
          "button"
        );

      button.type = "button";

      button.className =
        "device-type-button";


      const displayName =
        getSensorTypeName(type);


      button.innerHTML = `
        <div class="device-type-name">
          ${escapeHtml(displayName)}
        </div>

        <div class="device-type-count">
          ${list.length} thiết bị
        </div>
      `;


      button.addEventListener(
        "click",
        () => {

          selectDeviceType(
            type,
            button
          );

        }
      );


      container.appendChild(
        button
      );

    }
  );

}


/* =========================================================
   10. SELECT DEVICE TYPE
========================================================= */

function selectDeviceType(
  type,
  button
) {

  selectedType = type;

  selectedDevice = null;

  currentProcedure = [];


  document
    .querySelectorAll(
      ".device-type-button"
    )
    .forEach(btn => {

      btn.classList.remove(
        "active"
      );

    });


  button.classList.add(
    "active"
  );


  renderDevices(
    deviceGroups[type]
  );


  hideElement(
    "procedureSection"
  );

}


/* =========================================================
   11. RENDER DEVICES
========================================================= */

function renderDevices(list) {

  const section =
    document.getElementById(
      "deviceSection"
    );

  const container =
    document.getElementById(
      "deviceList"
    );


  if (!container) {
    return;
  }


  container.innerHTML = "";


  list.forEach(device => {

    const button =
      document.createElement(
        "button"
      );

    button.type = "button";

    button.className =
      "device-button";


    const code =
      device.code ||
      "Không có mã";


    const mux =
      device.mux
        ? `MUX: ${device.mux}`
        : "";


    const channel =
      device.channel
        ? `Kênh: ${device.channel}`
        : "";


    const elevation =
      device.elevation
        ? `Cao trình: ${device.elevation}`
        : "";


    const serial =
      device.serial_no
        ? `Serial: ${device.serial_no}`
        : "";


    const meta =
      [
        mux,
        channel,
        elevation,
        serial
      ]
      .filter(Boolean)
      .join(" • ");


    button.innerHTML = `
      <div class="device-code">
        ${escapeHtml(code)}
      </div>

      <div class="device-meta">
        ${escapeHtml(meta)}
      </div>
    `;


    button.addEventListener(
      "click",
      () => {

        selectDevice(
          device,
          button
        );

      }
    );


    container.appendChild(
      button
    );

  });


  if (section) {
    section.classList.remove(
      "hidden"
    );
  }

}


/* =========================================================
   12. SELECT DEVICE
========================================================= */

async function selectDevice(
  device,
  button
) {

  selectedDevice =
    device;


  document
    .querySelectorAll(
      ".device-button"
    )
    .forEach(btn => {

      btn.classList.remove(
        "active"
      );

    });


  button.classList.add(
    "active"
  );


  await loadProcedure(
    selectedType
  );

}


/* =========================================================
   13. LOAD PROCEDURE
========================================================= */

async function loadProcedure(type) {

  const section =
    document.getElementById(
      "procedureSection"
    );


  const container =
    document.getElementById(
      "procedureList"
    );


  if (section) {

    section.classList.remove(
      "hidden"
    );

  }


  if (container) {

    container.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        Đang tải quy trình kiểm tra...
      </div>
    `;

  }


  try {

    const url =
      `${GET_PROCEDURE_API}?type=${encodeURIComponent(type)}`;


    const response =
      await fetch(url);


    if (!response.ok) {

      throw new Error(
        `HTTP ${response.status}`
      );

    }


    let data =
      await response.json();


    if (!Array.isArray(data)) {

      data =
        data
          ? [data]
          : [];

    }


    data.sort(
      (a, b) =>
        Number(a.step_order) -
        Number(b.step_order)
    );


    currentProcedure =
      data;


    if (
      currentProcedure.length === 0
    ) {

      throw new Error(
        `Không có quy trình cho loại ${type}.`
      );

    }


    renderProcedure();

  }

  catch (error) {

    console.error(
      "LOAD PROCEDURE ERROR:",
      error
    );


    if (container) {

      container.innerHTML = `
        <div class="error-box">
          Không tải được quy trình kiểm tra.
          ${escapeHtml(error.message)}
        </div>
      `;

    }

  }

}


/* =========================================================
   14. RENDER PROCEDURE
========================================================= */

function renderProcedure() {

  const container =
    document.getElementById(
      "procedureList"
    );


  if (!container) {
    return;
  }


  container.innerHTML = "";


  setText(
    "selectedDeviceCode",
    selectedDevice?.code || ""
  );


  currentProcedure.forEach(
    step => {

      const stepElement =
        createProcedureStep(
          step
        );


      container.appendChild(
        stepElement
      );

    }
  );


  showElement(
    "saveSection"
  );

}


/* =========================================================
   15. CREATE PROCEDURE STEP
========================================================= */

function createProcedureStep(
  step
) {

  const wrapper =
    document.createElement(
      "div"
    );


  wrapper.className =
    "procedure-step";


  const order =
    Number(
      step.step_order || 0
    );


  const required =
    toBoolean(
      step.required
    );


  const photoRequired =
    toBoolean(
      step.photo_required
    );


  const photoMin =
    Number(
      step.photo_min || 0
    );


  wrapper.innerHTML = `

    <div class="step-header">

      <div class="step-number">
        ${order}
      </div>

      <div class="step-title">
        ${escapeHtml(
          step.step_title || ""
        )}
      </div>

    </div>


    <div class="step-body">

      <div class="step-info">

        <div class="step-info-title">
          Phương pháp thực hiện
        </div>

        <div class="step-info-content">
          ${escapeHtml(
            step.method || ""
          )}
        </div>

      </div>


      <div class="step-info">

        <div class="step-info-title">
          Tiêu chuẩn đánh giá
        </div>

        <div class="step-info-content">
          ${escapeHtml(
            step.standard || ""
          )}
        </div>

      </div>


      <div
        class="result-area"
        id="result-${order}">
      </div>


      <div class="form-group">

        <label class="form-label">
          Ghi chú
        </label>

        <textarea
          id="note-${order}"
          placeholder="Nhập ghi chú nếu có..."
        ></textarea>

      </div>


      ${
        photoRequired

        ? `

        <div class="photo-box">

          <div class="photo-title">
            📷 Ảnh kiểm tra
          </div>

          <div class="photo-required">
            Bắt buộc tối thiểu
            ${photoMin || 1}
            ảnh
          </div>

          <input
            type="file"
            id="photo-${order}"
            accept="image/*"
            capture="environment"
            multiple
          >

          <div
            class="photo-preview"
            id="preview-${order}">
          </div>

        </div>

        `

        : ""
      }

    </div>
  `;


  const resultArea =
    wrapper.querySelector(
      `#result-${order}`
    );


  renderInput(
    resultArea,
    step
  );


  if (photoRequired) {

    const photoInput =
      wrapper.querySelector(
        `#photo-${order}`
      );


    photoInput.addEventListener(
      "change",
      event => {

        previewPhotos(
          event,
          order
        );

      }
    );

  }


  return wrapper;

}


/* =========================================================
   16. RENDER INPUT BY INPUT_TYPE
========================================================= */

function renderInput(
  container,
  step
) {

  const order =
    Number(step.step_order);

  const type =
    String(
      step.input_type || "select_note"
    )
    .trim()
    .toLowerCase();


  const options =
    parseOptions(
      step.options
    );


  /* -----------------------------------------
     SELECT / SELECT_NOTE
  ----------------------------------------- */

  if (
    type === "select" ||
    type === "select_note" ||
    type === "final_assessment"
  ) {

    const group =
      document.createElement(
        "div"
      );


    group.className =
      "form-group";


    const label =
      document.createElement(
        "label"
      );


    label.className =
      "form-label";


    label.textContent =
      type === "final_assessment"
        ? "Đánh giá tình trạng"
        : "Kết quả kiểm tra";


    const select =
      document.createElement(
        "select"
      );


    select.id =
      `value-${order}`;


    const empty =
      document.createElement(
        "option"
      );


    empty.value = "";

    empty.textContent =
      "-- Chọn kết quả --";


    select.appendChild(
      empty
    );


    options.forEach(option => {

      const item =
        document.createElement(
          "option"
        );


      item.value =
        option;

      item.textContent =
        option;


      select.appendChild(
        item
      );

    });


    group.appendChild(
      label
    );

    group.appendChild(
      select
    );


    container.appendChild(
      group
    );


    return;
  }


  /* -----------------------------------------
     NUMBER RESULT
  ----------------------------------------- */

  if (
    type === "number_result" ||
    type === "multi_number_result"
  ) {

    const group =
      document.createElement(
        "div"
      );


    group.className =
      "form-group";


    const label =
      document.createElement(
        "label"
      );


    label.className =
      "form-label";

    label.textContent =
      "Giá trị đo";


    const row =
      document.createElement(
        "div"
      );


    row.className =
      "number-row";


    const input =
      document.createElement(
        "input"
      );


    input.type =
      "number";

    input.step =
      "any";

    input.id =
      `value-${order}`;

    input.placeholder =
      "Nhập giá trị đo";


    row.appendChild(
      input
    );


    if (step.unit) {

      const unit =
        document.createElement(
          "div"
        );


      unit.className =
        "unit-box";

      unit.textContent =
        step.unit;


      row.appendChild(
        unit
      );

    }


    group.appendChild(
      label
    );

    group.appendChild(
      row
    );


    container.appendChild(
      group
    );


    /* Kết luận đo */

    if (options.length) {

      const select =
        document.createElement(
          "select"
        );


      select.id =
        `assessment-${order}`;

      select.style.marginTop =
        "8px";


      const empty =
        document.createElement(
          "option"
        );


      empty.value = "";

      empty.textContent =
        "-- Đánh giá kết quả đo --";


      select.appendChild(
        empty
      );


      options.forEach(option => {

        const item =
          document.createElement(
            "option"
          );


        item.value =
          option;

        item.textContent =
          option;


        select.appendChild(
          item
        );

      });


      group.appendChild(
        select
      );

    }


    return;
  }


  /* -----------------------------------------
     DEFAULT TEXT
  ----------------------------------------- */

  const group =
    document.createElement(
      "div"
    );


  group.className =
    "form-group";


  group.innerHTML = `

    <label class="form-label">
      Kết quả
    </label>

    <input
      type="text"
      id="value-${order}"
      placeholder="Nhập kết quả kiểm tra"
    >

  `;


  container.appendChild(
    group
  );

}


/* =========================================================
   17. PHOTO PREVIEW
========================================================= */

function previewPhotos(
  event,
  order
) {

  const files =
    Array.from(
      event.target.files || []
    );


  const preview =
    document.getElementById(
      `preview-${order}`
    );


  if (!preview) {
    return;
  }


  preview.innerHTML = "";


  files.forEach(file => {

    if (
      !file.type.startsWith(
        "image/"
      )
    ) {
      return;
    }


    const reader =
      new FileReader();


    reader.onload =
      function(e) {

        const img =
          document.createElement(
            "img"
          );


        img.src =
          e.target.result;


        preview.appendChild(
          img
        );

      };


    reader.readAsDataURL(
      file
    );

  });

}


/* =========================================================
   18. COLLECT RESULTS
========================================================= */

function collectResults() {

  const results = [];


  for (
    const step of currentProcedure
  ) {

    const order =
      Number(step.step_order);


    const valueElement =
      document.getElementById(
        `value-${order}`
      );


    const assessmentElement =
      document.getElementById(
        `assessment-${order}`
      );


    const noteElement =
      document.getElementById(
        `note-${order}`
      );


    const photoElement =
      document.getElementById(
        `photo-${order}`
      );


    const value =
      valueElement
        ? valueElement.value.trim()
        : "";


    const assessment =
      assessmentElement
        ? assessmentElement.value.trim()
        : "";


    const note =
      noteElement
        ? noteElement.value.trim()
        : "";


    const photoCount =
      photoElement
        ? photoElement.files.length
        : 0;


    /* -----------------------------------------
       Required result
    ----------------------------------------- */

    if (
      toBoolean(step.required) &&
      !value
    ) {

      alert(
        `Bước ${order}: Bạn chưa nhập/chọn kết quả.`
      );


      valueElement?.focus();


      return null;
    }


    /* -----------------------------------------
       Required photo
    ----------------------------------------- */

    if (
      toBoolean(
        step.photo_required
      )
    ) {

      const min =
        Number(
          step.photo_min || 1
        );


      if (
        photoCount < min
      ) {

        alert(
          `Bước ${order}: Cần tối thiểu ${min} ảnh.`
        );


        return null;
      }

    }


    results.push({

      step_order:
        order,

      step_title:
        step.step_title || "",

      result:
        value,

      assessment:
        assessment,

      note:
        note,

      unit:
        step.unit || "",

      photo_count:
        photoCount

    });

  }


  return results;

}


/* =========================================================
   19. SAVE BUTTON
========================================================= */

async function saveInspection() {

  if (!selectedDevice) {

    alert(
      "Chưa chọn thiết bị."
    );

    return;
  }


  const results =
    collectResults();


  if (!results) {
    return;
  }


  inspectionResults[
    selectedDevice.code
  ] = {

    job_id:
      jobId,

    sensor_type:
      selectedType,

    device:
      selectedDevice,

    results:
      results,

    saved_at:
      new Date().toISOString()

  };


  console.log(
    "INSPECTION DATA:",
    inspectionResults[
      selectedDevice.code
    ]
  );


  alert(
    `Đã kiểm tra đầy đủ ${selectedDevice.code}.\n\n` +
    `Giai đoạn tiếp theo sẽ lưu kết quả và ảnh lên hệ thống.`
  );

}


/* =========================================================
   20. HELPERS
========================================================= */

function parseOptions(value) {

  if (!value) {
    return [];
  }


  if (Array.isArray(value)) {
    return value;
  }


  return String(value)
    .split("|")
    .map(item => item.trim())
    .filter(Boolean);

}


function toBoolean(value) {

  if (
    value === true ||
    value === 1
  ) {
    return true;
  }


  const normalized =
    String(value)
      .trim()
      .toLowerCase();


  return (
    normalized === "true" ||
    normalized === "1" ||
    normalized === "yes"
  );

}


function getSensorTypeName(type) {

  const names = {

    PZ:
      "Cảm biến ứng suất",

    DPL:
      "DPL – Cảm biến 4–20 mA",

    EX:
      "Giãn kế đa điểm",

    TEMP:
      "Cảm biến nhiệt độ",

    TEMPERATURE:
      "Cảm biến nhiệt độ"

  };


  return (
    names[type] ||
    type
  );

}


function formatStatus(status) {

  const map = {

    WAITING_ACCEPT:
      "Chờ nhận việc",

    ACCEPTED:
      "Đã nhận việc",

    INSPECTING:
      "Đang kiểm tra",

    COMPLETED:
      "Hoàn thành"

  };


  return (
    map[status] ||
    status ||
    "-"
  );

}


function setText(
  id,
  value
) {

  const element =
    document.getElementById(id);


  if (element) {

    element.textContent =
      value;

  }

}


function showElement(id) {

  const element =
    document.getElementById(id);


  if (element) {

    element.classList.remove(
      "hidden"
    );

  }

}


function hideElement(id) {

  const element =
    document.getElementById(id);


  if (element) {

    element.classList.add(
      "hidden"
    );

  }

}


function setLoading(text) {

  const loading =
    document.getElementById(
      "loading"
    );


  if (!loading) {
    return;
  }


  loading.innerHTML = `

    <div class="spinner"></div>

    <div>
      ${escapeHtml(text)}
    </div>

  `;


  loading.style.display =
    "block";

}


function showError(message) {

  const loading =
    document.getElementById(
      "loading"
    );


  if (loading) {

    loading.innerHTML = `

      <div class="error-box">
        ${escapeHtml(message)}
      </div>

    `;

  }

}


function escapeHtml(value) {

  return String(
    value ?? ""
  )
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );

}


/* =========================================================
   21. EXPOSE SAVE FUNCTION
========================================================= */

window.saveInspection =
  saveInspection;
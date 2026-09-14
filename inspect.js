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

let selectedGroup = null;

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

    const rawText =
      await response.text();

    if (!rawText.trim()) {

      throw new Error(
        "API get-job không trả dữ liệu."
      );

    }

    let data;

    try {

      data =
        JSON.parse(rawText);

    }

    catch {

      throw new Error(
        "API get-job không trả JSON hợp lệ."
      );

    }


    if (Array.isArray(data)) {

      if (data.length === 0) {

        throw new Error(
          "Không tìm thấy công việc."
        );

      }

      currentJob =
        data[0];

    }

    else {

      currentJob =
        data;

    }


    devices =
      parseDevices(
        currentJob.devices_json
      );


    if (!devices.length) {

      throw new Error(
        "Công việc không có thiết bị."
      );

    }


    deviceGroups =
      groupDevicesByType(
        devices
      );


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
   7. NORMALIZE RAW SENSOR TYPE
========================================================= */

function normalizeRawSensorType(type) {

  return String(type || "")
    .trim()
    .toUpperCase();

}


/* =========================================================
   8. DEVICE GROUP KEY
========================================================= */

function getDeviceGroupKey(
  sensorType
) {

  const type =
    normalizeRawSensorType(
      sensorType
    );


  const stressTypes = [
    "JE",
    "SG",
    "ST",
    "SGS",
    "STS"
  ];


  if (
    stressTypes.includes(type)
  ) {

    return "STRESS_GROUP";

  }


  return (
    type ||
    "OTHER"
  );

}


/* =========================================================
   9. DEVICE GROUP DISPLAY NAME
========================================================= */

function getDeviceGroupName(
  groupKey
) {

  const names = {

    DP:
      "Thiết bị đo dọi DPL",

    EX:
      "Giãn kế đa điểm EX",

    TH:
      "Cảm biến nhiệt độ",

    STRESS_GROUP:
      "Cảm biến ứng suất",

    PZ:
      "Cảm biến áp lực thấm"

  };


  return (
    names[groupKey]
    ||
    groupKey
  );

}


/* =========================================================
   10. GROUP DEVICES
========================================================= */

function groupDevicesByType(list) {

  const groups = {};


  list.forEach(device => {

    const groupKey =
      getDeviceGroupKey(
        device.sensor_type
      );


    if (!groups[groupKey]) {

      groups[groupKey] = [];

    }


    groups[groupKey].push(
      device
    );

  });


  return groups;

}


/* =========================================================
   11. RENDER JOB
========================================================= */

function renderJob() {

  const loading =
    document.getElementById(
      "loading"
    );


  if (loading) {

    loading.style.display =
      "none";

  }


  setText(
    "jobId",
    currentJob.job_id ||
    jobId
  );


  setText(
    "jobRequest",
    currentJob.request ||
    "-"
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
   12. RENDER DEVICE GROUPS
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


  container.innerHTML =
    "";


  Object.entries(
    deviceGroups
  ).forEach(
    ([groupKey, list]) => {

      const button =
        document.createElement(
          "button"
        );


      button.type =
        "button";


      button.className =
        "device-type-button";


      const displayName =
        getDeviceGroupName(
          groupKey
        );


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

          selectDeviceGroup(
            groupKey,
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
   13. SELECT DEVICE GROUP
========================================================= */

function selectDeviceGroup(
  groupKey,
  button
) {

  selectedGroup =
    groupKey;


  selectedDevice =
    null;


  currentProcedure =
    [];


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
    deviceGroups[
      groupKey
    ] || []
  );


  hideElement(
    "procedureSection"
  );

}


/* =========================================================
   14. RENDER DEVICES
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


  container.innerHTML =
    "";


  list.forEach(device => {

    const button =
      document.createElement(
        "button"
      );


    button.type =
      "button";


    button.className =
      "device-button";


    const code =
      device.code ||
      "Không có mã";


    const type =
      normalizeRawSensorType(
        device.sensor_type
      );


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
        `Type: ${type}`,
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
   15. SELECT DEVICE
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


  const realSensorType =
    normalizeRawSensorType(
      device.sensor_type
    );


  await loadProcedure(
    realSensorType
  );

}


/* =========================================================
   16. LOAD PROCEDURE
========================================================= */

async function loadProcedure(
  sensorType
) {

  const type =
    normalizeRawSensorType(
      sensorType
    );


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


    const rawText =
      await response.text();


    if (!rawText.trim()) {

      throw new Error(
        `Không tìm thấy quy trình cho Sensor Type ${type}.`
      );

    }


    let data;


    try {

      data =
        JSON.parse(
          rawText
        );

    }

    catch {

      throw new Error(
        "API get-procedure không trả JSON hợp lệ."
      );

    }


    if (!Array.isArray(data)) {

      data =
        data
          ? [data]
          : [];

    }


    data.sort(
      (a, b) =>
        Number(
          a.step_order
        )
        -
        Number(
          b.step_order
        )
    );


    currentProcedure =
      data;


    if (
      currentProcedure.length === 0
    ) {

      throw new Error(
        `Không có quy trình cho Sensor Type ${type}.`
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

          <br><br>

          ${escapeHtml(
            error.message
          )}

        </div>
      `;

    }

  }

}


/* =========================================================
   17. RENDER PROCEDURE
========================================================= */

function renderProcedure() {

  const container =
    document.getElementById(
      "procedureList"
    );


  if (!container) {
    return;
  }


  container.innerHTML =
    "";


  setText(
    "selectedDeviceCode",
    selectedDevice?.code ||
    ""
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
   18. CREATE PROCEDURE STEP
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
      step.step_order ||
      0
    );


  const photoRequired =
    toBoolean(
      step.photo_required
    );


  const photoMin =
    Number(
      step.photo_min ||
      0
    );


  wrapper.innerHTML = `

    <div class="step-header">

      <div class="step-number">
        ${order}
      </div>

      <div class="step-title">
        ${escapeHtml(
          step.step_title ||
          ""
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
            step.method ||
            ""
          )}
        </div>

      </div>


      <div class="step-info">

        <div class="step-info-title">
          Tiêu chuẩn đánh giá
        </div>

        <div class="step-info-content">
          ${escapeHtml(
            step.standard ||
            ""
          )}
        </div>

      </div>


      <div
        class="result-area"
        id="result-${order}"
      ></div>


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
            id="preview-${order}"
          ></div>

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


    if (photoInput) {

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

  }


  return wrapper;

}


/* =========================================================
   19. RENDER INPUT
========================================================= */

function renderInput(
  container,
  step
) {

  const order =
    Number(
      step.step_order
    );


  const type =
    String(
      step.input_type ||
      "select_note"
    )
      .trim()
      .toLowerCase();


  const options =
    parseOptions(
      step.options
    );


  /* =======================================================
     SELECT / SELECT_NOTE / FINAL
  ======================================================= */

  if (
    type === "select"
    ||
    type === "select_note"
    ||
    type === "final_assessment"
  ) {

    container.innerHTML = `

      <div class="form-group">

        <label class="form-label">
          ${
            type === "final_assessment"
              ? "Đánh giá tình trạng"
              : "Kết quả kiểm tra"
          }
        </label>

        <select
          id="value-${order}"
        >

          <option value="">
            -- Chọn kết quả --
          </option>

          ${
            options
              .map(
                option => `
                  <option
                    value="${escapeHtml(option)}"
                  >
                    ${escapeHtml(option)}
                  </option>
                `
              )
              .join("")
          }

        </select>

      </div>
    `;


    return;

  }


  /* =======================================================
     NUMBER_RESULT
  ======================================================= */

  if (
    type === "number_result"
  ) {

    container.innerHTML = `

      <div class="form-group">

        <label class="form-label">
          Giá trị đo
        </label>

        <div class="number-row">

          <input
            type="number"
            step="any"
            id="value-${order}"
            placeholder="Nhập giá trị đo"
          >

          ${
            step.unit

            ? `
              <div class="unit-box">
                ${escapeHtml(step.unit)}
              </div>
            `

            : ""
          }

        </div>

      </div>


      ${
        options.length

        ? `

        <div class="form-group">

          <label class="form-label">
            Đánh giá
          </label>

          <select
            id="assessment-${order}"
          >

            <option value="">
              -- Chọn đánh giá --
            </option>

            ${
              options
                .map(
                  option => `
                    <option
                      value="${escapeHtml(option)}"
                    >
                      ${escapeHtml(option)}
                    </option>
                  `
                )
                .join("")
            }

          </select>

        </div>

        `

        : ""
      }
    `;


    return;

  }


  /* =======================================================
     MULTI_NUMBER_RESULT
  ======================================================= */

  if (
    type === "multi_number_result"
  ) {

    const units =
      String(
        step.unit ||
        ""
      )
        .split(",")
        .map(
          item =>
            item.trim()
        )
        .filter(Boolean);


    container.innerHTML =
      units
        .map(
          (unit, index) => `

            <div class="form-group">

              <label class="form-label">
                Giá trị ${escapeHtml(unit)}
              </label>

              <div class="number-row">

                <input
                  type="number"
                  step="any"
                  id="multi-${order}-${index}"
                  placeholder="Nhập giá trị"
                >

                <div class="unit-box">
                  ${escapeHtml(unit)}
                </div>

              </div>

            </div>
          `
        )
        .join("")
      +
      `

      <div class="form-group">

        <label class="form-label">
          Đánh giá
        </label>

        <select
          id="assessment-${order}"
        >

          <option value="">
            -- Chọn đánh giá --
          </option>

          ${
            options
              .map(
                option => `
                  <option
                    value="${escapeHtml(option)}"
                  >
                    ${escapeHtml(option)}
                  </option>
                `
              )
              .join("")
          }

        </select>

      </div>
    `;


    return;

  }


  /* =======================================================
     MULTI_NODE_NUMBER
  ======================================================= */

  if (
    type === "multi_node_number"
  ) {

    container.innerHTML = `

      <div
        id="nodes-${order}"
      ></div>

      <button
        type="button"
        class="btn btn-secondary"
        onclick="addSensorNode(${order})"
      >
        + Thêm mắt cảm biến
      </button>
    `;


    addSensorNode(
      order
    );


    return;

  }


  /* =======================================================
     DEFAULT TEXT
  ======================================================= */

  container.innerHTML = `

    <div class="form-group">

      <label class="form-label">
        Kết quả
      </label>

      <input
        type="text"
        id="value-${order}"
        placeholder="Nhập kết quả kiểm tra"
      >

    </div>
  `;

}


/* =========================================================
   20. ADD SENSOR NODE
========================================================= */

function addSensorNode(order) {

  const holder =
    document.getElementById(
      `nodes-${order}`
    );


  if (!holder) {
    return;
  }


  const step =
    currentProcedure.find(
      item =>
        Number(
          item.step_order
        )
        ===
        Number(order)
    );


  if (!step) {
    return;
  }


  const index =
    holder.children.length;


  const options =
    parseOptions(
      step.options
    );


  const row =
    document.createElement(
      "div"
    );


  row.className =
    "card";


  row.innerHTML = `

    <div class="form-group">

      <label class="form-label">
        Mắt / Dây cảm biến
      </label>

      <input
        type="text"
        id="node-name-${order}-${index}"
        placeholder="VD: Red, White, Green..."
      >

    </div>


    <div class="form-group">

      <label class="form-label">
        Giá trị đo
      </label>

      <div class="number-row">

        <input
          type="number"
          step="any"
          id="node-value-${order}-${index}"
          placeholder="Nhập giá trị"
        >

        ${
          step.unit

          ? `
            <div class="unit-box">
              ${escapeHtml(step.unit)}
            </div>
          `

          : ""
        }

      </div>

    </div>


    <div class="form-group">

      <label class="form-label">
        Đánh giá
      </label>

      <select
        id="node-status-${order}-${index}"
      >

        <option value="">
          -- Chọn đánh giá --
        </option>

        ${
          options
            .map(
              option => `
                <option
                  value="${escapeHtml(option)}"
                >
                  ${escapeHtml(option)}
                </option>
              `
            )
            .join("")
        }

      </select>

    </div>
  `;


  holder.appendChild(
    row
  );

}


window.addSensorNode =
  addSensorNode;


/* =========================================================
   21. PHOTO PREVIEW
========================================================= */

function previewPhotos(
  event,
  order
) {

  const files =
    Array.from(
      event.target.files ||
      []
    );


  const preview =
    document.getElementById(
      `preview-${order}`
    );


  if (!preview) {
    return;
  }


  preview.innerHTML =
    "";


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
   22. COLLECT RESULTS
========================================================= */

function collectResults() {

  const results =
    [];


  for (
    const step
    of currentProcedure
  ) {

    const order =
      Number(
        step.step_order
      );


    const type =
      String(
        step.input_type ||
        ""
      )
        .trim()
        .toLowerCase();


    let value =
      "";


    let assessment =
      "";


    /* =====================================================
       MULTI NUMBER
    ===================================================== */

    if (
      type ===
      "multi_number_result"
    ) {

      const units =
        String(
          step.unit ||
          ""
        )
          .split(",")
          .map(
            item =>
              item.trim()
          )
          .filter(Boolean);


      const values =
        {};


      units.forEach(
        (unit, index) => {

          const input =
            document.getElementById(
              `multi-${order}-${index}`
            );


          values[unit] =
            input
              ? input.value.trim()
              : "";

        }
      );


      value =
        values;


      const assessmentElement =
        document.getElementById(
          `assessment-${order}`
        );


      assessment =
        assessmentElement
          ? assessmentElement.value.trim()
          : "";

    }


    /* =====================================================
       MULTI NODE
    ===================================================== */

    else if (
      type ===
      "multi_node_number"
    ) {

      const holder =
        document.getElementById(
          `nodes-${order}`
        );


      const nodes =
        [];


      if (holder) {

        [
          ...holder.children
        ]
          .forEach(
            (_, index) => {

              const name =
                document.getElementById(
                  `node-name-${order}-${index}`
                )
                  ?.value
                  ?.trim()
                || "";


              const nodeValue =
                document.getElementById(
                  `node-value-${order}-${index}`
                )
                  ?.value
                  ?.trim()
                || "";


              const status =
                document.getElementById(
                  `node-status-${order}-${index}`
                )
                  ?.value
                  ?.trim()
                || "";


              nodes.push({

                node:
                  name,

                value:
                  nodeValue,

                status:
                  status

              });

            }
          );

      }


      value =
        nodes;

    }


    /* =====================================================
       NORMAL
    ===================================================== */

    else {

      const valueElement =
        document.getElementById(
          `value-${order}`
        );


      value =
        valueElement
          ? valueElement.value.trim()
          : "";


      const assessmentElement =
        document.getElementById(
          `assessment-${order}`
        );


      assessment =
        assessmentElement
          ? assessmentElement.value.trim()
          : "";

    }


    const noteElement =
      document.getElementById(
        `note-${order}`
      );


    const note =
      noteElement
        ? noteElement.value.trim()
        : "";


    const photoElement =
      document.getElementById(
        `photo-${order}`
      );


    const photoCount =
      photoElement
        ? photoElement.files.length
        : 0;


    /* =====================================================
       VALIDATION
    ===================================================== */

    if (
      toBoolean(
        step.required
      )
    ) {

      if (
        type ===
        "multi_number_result"
      ) {

        const missing =
          Object.values(
            value
          )
            .some(
              item =>
                item === ""
            );


        if (missing) {

          alert(
            `Bước ${order}: Bạn chưa nhập đủ giá trị đo.`
          );

          return null;

        }


        if (
          !assessment
        ) {

          alert(
            `Bước ${order}: Bạn chưa chọn đánh giá.`
          );

          return null;

        }

      }


      else if (
        type ===
        "multi_node_number"
      ) {

        if (
          !Array.isArray(value)
          ||
          value.length === 0
        ) {

          alert(
            `Bước ${order}: Chưa nhập mắt cảm biến.`
          );

          return null;

        }


        const invalid =
          value.some(
            item =>
              !item.node
              ||
              !item.value
              ||
              !item.status
          );


        if (invalid) {

          alert(
            `Bước ${order}: Chưa nhập đầy đủ thông tin các mắt cảm biến.`
          );

          return null;

        }

      }


      else {

        if (!value) {

          alert(
            `Bước ${order}: Bạn chưa nhập/chọn kết quả.`
          );

          return null;

        }


        if (
          type ===
          "number_result"
          &&
          document.getElementById(
            `assessment-${order}`
          )
          &&
          !assessment
        ) {

          alert(
            `Bước ${order}: Bạn chưa chọn đánh giá.`
          );

          return null;

        }

      }

    }


    /* =====================================================
       PHOTO VALIDATION
    ===================================================== */

    if (
      toBoolean(
        step.photo_required
      )
    ) {

      const min =
        Number(
          step.photo_min ||
          1
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
        step.step_title ||
        "",

      input_type:
        type,

      result:
        value,

      assessment:
        assessment,

      note:
        note,

      unit:
        step.unit ||
        "",

      photo_count:
        photoCount

    });

  }


  return results;

}


/* =========================================================
   23. SAVE
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


  const realSensorType =
    normalizeRawSensorType(
      selectedDevice.sensor_type
    );


  inspectionResults[
    selectedDevice.code
  ] = {

    job_id:
      jobId,

    device_code:
      selectedDevice.code,

    sensor_type:
      realSensorType,

    procedure_code:
      currentProcedure[0]
        ?.procedure_code
      || "",

    device:
      selectedDevice,

    results:
      results,

    saved_at:
      new Date()
        .toISOString()

  };


  console.log(
    "INSPECTION DATA:",
    inspectionResults[
      selectedDevice.code
    ]
  );


  alert(
    `Đã hoàn thành kiểm tra ${selectedDevice.code}.`
  );

}


/* =========================================================
   24. HELPERS
========================================================= */

function parseOptions(value) {

  if (!value) {
    return [];
  }


  if (
    Array.isArray(value)
  ) {
    return value;
  }


  return String(value)
    .split("|")
    .map(
      item =>
        item.trim()
    )
    .filter(Boolean);

}


function toBoolean(value) {

  if (
    value === true
    ||
    value === 1
  ) {
    return true;
  }


  const normalized =
    String(value)
      .trim()
      .toLowerCase();


  return (
    normalized === "true"
    ||
    normalized === "1"
    ||
    normalized === "yes"
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
    map[status]
    ||
    status
    ||
    "-"
  );

}


function setText(
  id,
  value
) {

  const element =
    document.getElementById(
      id
    );


  if (element) {

    element.textContent =
      value;

  }

}


function showElement(id) {

  const element =
    document.getElementById(
      id
    );


  if (element) {

    element.classList.remove(
      "hidden"
    );

  }

}


function hideElement(id) {

  const element =
    document.getElementById(
      id
    );


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
   25. EXPOSE FUNCTIONS
========================================================= */

window.saveInspection =
  saveInspection;

window.addSensorNode =
  addSensorNode;
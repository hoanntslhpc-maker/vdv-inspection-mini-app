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

const SAVE_INSPECTION_API =
  `${API_BASE}/save-inspection`;

const GET_DEVICE_STATUS_API =
  `${API_BASE}/get-device-status`;

const GET_INSPECTION_RESULT_API =
  `${API_BASE}/get-inspection-result`;


/* =========================================================
   2. GLOBAL STATE
========================================================= */

let currentJob = null;

let devices = [];

let deviceGroups = {};

let deviceStatusMap = {};

let selectedGroup = null;

let selectedDevice = null;

let currentProcedure = [];

let inspectionResults = {};


/* =========================
   EDIT MODE
========================= */

let editingExistingInspection = false;

let savedInspectionRows = [];


/* =========================================================
   3. GET JOB ID
========================================================= */

const params =
  new URLSearchParams(
    window.location.search
  );

const jobId =
  params.get("job");


/* =========================================================
   4. START
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

    const response =
      await fetch(
        `${GET_JOB_API}?job=${encodeURIComponent(jobId)}`
      );

    if (!response.ok) {

      throw new Error(
        `HTTP ${response.status}`
      );

    }

    const rawText =
      await response.text();

    if (!rawText.trim()) {

      throw new Error(
        "Không tìm thấy dữ liệu công việc."
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


    currentJob =
      Array.isArray(data)
        ? data[0]
        : data;


    if (!currentJob) {

      throw new Error(
        "Không tìm thấy công việc."
      );

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


    /* tải trạng thái thiết bị */

    await loadDeviceStatuses();


    /* nhóm thiết bị */

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
      "Không tải được thông tin công việc.\n"
      + error.message
    );

  }

}


/* =========================================================
   6. LOAD DEVICE STATUSES
========================================================= */

async function loadDeviceStatuses() {

  deviceStatusMap = {};


  try {

    const response =
      await fetch(
        `${GET_DEVICE_STATUS_API}?job=${encodeURIComponent(jobId)}`
      );


    if (!response.ok) {

      console.warn(
        "Không tải được device status"
      );

      return;
    }


    const rawText =
      await response.text();


    if (!rawText.trim()) {

      return;
    }


    const data =
      JSON.parse(rawText);


    const rows =
      Array.isArray(data)
        ? data
        : (
            Array.isArray(data.results)
              ? data.results
              : [data]
          );


    rows.forEach(row => {

      const code =
        String(
          row.device_code || ""
        ).trim();


      if (!code) {
        return;
      }


      deviceStatusMap[
        code
      ] = row;

    });

  }

  catch (error) {

    console.error(
      "LOAD DEVICE STATUS ERROR:",
      error
    );

  }

}


/* =========================================================
   7. PARSE DEVICES
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

  catch {

    return [];

  }

}


/* =========================================================
   8. NORMALIZE SENSOR TYPE
========================================================= */

function normalizeRawSensorType(type) {

  return String(type || "")
    .trim()
    .toUpperCase();

}


/* =========================================================
   9. DEVICE GROUP
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
   10. GROUP DISPLAY NAME
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
   11. GROUP DEVICES
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


    groups[groupKey]
      .push(device);

  });


  return groups;

}


/* =========================================================
   12. RENDER JOB
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
   13. RENDER DEVICE GROUPS
========================================================= */

function renderDeviceTypes() {

  const container =
    document.getElementById(
      "deviceTypes"
    );


  if (!container) {
    return;
  }


  container.innerHTML = "";


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


      const completedCount =
        list.filter(
          device =>
            deviceStatusMap[
              device.code
            ]?.status
            === "COMPLETED"
        ).length;


      button.innerHTML = `

        <div class="device-type-name">

          ${escapeHtml(
            getDeviceGroupName(
              groupKey
            )
          )}

        </div>


        <div class="device-type-count">

          ${list.length} thiết bị

          ${
            completedCount > 0
              ? ` • ✅ ${completedCount} đã kiểm tra`
              : ""
          }

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
   14. SELECT GROUP
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


  editingExistingInspection =
    false;


  savedInspectionRows =
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


  hideElement(
    "saveSection"
  );

}


/* =========================================================
   15. RENDER DEVICES
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


    const savedStatus =
      deviceStatusMap[
        code
      ];


    const isCompleted =
      savedStatus?.status
      === "COMPLETED";


    button.innerHTML = `

      <div class="device-code">

        ${
          isCompleted
            ? "✅ "
            : ""
        }

        ${escapeHtml(code)}

      </div>


      <div class="device-meta">

        ${escapeHtml(meta)}

      </div>


      ${
        isCompleted

          ? `

            <div
              style="
                margin-top:7px;
                color:#16803d;
                font-weight:700;
              "
            >
              Đã kiểm tra
            </div>

          `

          : ""
      }

    `;


    button.addEventListener(
      "click",
      () => {

        if (isCompleted) {

          showCompletedDevice(
            device,
            savedStatus,
            button
          );

        }

        else {

          selectDevice(
            device,
            button
          );

        }

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
   16. SELECT NEW DEVICE
========================================================= */

async function selectDevice(
  device,
  button
) {

  selectedDevice =
    device;


  editingExistingInspection =
    false;


  savedInspectionRows =
    [];


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


  resetSaveButton(
    "💾 LƯU KẾT QUẢ KIỂM TRA"
  );


  await loadProcedure(
    normalizeRawSensorType(
      device.sensor_type
    )
  );

}


/* =========================================================
   17. SHOW COMPLETED DEVICE
========================================================= */

function showCompletedDevice(
  device,
  status,
  button
) {

  selectedDevice =
    device;


  editingExistingInspection =
    false;


  savedInspectionRows =
    [];


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


  const section =
    document.getElementById(
      "procedureSection"
    );


  const container =
    document.getElementById(
      "procedureList"
    );


  if (
    !section ||
    !container
  ) {
    return;
  }


  section.classList.remove(
    "hidden"
  );


  hideElement(
    "saveSection"
  );


  setText(
    "selectedDeviceCode",
    device.code ||
    ""
  );


  container.innerHTML = `

    <div class="card">

      <div
        style="
          font-size:20px;
          font-weight:700;
          color:#16803d;
          margin-bottom:16px;
        "
      >
        ✅ Thiết bị đã kiểm tra
      </div>


      <div>
        <strong>Thiết bị:</strong>
        ${escapeHtml(
          device.code || ""
        )}
      </div>


      <div style="margin-top:8px;">

        <strong>Sensor Type:</strong>

        ${escapeHtml(
          normalizeRawSensorType(
            device.sensor_type
          )
        )}

      </div>


      <div style="margin-top:8px;">

        <strong>Người kiểm tra:</strong>

        ${escapeHtml(
          status.inspector_name ||
          "Không xác định"
        )}

      </div>


      <div style="margin-top:8px;">

        <strong>Thời gian:</strong>

        ${escapeHtml(
          formatDateTime(
            status.checked_at
          )
        )}

      </div>


      <button
        type="button"
        class="btn btn-secondary"
        style="margin-top:18px;"
        onclick="viewSavedResult()"
      >
        👁 XEM KẾT QUẢ ĐÃ KIỂM TRA
      </button>


      <button
        type="button"
        class="btn btn-primary"
        style="margin-top:10px;"
        onclick="editSavedInspection()"
      >
        ✏️ CHỈNH SỬA KẾT QUẢ
      </button>

    </div>

  `;

}


/* =========================================================
   18. LOAD PROCEDURE
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

    const response =
      await fetch(
        `${GET_PROCEDURE_API}?type=${encodeURIComponent(type)}`
      );


    if (!response.ok) {

      throw new Error(
        `HTTP ${response.status}`
      );

    }


    const rawText =
      await response.text();


    if (!rawText.trim()) {

      throw new Error(
        `Không có quy trình cho ${type}.`
      );

    }


    let data =
      JSON.parse(rawText);


    if (!Array.isArray(data)) {

      data =
        data
          ? [data]
          : [];

    }


    data.sort(
      (a, b) =>
        Number(a.step_order)
        -
        Number(b.step_order)
    );


    currentProcedure =
      data;


    if (
      !currentProcedure.length
    ) {

      throw new Error(
        `Không có quy trình cho ${type}.`
      );

    }


    renderProcedure();

  }

  catch (error) {

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
   19. RENDER PROCEDURE
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

      container.appendChild(
        createProcedureStep(
          step
        )
      );

    }
  );


  showElement(
    "saveSection"
  );

}


/* =========================================================
   20. CREATE STEP
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


              <div
                id="old-photo-${order}"
                style="margin-bottom:10px;"
              ></div>


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


  renderInput(
    wrapper.querySelector(
      `#result-${order}`
    ),
    step
  );


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


  return wrapper;

}


/* =========================================================
   21. RENDER INPUT
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


  /* SELECT */

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


  /* NUMBER */

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

                  ${escapeHtml(
                    step.unit
                  )}

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


  /* MULTI NUMBER */

  if (
    type === "multi_number_result"
  ) {

    const units =
      String(
        step.unit ||
        ""
      )
        .split(",")
        .map(v => v.trim())
        .filter(Boolean);


    container.innerHTML =
      units
        .map(
          (unit, index) => `

            <div class="form-group">

              <label class="form-label">

                Giá trị
                ${escapeHtml(unit)}

              </label>

              <div class="number-row">

                <input
                  type="number"
                  step="any"
                  id="multi-${order}-${index}"
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


  /* MULTI NODE */

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


  /* TEXT */

  container.innerHTML = `

    <div class="form-group">

      <label class="form-label">
        Kết quả
      </label>

      <input
        id="value-${order}"
        type="text"
      >

    </div>

  `;

}


/* =========================================================
   22. SENSOR NODE
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
        Number(item.step_order)
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


  const card =
    document.createElement(
      "div"
    );


  card.className =
    "card";


  card.innerHTML = `

    <div class="form-group">

      <label class="form-label">
        Mắt / dây cảm biến
      </label>

      <input
        id="node-name-${order}-${index}"
        type="text"
      >

    </div>


    <div class="form-group">

      <label class="form-label">
        Giá trị đo
      </label>

      <div class="number-row">

        <input
          id="node-value-${order}-${index}"
          type="number"
          step="any"
        >

        <div class="unit-box">

          ${escapeHtml(
            step.unit || ""
          )}

        </div>

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
    card
  );

}


/* =========================================================
   23. GET SAVED RESULTS
========================================================= */

async function fetchSavedInspection() {

  if (!selectedDevice) {

    return [];

  }


  const response =
    await fetch(

      `${GET_INSPECTION_RESULT_API}`
      +
      `?job=${encodeURIComponent(jobId)}`
      +
      `&device=${encodeURIComponent(selectedDevice.code)}`

    );


  if (!response.ok) {

    throw new Error(
      `HTTP ${response.status}`
    );

  }


  const data =
    await response.json();


  return Array.isArray(data)
    ? data
    : (
        Array.isArray(data.results)
          ? data.results
          : []
      );

}


/* =========================================================
   24. VIEW SAVED RESULT
========================================================= */

window.viewSavedResult =
  async function() {

    try {

      const rows =
        await fetchSavedInspection();


      if (!rows.length) {

        throw new Error(
          "Không tìm thấy kết quả đã lưu."
        );

      }


      const container =
        document.getElementById(
          "procedureList"
        );


      if (!container) {
        return;
      }


      container.innerHTML =
        "";


      rows
        .sort(
          (a, b) =>
            Number(a.step_order)
            -
            Number(b.step_order)
        )
        .forEach(row => {


          const urls =
            parsePhotoUrls(
              row.photo_urls
            );


          const card =
            document.createElement(
              "div"
            );


          card.className =
            "procedure-step";


          card.innerHTML = `

            <div class="step-header">

              <div class="step-number">

                ${row.step_order}

              </div>

              <div class="step-title">

                ${escapeHtml(
                  row.step_title || ""
                )}

              </div>

            </div>


            <div class="step-body">


              <div class="step-info">

                <div class="step-info-title">
                  Kết quả
                </div>

                <div class="step-info-content">

                  ${escapeHtml(
                    formatResultValue(
                      row.result_value
                    )
                  )}

                </div>

              </div>


              ${
                row.result_status

                  ? `

                    <div class="step-info">

                      <div class="step-info-title">
                        Đánh giá
                      </div>

                      <div class="step-info-content">

                        ${escapeHtml(
                          row.result_status
                        )}

                      </div>

                    </div>

                  `

                  : ""
              }


              ${
                row.note

                  ? `

                    <div class="step-info">

                      <div class="step-info-title">
                        Ghi chú
                      </div>

                      <div class="step-info-content">

                        ${escapeHtml(
                          row.note
                        )}

                      </div>

                    </div>

                  `

                  : ""
              }


              ${
                urls.length

                  ? `

                    <div class="step-info">

                      <div class="step-info-title">
                        Ảnh kiểm tra
                      </div>

                      ${

                        urls
                          .map(
                            (url, index) => `

                              <div style="margin-top:6px;">

                                <a
                                  href="${escapeHtml(url)}"
                                  target="_blank"
                                >
                                  📷 Xem ảnh ${index + 1}
                                </a>

                              </div>

                            `
                          )
                          .join("")

                      }

                    </div>

                  `

                  : ""
              }

            </div>

          `;


          container.appendChild(
            card
          );

        });


      hideElement(
        "saveSection"
      );


      const back =
        document.createElement(
          "button"
        );


      back.className =
        "btn btn-secondary";


      back.style.marginTop =
        "12px";


      back.textContent =
        "← Quay lại";


      back.onclick =
        () => {

          const status =
            deviceStatusMap[
              selectedDevice.code
            ];


          showCompletedDevice(
            selectedDevice,
            status,
            findDeviceButton(
              selectedDevice.code
            )
          );

        };


      container.appendChild(
        back
      );

    }

    catch (error) {

      alert(
        "Không tải được kết quả.\n\n"
        +
        error.message
      );

    }

  };


/* =========================================================
   25. EDIT SAVED RESULT
========================================================= */

window.editSavedInspection =
  async function() {

    try {

      const rows =
        await fetchSavedInspection();


      if (!rows.length) {

        throw new Error(
          "Không tìm thấy kết quả đã kiểm tra."
        );

      }


      savedInspectionRows =
        rows;


      editingExistingInspection =
        true;


      await loadProcedure(
        normalizeRawSensorType(
          selectedDevice.sensor_type
        )
      );


      prefillSavedInspection(
        rows
      );


      resetSaveButton(
        "💾 LƯU THAY ĐỔI"
      );


      showElement(
        "saveSection"
      );

    }

    catch (error) {

      alert(
        "Không tải được dữ liệu cũ.\n\n"
        +
        error.message
      );

    }

  };


/* =========================================================
   26. PREFILL OLD RESULTS
========================================================= */

function prefillSavedInspection(
  rows
) {

  rows.forEach(row => {

    const order =
      Number(
        row.step_order
      );


    const step =
      currentProcedure.find(
        item =>
          Number(item.step_order)
          ===
          order
      );


    if (!step) {
      return;
    }


    const type =
      String(
        step.input_type ||
        ""
      )
        .trim()
        .toLowerCase();


    const resultValue =
      row.result_value ??
      "";


    const resultStatus =
      row.result_status ??
      "";


    /* NOTE */

    const noteElement =
      document.getElementById(
        `note-${order}`
      );


    if (noteElement) {

      noteElement.value =
        row.note ||
        "";

    }


    /* SELECT */

    if (
      type === "select"
      ||
      type === "select_note"
      ||
      type === "final_assessment"
    ) {

      const element =
        document.getElementById(
          `value-${order}`
        );


      if (element) {

        element.value =
          resultValue;

      }

    }


    /* NUMBER */

    else if (
      type === "number_result"
    ) {

      const valueElement =
        document.getElementById(
          `value-${order}`
        );


      if (valueElement) {

        valueElement.value =
          resultValue;

      }


      const statusElement =
        document.getElementById(
          `assessment-${order}`
        );


      if (statusElement) {

        statusElement.value =
          resultStatus;

      }

    }


    /* MULTI NUMBER */

    else if (
      type === "multi_number_result"
    ) {

      let values = {};


      try {

        values =
          typeof resultValue
          === "string"

            ? JSON.parse(
                resultValue
              )

            : resultValue;

      }

      catch {

        values = {};

      }


      const units =
        String(
          step.unit || ""
        )
          .split(",")
          .map(v => v.trim())
          .filter(Boolean);


      units.forEach(
        (unit, index) => {

          const input =
            document.getElementById(
              `multi-${order}-${index}`
            );


          if (input) {

            input.value =
              values?.[unit] ??
              "";

          }

        }
      );


      const status =
        document.getElementById(
          `assessment-${order}`
        );


      if (status) {

        status.value =
          resultStatus;

      }

    }


    /* MULTI NODE */

    else if (
      type === "multi_node_number"
    ) {

      let nodes = [];


      try {

        nodes =
          typeof resultValue
          === "string"

            ? JSON.parse(
                resultValue
              )

            : resultValue;

      }

      catch {

        nodes = [];

      }


      const holder =
        document.getElementById(
          `nodes-${order}`
        );


      if (holder) {

        holder.innerHTML =
          "";


        nodes.forEach(
          node => {

            addSensorNode(
              order
            );


            const index =
              holder.children.length
              -
              1;


            const name =
              document.getElementById(
                `node-name-${order}-${index}`
              );


            const value =
              document.getElementById(
                `node-value-${order}-${index}`
              );


            const status =
              document.getElementById(
                `node-status-${order}-${index}`
              );


            if (name) {

              name.value =
                node.node ||
                "";

            }


            if (value) {

              value.value =
                node.value ||
                "";

            }


            if (status) {

              status.value =
                node.status ||
                "";

            }

          }
        );

      }

    }


    /* OLD PHOTOS */

    const urls =
      parsePhotoUrls(
        row.photo_urls
      );


    const oldPhotoBox =
      document.getElementById(
        `old-photo-${order}`
      );


    if (
      oldPhotoBox
      &&
      urls.length
    ) {

      oldPhotoBox.innerHTML = `

        <div
          style="
            color:#16803d;
            font-weight:700;
            margin-bottom:5px;
          "
        >
          ✅ Ảnh đã lưu: ${urls.length}
        </div>

        ${

          urls
            .map(
              (url, index) => `

                <a
                  href="${escapeHtml(url)}"
                  target="_blank"
                  style="
                    display:block;
                    margin-bottom:4px;
                  "
                >
                  📷 Xem ảnh cũ ${index + 1}
                </a>

              `
            )
            .join("")

        }

      `;

    }

  });

}


/* =========================================================
   27. PHOTO PREVIEW
========================================================= */

function previewPhotos(
  event,
  order
) {

  const preview =
    document.getElementById(
      `preview-${order}`
    );


  if (!preview) {
    return;
  }


  preview.innerHTML =
    "";


  Array
    .from(
      event.target.files ||
      []
    )
    .forEach(file => {


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
        event => {


          const img =
            document.createElement(
              "img"
            );


          img.src =
            event.target.result;


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
   28. GET SAVED ROW FOR STEP
========================================================= */

function getSavedRow(
  stepOrder
) {

  return savedInspectionRows.find(
    row =>
      Number(row.step_order)
      ===
      Number(stepOrder)
  );

}


/* =========================================================
   29. COLLECT RESULTS
========================================================= */

function collectResults() {

  const results = [];


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


    let value = "";

    let assessment = "";


    /* MULTI NUMBER */

    if (
      type ===
      "multi_number_result"
    ) {

      const units =
        String(
          step.unit || ""
        )
          .split(",")
          .map(v => v.trim())
          .filter(Boolean);


      const values = {};


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


      assessment =
        document.getElementById(
          `assessment-${order}`
        )
          ?.value
          ?.trim()
        || "";

    }


    /* MULTI NODE */

    else if (
      type ===
      "multi_node_number"
    ) {

      const holder =
        document.getElementById(
          `nodes-${order}`
        );


      const nodes = [];


      if (holder) {

        [
          ...holder.children
        ]
          .forEach(
            (_, index) => {


              nodes.push({

                node:

                  document.getElementById(
                    `node-name-${order}-${index}`
                  )
                    ?.value
                    ?.trim()
                  || "",


                value:

                  document.getElementById(
                    `node-value-${order}-${index}`
                  )
                    ?.value
                    ?.trim()
                  || "",


                status:

                  document.getElementById(
                    `node-status-${order}-${index}`
                  )
                    ?.value
                    ?.trim()
                  || ""

              });

            }
          );

      }


      value =
        nodes;

    }


    /* NORMAL */

    else {

      value =
        document.getElementById(
          `value-${order}`
        )
          ?.value
          ?.trim()
        || "";


      assessment =
        document.getElementById(
          `assessment-${order}`
        )
          ?.value
          ?.trim()
        || "";

    }


    const note =
      document.getElementById(
        `note-${order}`
      )
        ?.value
        ?.trim()
      || "";


    const photoInput =
      document.getElementById(
        `photo-${order}`
      );


    const newPhotoCount =
      photoInput
        ? photoInput.files.length
        : 0;


    const savedRow =
      getSavedRow(
        order
      );


    const existingPhotoUrls =
      savedRow
        ? parsePhotoUrls(
            savedRow.photo_urls
          )
        : [];


    /* =========================
       VALIDATION
    ========================= */

    if (
      toBoolean(
        step.required
      )
    ) {


      if (
        type ===
        "multi_number_result"
      ) {


        if (
          Object
            .values(value)
            .some(v => v === "")
        ) {

          alert(
            `Bước ${order}: Bạn chưa nhập đủ giá trị đo.`
          );

          return null;

        }


        if (!assessment) {

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
          !value.length
          ||
          value.some(
            item =>
              !item.node
              ||
              !item.value
              ||
              !item.status
          )
        ) {

          alert(
            `Bước ${order}: Chưa nhập đầy đủ thông tin mắt cảm biến.`
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


    /* PHOTO REQUIRED */

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


      const totalPhotoCount =
        newPhotoCount
        +
        existingPhotoUrls.length;


      if (
        totalPhotoCount
        <
        min
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

      existing_photo_urls:
        existingPhotoUrls,

      new_photo_count:
        newPhotoCount

    });

  }


  return results;

}


/* =========================================================
   30. SAVE
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


  const telegramUser =
    window.Telegram
      ?.WebApp
      ?.initDataUnsafe
      ?.user
    || {};


  const inspectorName =
    [

      telegramUser.last_name,
      telegramUser.first_name

    ]
      .filter(Boolean)
      .join(" ")
    ||
    "Không xác định";


  const payload = {

    mode:

      editingExistingInspection
        ? "EDIT"
        : "CREATE",


    job_id:
      jobId,


    device_code:
      selectedDevice.code,


    sensor_type:
      normalizeRawSensorType(
        selectedDevice.sensor_type
      ),


    procedure_code:
      currentProcedure[0]
        ?.procedure_code
      || "",


    inspector_id:
      telegramUser.id ||
      "",


    inspector_name:
      inspectorName,


    checked_at:
      new Date()
        .toISOString(),


    results:

      results.map(
        result => ({

          step_order:
            result.step_order,

          step_title:
            result.step_title,

          result_value:
            result.result,

          result_status:
            result.assessment,

          note:
            result.note,

          unit:
            result.unit,

          existing_photo_urls:
            result.existing_photo_urls ||
            []

        })
      )

  };


  const formData =
    new FormData();


  formData.append(
    "payload",
    JSON.stringify(
      payload
    )
  );


  /* NEW PHOTOS */

  for (
    const step
    of currentProcedure
  ) {

    const order =
      Number(
        step.step_order
      );


    const input =
      document.getElementById(
        `photo-${order}`
      );


    if (
      !input
      ||
      !input.files
    ) {

      continue;

    }


    Array
      .from(
        input.files
      )
      .forEach(
        (file, index) => {

          formData.append(

            `photo_step_${order}_${index + 1}`,

            file,

            file.name

          );

        }
      );

  }


  const saveButton =
    document.querySelector(
      "#saveSection button"
    );


  if (saveButton) {

    saveButton.disabled =
      true;

    saveButton.textContent =
      "⏳ ĐANG LƯU...";

  }


  try {

    const response =
      await fetch(

        SAVE_INSPECTION_API,

        {

          method:
            "POST",

          body:
            formData

        }

      );


    const responseText =
      await response.text();


    if (!response.ok) {

      throw new Error(
        responseText
        ||
        `HTTP ${response.status}`
      );

    }


    /* đánh dấu local */

    deviceStatusMap[
      selectedDevice.code
    ] = {

      device_code:
        selectedDevice.code,

      sensor_type:
        selectedDevice.sensor_type,

      procedure_code:
        currentProcedure[0]
          ?.procedure_code
        || "",

      status:
        "COMPLETED",

      inspector_id:
        telegramUser.id ||
        "",

      inspector_name:
        inspectorName,

      checked_at:
        new Date()
          .toISOString()

    };


    alert(

      editingExistingInspection

        ? `✅ Đã cập nhật kết quả ${selectedDevice.code}.`

        : `✅ Đã lưu kết quả kiểm tra ${selectedDevice.code}.`

    );


    editingExistingInspection =
      false;


    savedInspectionRows =
      [];


    /* refresh group */

    renderDeviceTypes();


    if (selectedGroup) {

      renderDevices(
        deviceGroups[
          selectedGroup
        ] || []
      );

    }


    const status =
      deviceStatusMap[
        selectedDevice.code
      ];


    const deviceButton =
      findDeviceButton(
        selectedDevice.code
      );


    if (deviceButton) {

      showCompletedDevice(

        selectedDevice,

        status,

        deviceButton

      );

    }

  }

  catch (error) {

    console.error(
      error
    );


    alert(
      "❌ Không lưu được kết quả.\n\n"
      +
      error.message
    );


    resetSaveButton(

      editingExistingInspection

        ? "💾 LƯU THAY ĐỔI"

        : "💾 LƯU KẾT QUẢ KIỂM TRA"

    );

  }

}


/* =========================================================
   31. HELPERS
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
    .map(v => v.trim())
    .filter(Boolean);

}


function parsePhotoUrls(value) {

  if (!value) {

    return [];

  }


  if (
    Array.isArray(value)
  ) {

    return value;

  }


  try {

    const parsed =
      JSON.parse(value);


    return Array.isArray(parsed)
      ? parsed
      : [];

  }

  catch {

    return [];

  }

}


function formatResultValue(value) {

  if (
    value === null
    ||
    value === undefined
  ) {

    return "";

  }


  if (
    typeof value
    === "object"
  ) {

    return JSON.stringify(
      value
    );

  }


  const text =
    String(value);


  try {

    const parsed =
      JSON.parse(text);


    if (
      typeof parsed
      === "object"
    ) {

      return JSON.stringify(
        parsed,
        null,
        2
      );

    }

  }

  catch {
    // ignore
  }


  return text;

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


function formatDateTime(value) {

  if (!value) {

    return "-";

  }


  try {

    return new Intl.DateTimeFormat(
      "vi-VN",
      {

        timeZone:
          "Asia/Ho_Chi_Minh",

        day:
          "2-digit",

        month:
          "2-digit",

        year:
          "numeric",

        hour:
          "2-digit",

        minute:
          "2-digit",

        hour12:
          false

      }
    ).format(
      new Date(value)
    );

  }

  catch {

    return value;

  }

}


function resetSaveButton(
  text
) {

  const button =
    document.querySelector(
      "#saveSection button"
    );


  if (!button) {

    return;

  }


  button.disabled =
    false;


  button.textContent =
    text;

}


function findDeviceButton(
  deviceCode
) {

  const buttons =
    document.querySelectorAll(
      ".device-button"
    );


  for (
    const button
    of buttons
  ) {

    if (
      button
        .querySelector(
          ".device-code"
        )
        ?.textContent
        ?.includes(
          deviceCode
        )
    ) {

      return button;

    }

  }


  return null;

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

  document
    .getElementById(id)
    ?.classList
    .remove("hidden");

}


function hideElement(id) {

  document
    .getElementById(id)
    ?.classList
    .add("hidden");

}


function setLoading(text) {

  const element =
    document.getElementById(
      "loading"
    );


  if (!element) {
    return;
  }


  element.innerHTML = `

    <div class="spinner"></div>

    <div>
      ${escapeHtml(text)}
    </div>

  `;


  element.style.display =
    "block";

}


function showError(message) {

  const element =
    document.getElementById(
      "loading"
    );


  if (!element) {
    return;
  }


  element.innerHTML = `

    <div class="error-box">

      ${escapeHtml(message)}

    </div>

  `;

}


function escapeHtml(value) {

  return String(
    value ??
    ""
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
   32. EXPOSE FUNCTIONS
========================================================= */

window.saveInspection =
  saveInspection;

window.addSensorNode =
  addSensorNode;
/* =========================================================
   VDV INSPECTION MINI APP
   inspect.js
========================================================= */


/* =========================================================
   1. API CONFIG
========================================================= */

const API_BASE =
  "https://n8n.quantrac.bid/webhook";

const GET_JOB_API =
  `${API_BASE}/get-job`;

const GET_PROCEDURE_API =
  `${API_BASE}/get-procedure`;

const GET_DEVICE_STATUS_API =
  `${API_BASE}/get-device-status`;

const GET_INSPECTION_RESULT_API =
  `${API_BASE}/get-inspection-result`;

const SAVE_INSPECTION_API =
  `${API_BASE}/save-inspection`;



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

let savedInspectionRows = [];

let editingExistingInspection = false;

/*
  Lưu danh sách ảnh mới theo từng bước kiểm tra.
  Ví dụ:
  selectedPhotos[1] = [file1, file2]
  selectedPhotos[3] = [file1]
*/
const selectedPhotos = {};
/*
  Danh sách URL ảnh cũ còn được giữ lại
  khi người dùng chỉnh sửa kết quả.
*/
const remainingOldPhotos = {};

// Giữ kết quả vừa gửi trong phiên Mini App cho tới khi n8n ghi xong.
// Tránh mất dữ liệu khi chuyển thiết bị ngay sau khi bấm Lưu.
const pendingInspectionByDevice = {};
let deviceSelectionVersion = 0;

function clearInspectionPhotoState() {
  Object.keys(selectedPhotos).forEach(key => delete selectedPhotos[key]);
  Object.keys(remainingOldPhotos).forEach(key => delete remainingOldPhotos[key]);
}

function inspectionRowsFromPayload(payload) {
  return payload.results.map(row => ({
    job_id: payload.job_id,
    device_code: payload.device_code,
    step_order: row.step_order,
    step_title: row.step_title,
    result_value: typeof row.result_value === "object"
      ? JSON.stringify(row.result_value) : row.result_value ?? "",
    result_status: row.result_status || "",
    note: row.note || "",
    unit: row.unit || "",
    photo_urls: JSON.stringify(row.existing_photo_urls || [])
  }));
}

function pendingIsInBackend(pending, rows) {
  if (!rows.length || rows.length < pending.rows.length) return false;
  return pending.rows.every(local => {
    const remote = rows.find(row => Number(row.step_order) === Number(local.step_order));
    if (!remote) return false;
    const localValue = String(local.result_value ?? "");
    const remoteValue = String(remote.result_value ?? "");
    const expectedPhotos = parsePhotoUrls(local.photo_urls).length +
      (pending.photos[local.step_order] || []).length;
    return localValue === remoteValue &&
      parsePhotoUrls(remote.photo_urls).length >= expectedPhotos;
  });
}


/* =========================================================
   3. JOB ID
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
  async () => {

    if (!jobId) {

      showError(
        "Không tìm thấy mã công việc."
      );

      return;
    }

    await loadJob();

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
        `${GET_JOB_API}?job=${encodeURIComponent(jobId)}&t=${Date.now()}`
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

    const data =
      JSON.parse(rawText);

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


    /*
      RẤT QUAN TRỌNG:
      đọc trạng thái thiết bị trước khi render.
    */

    await loadDeviceStatuses();


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
      "Không tải được công việc.\n"
      +
      error.message
    );

  }

}



/* =========================================================
   6. LOAD DEVICE STATUS
========================================================= */

async function loadDeviceStatuses() {

  /*
    Không cache dữ liệu cũ.
  */

  const previousStatuses = { ...deviceStatusMap };
  deviceStatusMap = {};

  try {

    const response =
      await fetch(

        `${GET_DEVICE_STATUS_API}`
        +
        `?job=${encodeURIComponent(jobId)}`
        +
        `&t=${Date.now()}`

      );

    if (!response.ok) {

      throw new Error(
        `HTTP ${response.status}`
      );

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
              : []
          );


    rows.forEach(
      row => {

        const code =
          String(
            row.device_code || ""
          )
            .trim();

        if (!code) {

          return;

        }

        deviceStatusMap[
          code
        ] = {

          ...row,

          status:
            String(
              row.status || ""
            )
              .trim()
              .toUpperCase()

        };

      }
    );


    // Không để phản hồi trạng thái cũ xóa INSPECTING/COMPLETED vừa gửi.
    Object.keys(pendingInspectionByDevice).forEach(code => {
      if (previousStatuses[code]) deviceStatusMap[code] = previousStatuses[code];
    });

    console.log(
      "DEVICE STATUS:",
      deviceStatusMap
    );

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

  if (
    Array.isArray(value)
  ) {

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
   8. SENSOR TYPE
========================================================= */

function normalizeRawSensorType(
  type
) {

  return String(
    type || ""
  )
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



function groupDevicesByType(
  list
) {

  const groups = {};


  list.forEach(
    device => {

      const key =
        getDeviceGroupKey(
          device.sensor_type
        );


      if (!groups[key]) {

        groups[key] = [];

      }


      groups[key].push(
        device
      );

    }
  );


  return groups;

}



/* =========================================================
   10. RENDER JOB
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
    currentJob.job_id
    ||
    jobId
  );


  setText(
    "jobRequester",
    currentJob.requester_name
    ||
    "Không xác định"
  );


  setText(
    "jobRequest",
    currentJob.request
    ||
    "-"
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
   11. RENDER DEVICE TYPES
========================================================= */

function renderDeviceTypes() {

  const container =
    document.getElementById(
      "deviceTypes"
    );


  if (!container) {

    return;

  }


  container.innerHTML =
    "";


  Object.entries(
    deviceGroups
  )
    .forEach(
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
            device => {

              const code =
                String(
                  device.code || ""
                ).trim();

              return (
                String(
                  deviceStatusMap[
                    code
                  ]?.status || ""
                )
                  .trim()
                  .toUpperCase()
                ===
                "COMPLETED"
              );

            }
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
          async () => {

            await selectDeviceGroup(
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
   12. SELECT DEVICE GROUP
========================================================= */

async function selectDeviceGroup(
  groupKey,
  button
) {

  ++deviceSelectionVersion;
  clearInspectionPhotoState();

  selectedGroup =
    groupKey;


  selectedDevice =
    null;


  currentProcedure =
    [];


  savedInspectionRows =
    [];


  editingExistingInspection =
    false;


  document
    .querySelectorAll(
      ".device-type-button"
    )
    .forEach(
      btn => {

        btn.classList.remove(
          "active"
        );

      }
    );


  if (button) {

    button.classList.add(
      "active"
    );

  }


  /*
    MỖI LẦN CHỌN NHÓM:
    đọc lại trạng thái mới nhất.
  */

  await loadDeviceStatuses();


  /*
    Cập nhật số lượng đã kiểm tra
    của các nhóm.
  */

  renderDeviceTypes();


  /*
    Sau renderDeviceTypes(),
    active class bị tạo lại.
    Đánh active lại đúng nhóm.
  */

  document
    .querySelectorAll(
      ".device-type-button"
    )
    .forEach(
      btn => {

        const title =
          btn.querySelector(
            ".device-type-name"
          )
            ?.textContent
            ?.trim();

        if (
          title ===
          getDeviceGroupName(
            groupKey
          )
        ) {

          btn.classList.add(
            "active"
          );

        }

      }
    );


  renderDevices(
    deviceGroups[
      groupKey
    ]
    ||
    []
  );


  hideElement(
    "selectedDeviceSection"
  );

  hideElement(
    "procedureSection"
  );

  hideElement(
    "saveSection"
  );

}



/* =========================================================
   13. RENDER DEVICES
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


  list.forEach(
    device => {


      const button =
        document.createElement(
          "button"
        );


      button.type =
        "button";


      button.className =
        "device-button";


      const code =
        String(
          device.code ||
          "Không có mã"
        )
          .trim();


      const type =
        normalizeRawSensorType(
          device.sensor_type
        );


      const meta =
        [

          `Type: ${type}`,

          device.mux
            ? `MUX: ${device.mux}`
            : "",

          device.channel
            ? `Kênh: ${device.channel}`
            : "",

          device.elevation
            ? `Cao trình: ${device.elevation}`
            : "",

          device.serial_no
            ? `Serial: ${device.serial_no}`
            : ""

        ]
          .filter(Boolean)
          .join(" • ");


      const savedStatus =
        deviceStatusMap[
          code
        ];


      const isInspecting = String(savedStatus?.status || "").trim().toUpperCase() === "INSPECTING";

      const isCompleted =
        String(
          savedStatus?.status
          ||
          ""
        )
          .trim()
          .toUpperCase()
        ===
        "COMPLETED";


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
                  margin-top:6px;
                  color:#15803d;
                  font-weight:700;
                "
              >
                Đã kiểm tra
              </div>

            `

            : isInspecting
              ? `<div style="margin-top:6px;color:#b45309;font-weight:700;">💾 Đang kiểm tra — tiếp tục nhập</div>`
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

    }
  );


  if (section) {

    section.classList.remove(
      "hidden"
    );

  }

}



/* =========================================================
   14. SELECT NEW DEVICE
========================================================= */

async function selectDevice(
  device,
  button
) {

  ++deviceSelectionVersion;
  clearInspectionPhotoState();

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
    .forEach(
      btn => {

        btn.classList.remove(
          "active"
        );

      }
    );


  if (button) {

    button.classList.add(
      "active"
    );

  }


  showElement(
    "selectedDeviceSection"
  );


  setText(
    "selectedDeviceCode",
    device.code || ""
  );


  resetSaveButton(
    "💾 LƯU KẾT QUẢ KIỂM TRA"
  );


  const requestVersion = deviceSelectionVersion;
  await loadProcedure(
    normalizeRawSensorType(
      device.sensor_type
    )
  );
  if (requestVersion !== deviceSelectionVersion) return;

  // Luôn đọc kết quả theo job + device, không phụ thuộc trạng thái
  // GET_DEVICE_STATUS có thể còn cũ khi n8n đang xử lý sau HTTP 200.
  const selectionVersion = deviceSelectionVersion;
  const code = String(device.code || "").trim();
  const pending = pendingInspectionByDevice[code];
  try {
    // n8n/Sheets có thể trả phản hồi rỗng thoáng qua sau khi lưu.
    // Thử lại một lần trước khi coi việc đọc dữ liệu là lỗi.
    let backendRows;
    try {
      backendRows = await fetchSavedInspection();
    } catch (firstError) {
      if (selectionVersion !== deviceSelectionVersion) return;
      await new Promise(resolve => setTimeout(resolve, 600));
      if (selectionVersion !== deviceSelectionVersion) return;
      backendRows = await fetchSavedInspection();
    }
    if (selectionVersion !== deviceSelectionVersion ||
        String(selectedDevice?.code || "").trim() !== code) return;

    const backendReady = pending && pendingIsInBackend(pending, backendRows);
    if (backendReady) delete pendingInspectionByDevice[code];

    if (pending && !backendReady) {
      // Dữ liệu gửi đã nhận HTTP 200 nhưng Sheets chưa ghi xong:
      // hiển thị lại đúng dữ liệu/ảnh đang giữ trong phiên hiện tại.
      savedInspectionRows = pending.rows;
      editingExistingInspection = true;
      prefillSavedInspection(pending.rows);
      Object.entries(pending.photos).forEach(([order, files]) => {
        selectedPhotos[order] = [...files];
        renderPhotoPreviews(Number(order));
      });
    } else if (backendRows.length) {
      savedInspectionRows = backendRows;
      editingExistingInspection = true;
      prefillSavedInspection(backendRows);
    }
  } catch (error) {
    // Không báo lỗi từ request của thiết bị cũ khi người dùng đã chuyển thiết bị.
    if (selectionVersion !== deviceSelectionVersion ||
        String(selectedDevice?.code || "").trim() !== code) return;
    console.error("LOAD SAVED INSPECTION:", error);
    if (pending) {
      savedInspectionRows = pending.rows;
      editingExistingInspection = true;
      prefillSavedInspection(pending.rows);
      Object.entries(pending.photos).forEach(([order, files]) => {
        selectedPhotos[order] = [...files];
        renderPhotoPreviews(Number(order));
      });
    } else {
      // Thiết bị chưa có kết quả: biểu mẫu trống là bình thường.
      // Thiết bị đang kiểm tra: báo lỗi ngay trong biểu mẫu, không bật
      // alert chặn giao diện; có thể bấm lại thiết bị để tải lại.
      const status = String(deviceStatusMap[code]?.status || "").trim().toUpperCase();
      if (status === "INSPECTING" || status === "COMPLETED") {
        const list = document.getElementById("procedureList");
        if (list) {
          list.innerHTML = '<div class="error-box">Chưa tải được kết quả đã lưu. Anh bấm lại thiết bị để thử tải lại trước khi nhập tiếp.</div>';
        }
        hideElement("saveSection");
        return;
      }
    }
  }
  updateInspectionSaveButton();

}



/* =========================================================
   15. SHOW COMPLETED DEVICE
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
    .forEach(
      btn => {

        btn.classList.remove(
          "active"
        );

      }
    );


  if (button) {

    button.classList.add(
      "active"
    );

  }


  showElement(
    "selectedDeviceSection"
  );


  setText(
    "selectedDeviceCode",
    device.code || ""
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


  container.innerHTML = `

    <div class="card">

      <div
        style="
          font-size:20px;
          font-weight:700;
          color:#15803d;
          margin-bottom:14px;
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

        <strong>Người kiểm tra:</strong>

        ${escapeHtml(
          status?.inspector_name
          ||
          "Không xác định"
        )}

      </div>


      <div style="margin-top:8px;">

        <strong>Thời gian:</strong>

        ${escapeHtml(
          formatDateTime(
            status?.checked_at
          )
        )}

      </div>


      <button
        type="button"
        class="btn btn-secondary"
        style="margin-top:16px;"
        onclick="viewSavedResult()"
      >

        👁 XEM KẾT QUẢ

      </button>


      <button
        type="button"
        class="btn btn-primary"
        style="margin-top:10px;"
        onclick="editSavedInspection()"
      >

        ✏️ CHỈNH SỬA

      </button>

    </div>

  `;

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

        Đang tải quy trình...

      </div>

    `;

  }


  try {

    const response =
      await fetch(

        `${GET_PROCEDURE_API}`
        +
        `?type=${encodeURIComponent(type)}`
        +
        `&t=${Date.now()}`

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
        `Không tìm thấy quy trình cho ${type}.`
      );

    }


    let data =
      JSON.parse(
        rawText
      );


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


    if (!currentProcedure.length) {

      throw new Error(
        "Quy trình trống."
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

          Không tải được quy trình.

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


  currentProcedure.forEach(
    step => {

      container.appendChild(
        createProcedureStep(
          step
        )
      );

    }
  );


  // Đồng bộ ngay sau khi toàn bộ bước đã được gắn vào DOM.
  // Delegation còn hoạt động khi người dùng đổi kết quả ở bất kỳ bước nào.
  if (container && !container.dataset.inspectionListenersBound) {
    const onInspectionEdit = event => {
      if (event.target?.id === "assessment-3") {
        updateDplStep4Visibility();
      }
      updateInspectionSaveButton();
    };
    container.addEventListener("change", onInspectionEdit);
    container.addEventListener("input", onInspectionEdit);
    container.dataset.inspectionListenersBound = "1";
  }

  showElement(
    "saveSection"
  );
  updateDplStep4Visibility();
  updateInspectionSaveButton();

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
          PHƯƠNG PHÁP THỰC HIỆN
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
          TIÊU CHUẨN ĐÁNH GIÁ
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

                Tối thiểu
                ${photoMin || 1}
                ảnh

              </div>


              <div
                id="old-photo-${order}"
                style="margin-bottom:8px;"
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


  wrapper.addEventListener("input", updateInspectionSaveButton);
  wrapper.addEventListener("change", updateInspectionSaveButton);

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


  /* =====================================================
     SELECT
  ===================================================== */

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


  /* =====================================================
     NUMBER
  ===================================================== */

  if (
    type ===
    "number_result"
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


  /* =====================================================
     MULTI NUMBER
  ===================================================== */

  if (
    type ===
    "multi_number_result"
  ) {

    const units =
      String(
        step.unit || ""
      )
        .split(",")
        .map(
          value =>
            value.trim()
        )
        .filter(Boolean);


    /*
      Xác định riêng BƯỚC 3
      của quy trình DPL_420MA
    */

    const isDplStep3 =

      String(
        step.procedure_code || ""
      )
        .trim()
        .toUpperCase()

      === "DPL_420MA"

      &&

      order === 3;


    /*
      Tạo các ô theo unit trong Google Sheet.

      Với DPL_420MA:
      mA -> Giá trị dòng điện
      V  -> Giá trị điện áp
    */

    const measurementHtml =

      units
        .map(
          (unit, index) => {

            let label =
              `Giá trị ${unit}`;


            if (
              isDplStep3
              &&
              unit.toLowerCase() === "ma"
            ) {

              label =
                "Giá trị dòng điện";

            }


            if (
              isDplStep3
              &&
              unit.toLowerCase() === "v"
            ) {

              label =
                "Giá trị điện áp";

            }


            return `

              <div class="form-group">

                <label class="form-label">

                  ${escapeHtml(label)}

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

            `;

          }
        )
        .join("");


    /*
      Hai trường bổ sung riêng cho DPL:
      1. Giá trị quy đổi tự động
      2. Giá trị hiển thị trên thiết bị
    */

    const dplExtraHtml =

      isDplStep3

        ? `

            <div class="form-group">

              <label class="form-label">
                Giá trị quy đổi
              </label>


              <div class="number-row">

                <input
                  type="number"
                  step="any"
                  id="converted-mm-${order}"
                  readonly
                  placeholder="Tự động tính"
                >


                <div class="unit-box">
                  mm
                </div>

              </div>

            </div>


            <div class="form-group">

              <label class="form-label">
                Giá trị hiển thị trên thiết bị
              </label>


              <div class="number-row">

                <input
                  type="number"
                  step="any"
                  id="display-mm-${order}"
                >


                <div class="unit-box">
                  mm
                </div>

              </div>

            </div>

          `

        : "";


    /*
      Đánh giá vẫn do người kiểm tra lựa chọn.
      KHÔNG tự động kết luận.
    */

    const assessmentHtml = `

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


    container.innerHTML =

      measurementHtml
      +
      dplExtraHtml
      +
      assessmentHtml;


    /*
      Chỉ gắn xử lý tự động cho
      DPL_420MA - Bước 3
    */

    if (
      isDplStep3
    ) {

      /*
        Tìm vị trí unit mA.
        Không mặc định mA luôn là index 0
        để tránh phụ thuộc thứ tự Google Sheet.
      */

      const maIndex =

        units.findIndex(
          unit =>
            unit
              .toLowerCase()
            ===
            "ma"
        );


      const maInput =

  maIndex >= 0

    ? container.querySelector(
        `#multi-${order}-${maIndex}`
      )

    : null;


      /*
        Khi thay đổi mA:
        tự động tính lại mm.
      */

      if (
        maInput
      ) {

        maInput.addEventListener(
          "input",
          () => {

            updateDplConvertedValue(
              order
            );

          }
        );

      }


      /*
        Khi người kiểm tra thay đổi
        Đạt / Không đạt:
        cập nhật việc hiển thị Bước 4.
      */

      // Phần tử vừa được tạo trong container.innerHTML nhưng container
      // CHƯA được gắn vào document; getElementById ở đây trả về null.
      const assessmentInput =

        container.querySelector(
          `#assessment-${order}`
        );


      if (
        assessmentInput
      ) {

        assessmentInput.addEventListener(
          "change",
          () => {

            updateDplStep4Visibility();

          }
        );

      }

    }


    return;

  }


  /* =====================================================
     MULTI NODE
  ===================================================== */

  if (
    type ===
    "multi_node_number"
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


  /* =====================================================
     DEFAULT
  ===================================================== */

  container.innerHTML = `

    <div class="form-group">

      <label class="form-label">
        Kết quả
      </label>


      <input
        type="text"
        id="value-${order}"
      >

    </div>

  `;

}
/* =========================================================
   DPL 4-20mA - TÍNH GIÁ TRỊ QUY ĐỔI
========================================================= */


/*
  Kiểm tra có phải Bước 3
  của quy trình DPL_420MA hay không.
*/

function isDpl420Step3(
  step
) {

  return (

    String(
      step?.procedure_code || ""
    )
      .trim()
      .toUpperCase()

    ===
    "DPL_420MA"

    &&

    Number(
      step?.step_order
    )
    ===
    3

  );

}


/*
  Xác định phương đo từ mã thiết bị.

  Ví dụ:

  DPL2GA/X
  => phương X
  => hệ số 3.125

  DPL2GA/Y
  => phương Y
  => hệ số 6.25
*/

function getDplAxisAndFactor() {

  const deviceCode =

    String(
      selectedDevice?.code || ""
    )
      .trim()
      .toUpperCase();


  /*
    PHƯƠNG X
  */

  if (
    deviceCode.endsWith("/X")
  ) {

    return {

      axis:
        "X",

      factor:
        3.125

    };

  }


  /*
    PHƯƠNG Y
  */

  if (
    deviceCode.endsWith("/Y")
  ) {

    return {

      axis:
        "Y",

      factor:
        6.25

    };

  }


  /*
    Không xác định được phương.
  */

  return {

    axis:
      "",

    factor:
      null

  };

}


/*
  Tính giá trị quy đổi.

  Công thức hiện dùng:

  Phương X:
  mm = mA × 3.125

  Phương Y:
  mm = mA × 6.25
*/

function updateDplConvertedValue(
  order = 3
) {

  /*
    Tìm cấu hình của bước hiện tại.
  */

  const step =

    currentProcedure.find(
      item =>

        Number(
          item.step_order
        )

        ===

        Number(
          order
        )
    );


  /*
    Không phải DPL_420MA - Bước 3
    thì không xử lý.
  */

  if (
    !isDpl420Step3(
      step
    )
  ) {

    return;

  }


  /*
    Đọc danh sách đơn vị.

    Hiện tại Google Sheet:
    mA,V
  */

  const units =

    String(
      step.unit || ""
    )
      .split(",")

      .map(
        value =>
          value.trim()
      )

      .filter(
        Boolean
      );


  /*
    Tìm đúng ô mA.
  */

  const maIndex =

    units.findIndex(
      unit =>

        unit
          .toLowerCase()

        ===

        "ma"
    );


  const maInput =

    maIndex >= 0

      ? document.getElementById(
          `multi-${order}-${maIndex}`
        )

      : null;


  /*
    Ô Giá trị quy đổi.
  */

  const convertedInput =

    document.getElementById(
      `converted-mm-${order}`
    );


  if (
    !convertedInput
  ) {

    return;

  }


  /*
    Nếu chưa nhập mA
    thì để trống kết quả.
  */

  if (
    !maInput
    ||
    maInput.value === ""
  ) {

    convertedInput.value =
      "";

    return;

  }


  /*
    Chuyển mA sang Number.
  */

  const maValue =

    Number(
      maInput.value
    );


  if (
    !Number.isFinite(
      maValue
    )
  ) {

    convertedInput.value =
      "";

    return;

  }


  /*
    Xác định X/Y và hệ số.
  */

  const {

    axis,

    factor

  } =
    getDplAxisAndFactor();


  /*
    Không xác định được X/Y.
  */

  if (
    !axis
    ||
    !factor
  ) {

    convertedInput.value =
      "";

    return;

  }


  /*
    TÍNH GIÁ TRỊ QUY ĐỔI
  */

  const convertedValue =

  (maValue - 4)
  *
  factor;

  /*
    Hiển thị tối đa 4 chữ số
    sau dấu thập phân.

    Number() giúp bỏ các số 0
    không cần thiết ở cuối.
  */

  convertedInput.value =

    Number(
      convertedValue.toFixed(4)
    );

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
        Mắt / dây cảm biến
      </label>

      <input
        type="text"
        id="node-name-${order}-${index}"
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
        >

        <div class="unit-box">

          ${escapeHtml(
            step.unit ||
            ""
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
    row
  );

}



/* =========================================================
   21. FETCH SAVED INSPECTION
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
      +
      `&t=${Date.now()}`

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
   22. VIEW SAVED RESULT
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
        .forEach(
          row => {


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
                    row.step_title ||
                    ""
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

          }
        );


      hideElement(
        "saveSection"
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
   23. EDIT SAVED INSPECTION
========================================================= */

window.editSavedInspection =
  async function() {

    try {

      const rows =
        await fetchSavedInspection();


      if (!rows.length) {

        throw new Error(
          "Không tìm thấy dữ liệu cũ."
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


      updateInspectionSaveButton();


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
   24. PREFILL SAVED INSPECTION
========================================================= */

function prefillSavedInspection(
  rows
) {

  rows.forEach(
    row => {


      const order =
        Number(
          row.step_order
        );


      const step =
        currentProcedure.find(
          item =>
            Number(
              item.step_order
            )
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
        row.result_value
        ??
        "";


      const resultStatus =
        row.result_status
        ??
        "";


      const note =
        document.getElementById(
          `note-${order}`
        );


      if (note) {

        note.value =
          row.note || "";

      }


      if (
        type === "select"
        ||
        type === "select_note"
        ||
        type === "final_assessment"
      ) {

        const input =
          document.getElementById(
            `value-${order}`
          );


        if (input) {

          input.value =
            type === "final_assessment"
              ? (resultStatus || resultValue)
              : resultValue;

        }

      }


      else if (
        type ===
        "number_result"
      ) {

        const input =
          document.getElementById(
            `value-${order}`
          );


        const assessment =
          document.getElementById(
            `assessment-${order}`
          );


        if (input) {

          input.value =
            resultValue;

        }


        if (assessment) {

          assessment.value =
            resultStatus;

        }

      }


      else if (
        type ===
        "multi_number_result"
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
            .map(
              value =>
                value.trim()
            )
            .filter(Boolean);


        units.forEach(
          (unit, index) => {

            const input =
              document.getElementById(
                `multi-${order}-${index}`
              );


            if (input) {

              input.value =
                values?.[unit]
                ??
                "";

            }

          }
        );


        const assessment =
          document.getElementById(
            `assessment-${order}`
          );


        if (assessment) {

          assessment.value =
            resultStatus;

        }

        if (isDpl420Step3(step)) {
          const converted = document.getElementById(`converted-mm-${order}`);
          const displayed = document.getElementById(`display-mm-${order}`);
          if (converted) converted.value = values?.converted_mm ?? "";
          if (displayed) displayed.value = values?.display_mm ?? "";
          if (converted && !converted.value) updateDplConvertedValue(order);
        }

      }


      else if (
        type ===
        "multi_node_number"
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
                  node.node
                  ||
                  "";

              }


              if (value) {

                value.value =
                  node.value
                  ||
                  "";

              }


              if (status) {

                status.value =
                  node.status
                  ||
                  "";

              }

            }
          );

        }

      }


      const urls =
        parsePhotoUrls(
          row.photo_urls
        );


         /*
        =====================================================
        HIỂN THỊ ẢNH CŨ CỦA BƯỚC KIỂM TRA
        =====================================================
      */

      const oldPhotoBox =
        document.getElementById(
          `old-photo-${order}`
        );


      /*
        Lưu danh sách ảnh cũ hiện còn được giữ lại.

        Khi mới mở chế độ chỉnh sửa:
        remainingOldPhotos sẽ chứa toàn bộ
        URL ảnh đã lưu của bước này.
      */

      remainingOldPhotos[order] =
        [...urls];


      /*
        Hiển thị ảnh cũ.
      */

      if (
        oldPhotoBox
      ) {

        renderOldPhotos(
          order
        );

      }

    }

  );
  updateDplStep4Visibility();
  updateInspectionSaveButton();

}


/* =========================================================
   HIỂN THỊ DANH SÁCH ẢNH CŨ
========================================================= */

function renderOldPhotos(
  order
) {

  const oldPhotoBox =
    document.getElementById(
      `old-photo-${order}`
    );


  /*
    Không tìm thấy vùng hiển thị ảnh.
  */

  if (
    !oldPhotoBox
  ) {

    return;

  }


  /*
    Danh sách ảnh cũ hiện còn được giữ.
  */

  const urls =
    remainingOldPhotos[order]
    ||
    [];


  /*
    Nếu người dùng đã xóa hết ảnh cũ
    thì xóa nội dung hiển thị.
  */

  if (
    urls.length === 0
  ) {

    oldPhotoBox.innerHTML =
      "";

    return;

  }


  /*
    Hiển thị danh sách ảnh cũ
    và nút Xóa cho từng ảnh.
  */

  oldPhotoBox.innerHTML = `

    <div
      style="
        color:#15803d;
        font-weight:700;
        margin-bottom:8px;
      "
    >

      ✅ Ảnh đã lưu:
      ${urls.length}

    </div>


    ${

      urls
        .map(
          (url, index) => `

            <div
              style="
                display:flex;
                align-items:center;
                gap:8px;
                margin-bottom:8px;
              "
            >

              <a
                href="${escapeHtml(url)}"
                target="_blank"
                rel="noopener noreferrer"
                style="
                  flex:1;
                  min-width:0;
                "
              >

                📷 Xem ảnh cũ ${index + 1}

              </a>


              <button
                type="button"
                onclick="removeOldPhoto(${order}, ${index})"
                style="
                  flex:none;
                  border:none;
                  border-radius:6px;
                  padding:6px 10px;
                  cursor:pointer;
                  font-weight:700;
                "
              >

                ✕ Xóa

              </button>

            </div>

          `
        )
        .join("")

    }

  `;

}


/* =========================================================
   XÓA ẢNH CŨ KHỎI DANH SÁCH GIỮ LẠI
========================================================= */

function removeOldPhoto(
  order,
  index
) {

  /*
    Nếu bước này chưa có danh sách ảnh cũ
    thì không làm gì.
  */

  if (
    !Array.isArray(
      remainingOldPhotos[order]
    )
  ) {

    return;

  }


  /*
    Xóa đúng URL ảnh mà người dùng chọn.
  */

  remainingOldPhotos[order].splice(
    index,
    1
  );


  /*
    Vẽ lại danh sách ảnh cũ.
  */

  renderOldPhotos(
    order
  );

}


/* =========================================================
   25. PHOTO PREVIEW
========================================================= */

function previewPhotos(
  event,
  order
) {

  const input =
    event.target;


  const newFiles =
    Array.from(
      input.files || []
    )
      .filter(
        file =>
          file.type.startsWith(
            "image/"
          )
      );


  /*
    Nếu bước này chưa có danh sách ảnh
    thì khởi tạo.
  */

  if (
    !selectedPhotos[order]
  ) {

    selectedPhotos[order] =
      [];

  }


  /*
    Thêm ảnh vừa chọn vào danh sách cũ.
    Không xóa những ảnh đã chọn trước đó.
  */

  newFiles.forEach(
    file => {

      selectedPhotos[order].push(
        file
      );

    }
  );


  /*
    Render lại toàn bộ preview.
  */

  renderPhotoPreviews(
    order
  );


  /*
    Xóa giá trị input để người dùng
    có thể tiếp tục bấm chọn/chụp ảnh khác.
  */

  input.value =
    "";

}
function renderPhotoPreviews(
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


  const files =
    selectedPhotos[order]
    ||
    [];


  files.forEach(
    (file, index) => {

      const reader =
        new FileReader();


      reader.onload =
        event => {

          /*
            Khung chứa một ảnh.
          */

          const item =
            document.createElement(
              "div"
            );


          item.style.position =
            "relative";

          item.style.display =
            "inline-block";

          item.style.margin =
            "5px";


          /*
            Ảnh preview.
          */

          const img =
            document.createElement(
              "img"
            );


          img.src =
            event.target.result;

          img.style.width =
            "110px";

          img.style.height =
            "110px";

          img.style.objectFit =
            "cover";

          img.style.borderRadius =
            "8px";


          /*
            Nút X xóa ảnh.
          */

          const deleteButton =
            document.createElement(
              "button"
            );


          deleteButton.type =
            "button";

          deleteButton.innerHTML =
            "✕";

          deleteButton.title =
            "Xóa ảnh";


          deleteButton.style.position =
            "absolute";

          deleteButton.style.top =
            "4px";

          deleteButton.style.right =
            "4px";

          deleteButton.style.width =
            "28px";

          deleteButton.style.height =
            "28px";

          deleteButton.style.border =
            "none";

          deleteButton.style.borderRadius =
            "50%";

          deleteButton.style.cursor =
            "pointer";

          deleteButton.style.fontWeight =
            "bold";


          /*
            Khi bấm X:
            xóa đúng ảnh này.
          */

          deleteButton.addEventListener(
            "click",
            () => {

              removeSelectedPhoto(
                order,
                index
              );

            }
          );


          item.appendChild(
            img
          );


          item.appendChild(
            deleteButton
          );


          preview.appendChild(
            item
          );

        };


      reader.readAsDataURL(
        file
      );

    }
  );

}


function removeSelectedPhoto(
  order,
  index
) {

  if (
    !selectedPhotos[order]
  ) {

    return;

  }


  /*
    Xóa đúng ảnh theo vị trí.
  */

  selectedPhotos[order].splice(
    index,
    1
  );


  /*
    Vẽ lại preview.
  */

  renderPhotoPreviews(
    order
  );

}

/* =========================================================
   26. GET SAVED ROW
========================================================= */

function getSavedRow(
  stepOrder
) {

  return savedInspectionRows.find(
    row =>
      Number(
        row.step_order
      )
      ===
      Number(
        stepOrder
      )
  );

}



/* =========================================================
   27. COLLECT RESULTS
========================================================= */

// Chỉ áp dụng nhánh bỏ qua bước 4 cho DPL_420MA.
function isDpl420Procedure() {
  return currentProcedure.some(isDpl420Step3);
}

function getDplStep3Assessment() {
  return String(document.getElementById("assessment-3")?.value || "").trim().toLowerCase();
}

function isDplStep4Skipped() {
  return isDpl420Procedure() && getDplStep3Assessment() === "đạt";
}

function updateDplStep4Visibility() {
  if (!isDpl420Procedure()) return;

  const step4 = currentProcedure.find(step => Number(step.step_order) === 4);
  if (!step4) return;

  const resultInput = document.getElementById("value-4");
  const wrapper = resultInput?.closest(".procedure-step") ||
    document.getElementById("result-4")?.closest(".procedure-step");
  if (!wrapper) return;

  const skipped = isDplStep4Skipped();
  const automaticValue = "Không kiểm tra";
  const automaticNote = "Bước 3 đạt, không thực hiện bước 4.";
  const noteInput = document.getElementById("note-4");
  const photoInput = document.getElementById("photo-4");

  // Bước 4 luôn hiển thị để người kiểm tra nhìn thấy kết quả tự động.
  wrapper.classList.remove("hidden");

  if (resultInput) {
    if (skipped) {
      // Với select, phải thêm option trước khi gán value; nếu không UI vẫn trống.
      if (resultInput.tagName === "SELECT" &&
          !Array.from(resultInput.options).some(o => o.value === automaticValue)) {
        resultInput.add(new Option(automaticValue, automaticValue));
      }
      // Giữ lựa chọn thủ công để khôi phục nếu đổi lại bước 3 Không đạt.
      if (!resultInput.dataset.dplAutoSkip) {
        resultInput.dataset.dplManualValue = resultInput.value || "";
      }
      resultInput.value = automaticValue;
      resultInput.dataset.dplAutoSkip = "1";
      resultInput.disabled = true;
    } else {
      if (resultInput.dataset.dplAutoSkip === "1") {
        resultInput.value = resultInput.dataset.dplManualValue || "";
      }
      delete resultInput.dataset.dplAutoSkip;
      resultInput.disabled = false;
    }
  }

  if (noteInput) {
    if (skipped) {
      if (!noteInput.dataset.dplAutoSkip) {
        noteInput.dataset.dplManualValue = noteInput.value || "";
      }
      noteInput.value = automaticNote;
      noteInput.dataset.dplAutoSkip = "1";
      noteInput.disabled = true;
    } else {
      if (noteInput.dataset.dplAutoSkip === "1") {
        noteInput.value = noteInput.dataset.dplManualValue || "";
      }
      delete noteInput.dataset.dplAutoSkip;
      noteInput.disabled = false;
    }
  }

  // Bước 3 Đạt: không bắt ảnh bước 4; Không đạt: trả lại quyền tải ảnh.
  if (photoInput) photoInput.disabled = skipped;
  const photoBox = photoInput?.closest(".photo-box");
  if (photoBox) photoBox.classList.toggle("hidden", skipped);

  updateInspectionSaveButton();
}

function readInspectionStep(step) {
  const order = Number(step.step_order);
  const type = String(step.input_type || "select_note").trim().toLowerCase();
  let value = "";
  let assessment = "";

  if (type === "multi_number_result") {
    const units = String(step.unit || "").split(",").map(x => x.trim()).filter(Boolean);
    value = {};
    units.forEach((unit, index) => {
      value[unit] = document.getElementById(`multi-${order}-${index}`)?.value?.trim() || "";
    });
    if (isDpl420Step3(step)) {
      const {axis, factor} = getDplAxisAndFactor();
      value.axis = axis || "";
      value.factor = factor ?? "";
      value.converted_mm = document.getElementById(`converted-mm-${order}`)?.value?.trim() || "";
      value.display_mm = document.getElementById(`display-mm-${order}`)?.value?.trim() || "";
    }
    assessment = document.getElementById(`assessment-${order}`)?.value?.trim() || "";
  } else if (type === "multi_node_number") {
    const holder = document.getElementById(`nodes-${order}`);
    value = holder ? Array.from(holder.children).map((_, index) => ({
      node: document.getElementById(`node-name-${order}-${index}`)?.value?.trim() || "",
      value: document.getElementById(`node-value-${order}-${index}`)?.value?.trim() || "",
      status: document.getElementById(`node-status-${order}-${index}`)?.value?.trim() || ""
    })) : [];
  } else {
    value = document.getElementById(`value-${order}`)?.value?.trim() || "";
    assessment = document.getElementById(`assessment-${order}`)?.value?.trim() || "";
  }
  // Bước 5 (final_assessment) dùng select value-5 nhưng cần lưu
  // riêng result_status để báo cáo Google Docs đọc đúng đánh giá.
  if (type === "final_assessment") assessment = value;
  const savedRow = getSavedRow(order);
  const oldPhotoUrls = Array.isArray(remainingOldPhotos[order])
    ? remainingOldPhotos[order]
    : savedRow ? parsePhotoUrls(savedRow.photo_urls) : [];
  return {
    step_order: order,
    step_title: step.step_title || "",
    result: value,
    assessment,
    note: document.getElementById(`note-${order}`)?.value?.trim() || "",
    unit: step.unit || "",
    existing_photo_urls: oldPhotoUrls,
    photo_count: oldPhotoUrls.length + (selectedPhotos[order] || []).length
  };
}

function isStepComplete(step, result) {
  const type = String(step.input_type || "select_note").trim().toLowerCase();
  if (isDpl420Procedure() && Number(step.step_order) === 4 && isDplStep4Skipped()) return true;
  if (type === "multi_number_result") {
    const units = String(step.unit || "").split(",").map(x => x.trim()).filter(Boolean);
    if (!units.length || units.some(unit => result.result?.[unit] === "" || result.result?.[unit] == null)) return false;
    if (isDpl420Step3(step) && (
      result.result.converted_mm === "" || result.result.display_mm === "" ||
      !result.result.axis || result.result.factor === ""
    )) return false;
    if (!result.assessment) return false;
  } else if (type === "multi_node_number") {
    if (!result.result.length || result.result.some(node => !node.node || !node.value || !node.status)) return false;
  } else {
    if (result.result === "" || result.result == null) return false;
    if (type === "number_result" && document.getElementById(`assessment-${step.step_order}`) && !result.assessment) return false;
  }
  // DPL: bước 1, 2, 3 luôn phải có ảnh, kể cả Google Sheet
  // vô tình để photo_required = FALSE.
  const mandatoryDplPhoto = isDpl420Procedure() && [1, 2, 3].includes(Number(step.step_order));
  if ((mandatoryDplPhoto || toBoolean(step.photo_required)) &&
      result.photo_count < Math.max(mandatoryDplPhoto ? 1 : 0, Number(step.photo_min || 1))) return false;
  // Bước 5 DPL: chấp nhận lựa chọn đánh giá thực tế trong cấu hình
  // (ví dụ "Bình thường"), không ép thành "Đạt"/"Không đạt".
  // Bắt buộc có đánh giá và ghi chú để hoàn thành thiết bị.
  if (isDpl420Procedure() && Number(step.step_order) === 5 &&
      (!String(result.assessment || "").trim() || !String(result.note || "").trim())) return false;
  return true;
}

function getInspectionProgress() {
  const results = currentProcedure.map(readInspectionStep);
  const completed = currentProcedure.every((step, index) =>
    (isDpl420Procedure() && [1, 2, 3, 4, 5].includes(Number(step.step_order)))
      ? isStepComplete(step, results[index])
      : (!toBoolean(step.required) || isStepComplete(step, results[index]))
  );
  return {results, completed, status: completed ? "COMPLETED" : "INSPECTING"};
}

function updateInspectionSaveButton() {
  const button = document.getElementById("saveInspectionButton");
  if (!button || button.disabled || !currentProcedure.length) return;
  button.textContent = getInspectionProgress().completed
    ? "✅ HOÀN THÀNH CÔNG VIỆC"
    : "💾 LƯU KẾT QUẢ";
}

function collectResults() {
  const progress = getInspectionProgress();

  // Với DPL_420MA, chỉ cho phép lưu tạm sau khi đã kiểm tra
  // đầy đủ bước 1, 2, 3, BAO GỒM ẢNH (ảnh mới hoặc ảnh đã lưu).
  if (isDpl420Procedure()) {
    for (const order of [1, 2, 3]) {
      const step = currentProcedure.find(s => Number(s.step_order) === order);
      const row = progress.results.find(r => r.step_order === order);
      if (!step || !row) {
        alert(`Không tìm thấy bước ${order} trong quy trình.`);
        return null;
      }
      if (row.photo_count < Math.max(1, Number(step.photo_min || 1))) {
        alert(`Bước ${order} bắt buộc có ít nhất ${Math.max(1, Number(step.photo_min || 1))} ảnh trước khi lưu.`);
        return null;
      }
      if (!isStepComplete(step, row)) {
        alert(order === 3
          ? "Bước 3: cần nhập đầy đủ số đo mA, V, giá trị hiển thị mm và chọn Đạt/Không đạt."
          : `Bước ${order}: cần nhập đầy đủ kết quả kiểm tra trước khi lưu.`);
        return null;
      }
    }
  } else {
    const hasData = progress.results.some(row => {
      const value = row.result;
      return row.assessment || row.note || row.photo_count ||
        (Array.isArray(value) ? value.some(n => n.node || n.value || n.status) :
         value && typeof value === "object" ? Object.entries(value).some(([k,v]) =>
           !["axis", "factor"].includes(k) && v !== "" && v != null) : value !== "");
    });
    if (!hasData) {
      alert("Bạn chưa nhập kết quả kiểm tra nào.");
      return null;
    }
  }
  return progress;
}

/* =========================================================
   28. SAVE INSPECTION
========================================================= */

async function saveInspection(event) {

  if (event) {

    event.preventDefault();

    event.stopPropagation();

  }


  if (!selectedDevice) {

    alert(
      "Chưa chọn thiết bị."
    );

    return;

  }


  // Không gửi lần hai ảnh của một lần lưu còn đang được n8n xử lý.
  const currentCode = String(selectedDevice.code || "").trim();
  const pendingBeforeSave = pendingInspectionByDevice[currentCode];
  if (pendingBeforeSave) {
    try {
      const remoteRows = await fetchSavedInspection();
      if (pendingIsInBackend(pendingBeforeSave, remoteRows)) {
        delete pendingInspectionByDevice[currentCode];
        savedInspectionRows = remoteRows;
        editingExistingInspection = true;
        Object.keys(selectedPhotos).forEach(key => { selectedPhotos[key] = []; });
        remoteRows.forEach(row => {
          remainingOldPhotos[Number(row.step_order)] = parsePhotoUrls(row.photo_urls);
          renderOldPhotos(Number(row.step_order));
          renderPhotoPreviews(Number(row.step_order));
        });
      } else {
        alert("Kết quả vừa lưu đang được đồng bộ lên Google Sheets. Vui lòng đợi một chút rồi bấm Lưu lại để tránh gửi trùng ảnh.");
        return;
      }
    } catch (error) {
      alert("Chưa xác nhận được lần lưu trước. Vui lòng thử lại sau để tránh gửi trùng ảnh.");
      return;
    }
  }

  const progress = collectResults();

  if (!progress) {

    return;

  }


  /*
    LƯU LẠI TRẠNG THÁI TRƯỚC KHI REQUEST
    để tránh selectedDevice thay đổi.
  */

  const savedDevice = {
    ...selectedDevice
  };


  const savedDeviceCode =
    String(
      savedDevice.code || ""
    )
      .trim();


  const wasEditing =
    editingExistingInspection;


  const telegramUser =
    window.Telegram
      ?.WebApp
      ?.initDataUnsafe
      ?.user
    ||
    {};


  const inspectorName =
    [

      telegramUser.last_name,

      telegramUser.first_name

    ]
      .filter(Boolean)
      .join(" ")
    ||
    "Không xác định";


  const nowIso =
    new Date()
      .toISOString();


  const results = progress.results.map(row => ({...row}));
  if (isDplStep4Skipped()) {
    const step4 = results.find(row => row.step_order === 4);
    if (step4) {
      step4.result = "Không kiểm tra";
      step4.assessment = "Không kiểm tra – bước 3 đạt";
      step4.note = "Bước 3 đạt, không thực hiện bước 4.";
      step4.existing_photo_urls = [];
    }
  }

  const payload = {

    inspection_status: progress.status,
    device_status: progress.status,
    mode:
      wasEditing
        ? "EDIT"
        : "CREATE",

    job_id:
      jobId,

    device_code:
      savedDeviceCode,

    sensor_type:
      normalizeRawSensorType(
        savedDevice.sensor_type
      ),

    procedure_code:
      String(
        currentProcedure[0]
          ?.procedure_code
        ||
        ""
      ).trim(),

    inspector_id:
      telegramUser.id
      ||
      "",

    inspector_name:
      inspectorName,

    checked_at:
      nowIso,

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
            result.existing_photo_urls
            ||
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


  /*
    ADD NEW PHOTOS
  */

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


    if (!input) {

      continue;

    }


   /*
  Lấy danh sách ảnh đã được người dùng chọn
  và hiện còn lại sau khi thêm/xóa ảnh.
*/

const files =
  selectedPhotos[order]
  ||
  [];


files.forEach(
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
    document.getElementById(
      "saveInspectionButton"
    );


  if (saveButton) {

    saveButton.disabled =
      true;

    saveButton.textContent =
      "⏳ ĐANG LƯU...";

  }


  try {

    console.log(
      "SAVE URL:",
      SAVE_INSPECTION_API
    );


    console.log(
      "SAVE PAYLOAD:",
      payload
    );


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


    console.log(
      "SAVE STATUS:",
      response.status
    );


    console.log(
      "SAVE RESPONSE:",
      responseText
    );


    if (!response.ok) {

      throw new Error(
        responseText
        ||
        `HTTP ${response.status}`
      );

    }


    /* =====================================================
       QUAN TRỌNG NHẤT

       n8n hiện đang Respond Immediately.
       Vì vậy sau khi browser nhận HTTP 200,
       workflow phía sau có thể vẫn đang tiếp tục xử lý.

       Ta đánh dấu COMPLETED NGAY TRONG RAM
       để người dùng có thể chuyển thiết bị khác
       mà không mất trạng thái vừa lưu.
    ===================================================== */


    deviceStatusMap[
      savedDeviceCode
    ] = {

      ...(
        deviceStatusMap[
          savedDeviceCode
        ]
        ||
        {}
      ),

      job_id:
        jobId,

      device_code:
        savedDeviceCode,

      sensor_type:
        normalizeRawSensorType(
          savedDevice.sensor_type
        ),

      procedure_code:
        String(
          currentProcedure[0]
            ?.procedure_code
          ||
          ""
        ).trim(),

      status:
        progress.status,

      inspector_id:
        telegramUser.id
        ||
        "",

      inspector_name:
        inspectorName,

      checked_at:
        nowIso,

      updated_at:
        nowIso

    };


    // Giữ bản sao dữ liệu và File ảnh trong RAM cho thiết bị vừa lưu.
    // HTTP 200 có thể đến trước khi n8n cập nhật Google Sheets.
    pendingInspectionByDevice[savedDeviceCode] = {
      rows: inspectionRowsFromPayload(payload),
      photos: Object.fromEntries(Object.entries(selectedPhotos).map(
        ([order, files]) => [order, [...files]]
      ))
    };

    /*
  Lưu thành công:
  Xóa danh sách ảnh mới đã gửi lên n8n.

  Tránh upload lại các ảnh này
  khi người dùng chỉnh sửa kết quả.
*/

for (
  const order
  of Object.keys(selectedPhotos)
) {

  selectedPhotos[order] =
    [];

}


/*
  Thoát trạng thái edit.
*/

editingExistingInspection =
  !progress.completed;


if (progress.completed) savedInspectionRows = [];

    /*
      Cập nhật ngay số lượng đã kiểm tra
      ở phần loại thiết bị.
    */

    renderDeviceTypes();


    /*
      Cập nhật ngay danh sách thiết bị
      của nhóm hiện tại.
    */

    if (selectedGroup) {

      renderDevices(
        deviceGroups[
          selectedGroup
        ]
        ||
        []
      );

    }


    /*
      Tìm lại button vừa render.
    */

    const savedButton =
      findDeviceButton(
        savedDeviceCode
      );


    /*
      selectedDevice phải được giữ lại
      để Xem kết quả / Chỉnh sửa hoạt động.
    */

    selectedDevice =
      savedDevice;


    if (savedButton && progress.completed) {
      showCompletedDevice(savedDevice, deviceStatusMap[savedDeviceCode], savedButton);
    } else if (savedButton) {
      // Giữ nguyên biểu mẫu hiện tại: n8n có thể chưa ghi xong khi trả HTTP 200.
      savedButton.classList.add("active");
    }


    alert(

      progress.completed
        ? `✅ Đã gửi kết quả hoàn thành ${savedDeviceCode}.`
        : `💾 Đã gửi kết quả đang kiểm tra ${savedDeviceCode}. Có thể mở lại để nhập tiếp sau khi n8n ghi xong.`

    );


    /*
      Sau khi local đã cập nhật,
      thử refresh backend ở nền của phiên hiện tại.

      Không dùng await để không làm người dùng
      phải chờ n8n hoàn tất.
    */

    setTimeout(
      async () => {

        try {

          const localStatus = {
            ...deviceStatusMap[
              savedDeviceCode
            ]
          };


          await loadDeviceStatuses();


          /*
            Nếu backend lúc này vẫn chưa xử lý xong
            và chưa trả thiết bị vừa lưu,
            không được xóa trạng thái COMPLETED local.
          */

          if (
            !deviceStatusMap[savedDeviceCode] ||
            (deviceStatusMap[savedDeviceCode].status !== localStatus.status &&
             Date.now() - new Date(nowIso).getTime() < 15000)
          ) {

            deviceStatusMap[
              savedDeviceCode
            ] =
              localStatus;

          }

        }

        catch (error) {

          console.log(
            "BACKGROUND STATUS REFRESH:",
            error
          );

        }

      },

      3000
    );

  }


  catch (error) {

    console.error(
      "SAVE ERROR:",
      error
    );


    alert(
      "❌ Không lưu được kết quả.\n\n"
      +
      (
        error.message
        ||
        "Không xác định"
      )
    );

  }


  finally {

    /*
      DÙ THÀNH CÔNG HAY LỖI
      cũng không để nút kẹt ĐANG LƯU.
    */

    resetSaveButton(

      progress.completed
        ? "✅ HOÀN THÀNH CÔNG VIỆC"
        : "💾 LƯU KẾT QUẢ"

    );

  }

}



/* =========================================================
   29. HELPERS
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
      JSON.parse(
        value
      );


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
    typeof value === "object"
  ) {

    return JSON.stringify(
      value
    );

  }


  return String(
    value
  );

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
    )
      .format(
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
    document.getElementById(
      "saveInspectionButton"
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


  const target =
    String(
      deviceCode || ""
    ).trim();


  for (
    const button
    of buttons
  ) {


    const text =
      button
        .querySelector(
          ".device-code"
        )
        ?.textContent
        ||
        "";


    if (
      text
        .replace(
          "✅",
          ""
        )
        .trim()
      ===
      target
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
    .getElementById(
      id
    )
    ?.classList
    .remove(
      "hidden"
    );

}



function hideElement(id) {

  document
    .getElementById(
      id
    )
    ?.classList
    .add(
      "hidden"
    );

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
   30. EXPOSE
========================================================= */

window.saveInspection =
  saveInspection;


window.addSensorNode =
  addSensorNode;
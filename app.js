const tg = window.Telegram.WebApp;

tg.ready();
tg.expand();

const SEARCH_API_URL =
  "https://kiemtrathietbi.app.n8n.cloud/webhook/search-device";

const CREATE_JOB_URL =
  "https://kiemtrathietbi.app.n8n.cloud/webhook/create-inspection";

const searchInput = document.getElementById("searchInput");
const results = document.getElementById("results");
const status = document.getElementById("status");

const selectedCount =
  document.getElementById("selectedCount");

const selectedList =
  document.getElementById("selectedList");

const requestContent =
  document.getElementById("requestContent");

const createJobBtn =
  document.getElementById("createJobBtn");

const selectedDevices = new Map();

let searchTimer = null;


/* =========================================
   KHỞI TẠO TELEGRAM MINI APP
========================================= */

try {
  tg.ready();
  tg.expand();
} catch (error) {
  console.log("Telegram WebApp init:", error);
}


/* =========================================
   TÌM THIẾT BỊ
========================================= */

searchInput.addEventListener("input", () => {

  clearTimeout(searchTimer);

  const keyword =
    searchInput.value.trim();

  if (keyword.length < 2) {

    results.innerHTML = "";

    status.innerText =
      "Nhập ít nhất 2 ký tự.";

    return;
  }

  status.innerText =
    "Đang tìm...";

  searchTimer = setTimeout(() => {

    searchDevices(keyword);

  }, 400);

});


async function searchDevices(keyword) {

  try {

    const url =
      SEARCH_API_URL +
      "?q=" +
      encodeURIComponent(keyword);

    const response =
      await fetch(url);

    if (!response.ok) {
      throw new Error(
        "Lỗi tìm thiết bị: " +
        response.status
      );
    }

    const devices =
      await response.json();

    if (!Array.isArray(devices)) {
      throw new Error(
        "Dữ liệu thiết bị không đúng định dạng."
      );
    }

    renderDevices(devices);

    status.innerText =
      `Tìm thấy ${devices.length} thiết bị`;

  }

  catch (error) {

    console.error(
      "Search error:",
      error
    );

    results.innerHTML = "";

    status.innerText =
      "Không thể tải danh sách thiết bị.";

  }

}


/* =========================================
   HIỂN THỊ KẾT QUẢ TÌM KIẾM
========================================= */

function renderDevices(devices) {

  results.innerHTML = "";

  if (devices.length === 0) {

    results.innerHTML =
      "<div>Không tìm thấy thiết bị.</div>";

    return;
  }

  devices.forEach(device => {

    const row =
      document.createElement("div");

    row.className =
      "device";

    const checkbox =
      document.createElement("input");

    checkbox.type =
      "checkbox";

    checkbox.checked =
      selectedDevices.has(
        device.code
      );

    checkbox.addEventListener(
      "change",
      () => {

        toggleDevice(
          device,
          checkbox.checked
        );

      }
    );

    const infoWrapper =
      document.createElement("div");

    const codeDiv =
      document.createElement("div");

    codeDiv.className =
      "device-code";

    codeDiv.innerText =
      device.code || "";

    const infoDiv =
      document.createElement("div");

    infoDiv.className =
      "device-info";

    const sensorType =
      device.sensor_type || "";

    const mux =
      cleanValue(device.mux);

    const channel =
      cleanValue(device.channel);

    const elevation =
      cleanValue(device.elevation);

    let detailParts = [];

    if (sensorType) {
      detailParts.push(
        sensorType
      );
    }

    if (mux) {
      detailParts.push(
        mux
      );
    }

    if (channel) {
      detailParts.push(
        "CH " + channel
      );
    }

    if (elevation) {
      detailParts.push(
        "EL." + elevation
      );
    }

    infoDiv.innerText =
      detailParts.join(" • ");

    infoWrapper.appendChild(
      codeDiv
    );

    infoWrapper.appendChild(
      infoDiv
    );

    row.appendChild(
      checkbox
    );

    row.appendChild(
      infoWrapper
    );

    results.appendChild(
      row
    );

  });

}


/* =========================================
   LÀM SẠCH GIÁ TRỊ HIỂN THỊ
========================================= */

function cleanValue(value) {

  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  const text =
    String(value)
      .replace(/\u00A0/g, " ")
      .trim();

  if (
    text === "" ||
    text === "0"
  ) {
    return "";
  }

  return text;
}


/* =========================================
   CHỌN / BỎ CHỌN THIẾT BỊ
========================================= */

function toggleDevice(
  device,
  checked
) {

  if (checked) {

    selectedDevices.set(
      device.code,
      device
    );

  }

  else {

    selectedDevices.delete(
      device.code
    );

  }

  renderSelectedDevices();

}


/* =========================================
   HIỂN THỊ DANH SÁCH ĐÃ CHỌN
========================================= */

function renderSelectedDevices() {

  selectedCount.innerText =
    selectedDevices.size;

  selectedList.innerHTML = "";

  selectedDevices.forEach(
    device => {

      const item =
        document.createElement("div");

      item.className =
        "selected-device";

      item.innerText =
        "✓ " + device.code;

      selectedList.appendChild(
        item
      );

    }
  );

}


/* =========================================
   KHÓA / MỞ NÚT TẠO CÔNG VIỆC
========================================= */

function setCreatingState(
  creating
) {

  createJobBtn.disabled =
    creating;

  if (creating) {

    createJobBtn.innerText =
      "ĐANG TẠO CÔNG VIỆC...";

  }

  else {

    createJobBtn.innerText =
      "TẠO CÔNG VIỆC";

  }

}


/* =========================================
   TẠO CÔNG VIỆC
========================================= */

createJobBtn.addEventListener(
  "click",
  async () => {

    const content =
      requestContent.value.trim();

    if (!content) {

      alert(
        "Vui lòng nhập nội dung yêu cầu."
      );

      return;
    }

    if (
      selectedDevices.size === 0
    ) {

      alert(
        "Vui lòng chọn ít nhất một thiết bị."
      );

      return;
    }

    const devices =
      Array.from(
        selectedDevices.values()
      );

    const telegramUser =
      tg.initDataUnsafe?.user ||
      null;

    const createdAt =
      new Date().toISOString();

    const formData =
      new URLSearchParams();

    formData.append(
      "request",
      content
    );

    formData.append(
      "devices",
      JSON.stringify(devices)
    );

    formData.append(
      "telegram_user",
      JSON.stringify(
        telegramUser
      )
    );

    formData.append(
      "created_at",
      createdAt
    );

    formData.append(
      "device_count",
      String(
        selectedDevices.size
      )
    );

    try {

      setCreatingState(true);

      const response =
        await fetch(
          CREATE_JOB_URL,
          {
            method: "POST",
            body: formData
          }
        );

      if (!response.ok) {

        const errorText =
          await response.text();

        throw new Error(
          "HTTP " +
          response.status +
          " - " +
          errorText
        );

      }

      let responseData = null;

      try {

        responseData =
          await response.json();

      }

      catch (error) {

        responseData = null;

      }

      console.log(
        "Create job response:",
        responseData
      );

      alert(
        "Đã gửi yêu cầu kiểm tra " +
        selectedDevices.size +
        " thiết bị."
      );

      /*
        Tạm thời đóng Mini App
        sau khi gửi thành công.
        Sau này có thể đổi thành
        hiển thị Job ID trước khi đóng.
      */

      if (
        window.Telegram &&
        window.Telegram.WebApp
      ) {

        tg.close();

      }

    }

    catch (error) {

      console.error(
        "Create job error:",
        error
      );

      alert(
        "Có lỗi khi tạo công việc.\n" +
        error.message
      );

    }

    finally {

      setCreatingState(false);

    }

  }
);
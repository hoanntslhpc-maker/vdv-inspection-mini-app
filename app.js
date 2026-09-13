const tg = window.Telegram.WebApp;

tg.ready();
tg.expand();

const API_URL =
  "https://kiemtrathietbi.app.n8n.cloud/webhook/search-device";

const searchInput = document.getElementById("searchInput");
const results = document.getElementById("results");
const status = document.getElementById("status");
const selectedCount = document.getElementById("selectedCount");
const selectedList = document.getElementById("selectedList");

const selectedDevices = new Map();

let searchTimer = null;

searchInput.addEventListener("input", () => {

  clearTimeout(searchTimer);

  const keyword = searchInput.value.trim();

  if (keyword.length < 2) {
    results.innerHTML = "";
    status.innerText = "Nhập ít nhất 2 ký tự.";
    return;
  }

  status.innerText = "Đang tìm...";

  searchTimer = setTimeout(() => {
    searchDevices(keyword);
  }, 400);

});

async function searchDevices(keyword) {

  try {

    const url =
      API_URL +
      "?q=" +
      encodeURIComponent(keyword);

    const response = await fetch(url);

    const devices = await response.json();

    renderDevices(devices);

    status.innerText =
      `Tìm thấy ${devices.length} thiết bị`;

  } catch (error) {

    console.error(error);
    status.innerText =
      "Không thể tải danh sách thiết bị.";

  }

}

function renderDevices(devices) {

  results.innerHTML = "";

  devices.forEach(device => {

    const row = document.createElement("div");
    row.className = "device";

    const checked =
      selectedDevices.has(device.code)
        ? "checked"
        : "";

    row.innerHTML = `
      <input
        type="checkbox"
        ${checked}
      >

      <div>
        <div class="device-code">
          ${device.code}
        </div>

        <div class="device-info">
          ${device.sensor_type || ""}
          • ${device.mux || ""}
          • CH ${device.channel || ""}
          • EL.${device.elevation || ""}
        </div>
      </div>
    `;

    const checkbox = row.querySelector("input");

    checkbox.addEventListener(
      "change",
      () => toggleDevice(device, checkbox.checked)
    );

    results.appendChild(row);

  });

}

function toggleDevice(device, checked) {

  if (checked) {
    selectedDevices.set(device.code, device);
  } else {
    selectedDevices.delete(device.code);
  }

  renderSelectedDevices();

}

function renderSelectedDevices() {

  selectedCount.innerText =
    selectedDevices.size;

  selectedList.innerHTML = "";

  selectedDevices.forEach(device => {

    const item = document.createElement("div");

    item.className = "selected-device";

    item.innerText =
      "✓ " + device.code;

    selectedList.appendChild(item);

  });

}

document
  .getElementById("createJobBtn")
  .addEventListener("click", async () => {

    const content =
      document
        .getElementById("requestContent")
        .value
        .trim();

    if (!content) {
      alert("Vui lòng nhập nội dung yêu cầu.");
      return;
    }

    if (selectedDevices.size === 0) {
      alert("Vui lòng chọn ít nhất một thiết bị.");
      return;
    }

    const CREATE_JOB_URL =
      "https://kiemtrathietbi.app.n8n.cloud/webhook/create-inspection";

    const payload = {
      request: content,
      devices: Array.from(selectedDevices.values()),

      telegram_user: tg.initDataUnsafe?.user || null,

      created_at: new Date().toISOString()
    };

    try {

      const response = await fetch(CREATE_JOB_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error("Không gửi được yêu cầu.");
      }

      alert(
        "Đã tạo yêu cầu với " +
        selectedDevices.size +
        " thiết bị."
      );

      tg.close();

    } catch (error) {

      console.error(error);

      alert(
        "Có lỗi khi tạo công việc."
      );

    }

  });
// Tọa độ trung tâm mặc định: Vĩnh Long
const DEFAULT_CENTER = [10.2537, 105.9722];
const DEFAULT_ZOOM = 13;

// Khởi tạo bản đồ (nút zoom chuyển xuống góc dưới phải)
const map = L.map('map', { zoomControl: false }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
L.control.zoom({ position: 'bottomright' }).addTo(map);

// Bản đồ nền OpenStreetMap, tự đổi sang máy chủ dự phòng nếu bị lỗi
const osmLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

let tileErrors = 0;
osmLayer.on('tileerror', () => {
  tileErrors++;
  if (tileErrors === 5) {
    map.removeLayer(osmLayer);
    L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
      subdomains: 'abc',
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, tiles by OpenStreetMap France'
    }).addTo(map);
  }
});

// Ghim đỏ kiểu Google Maps (dùng chung cho các file khác)
const redPin = L.divIcon({
  className: 'gm-pin',
  html: '<div class="gm-pin-body"></div>',
  iconSize: [30, 36],
  iconAnchor: [15, 33],
  popupAnchor: [0, -34]
});

// ---------- Gọi Nominatim (giới hạn 1 yêu cầu/giây cho cả tìm kiếm và tra địa chỉ) ----------
const NOMINATIM_GAP_MS = 1100;
let nextNominatimAt = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// isStale cho biết kết quả không còn cần nữa, khi đó trả về null và không gửi yêu cầu
async function nominatimFetch(endpoint, params, isStale) {
  while (Date.now() < nextNominatimAt) {
    await sleep(nextNominatimAt - Date.now());
    if (isStale()) return null;
  }
  if (isStale()) return null;
  nextNominatimAt = Date.now() + NOMINATIM_GAP_MS;

  const query = new URLSearchParams({ format: 'jsonv2', 'accept-language': 'vi', ...params });
  const response = await fetch(`https://nominatim.openstreetmap.org/${endpoint}?${query}`, {
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error('Lỗi máy chủ: ' + response.status);
  return response.json();
}

// ---------- Bảng kết quả: mở/thu gọn, chuyển tab ----------
const panel = document.getElementById('panel');

function openPanel() {
  panel.classList.remove('collapsed');
}

function showTab(name) {
  document.querySelectorAll('.gm-tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === name);
  });
  document.getElementById('results-list').classList.toggle('d-none', name !== 'results');
  document.getElementById('favorites-list').classList.toggle('d-none', name !== 'favorites');
}

document.querySelectorAll('.gm-tab').forEach((t) => {
  t.addEventListener('click', () => {
    showTab(t.dataset.tab);
    openPanel();
  });
});

document.getElementById('panel-toggle').addEventListener('click', () => {
  panel.classList.toggle('collapsed');
});

// Điện thoại: mặc định thu gọn bảng để thấy bản đồ (cùng mốc với @media trong style.css)
if (window.matchMedia('(max-width: 768px)').matches) panel.classList.add('collapsed');

// Cập nhật lại kích thước bản đồ khi đổi kích thước cửa sổ
window.addEventListener('resize', () => map.invalidateSize());

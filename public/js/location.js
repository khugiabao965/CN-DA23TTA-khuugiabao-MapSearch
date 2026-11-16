// ====== Lấy địa chỉ khi bấm bản đồ + định vị người dùng ======

// ---------- 1. Bấm vào bản đồ -> lấy địa chỉ ----------
let clickMarker = null;

map.on('click', async (e) => {
  const { lat, lng } = e.latlng;

  // Chỉ giữ 1 marker "điểm vừa bấm"
  if (clickMarker) map.removeLayer(clickMarker);
  const marker = L.marker([lat, lng]).addTo(map);
  clickMarker = marker;
  marker.bindPopup('Đang lấy địa chỉ...').openPopup();

  // Bỏ qua kết quả của lần bấm cũ nếu người dùng đã bấm sang điểm khác
  const isStale = () => marker !== clickMarker;
  const coords = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

  try {
    const data = await nominatimFetch('reverse', { lat, lon: lng }, isStale);
    if (!data || isStale()) return;
    const address = data.display_name || 'Không xác định được địa chỉ';
    marker.setPopupContent(
      `<b>Địa chỉ:</b><br>${escapeHtml(address)}<br>` +
      `<small class="text-muted">Tọa độ: ${coords}</small>`
    );
  } catch (error) {
    console.error(error);
    if (isStale()) return;
    marker.setPopupContent(
      `Không lấy được địa chỉ.<br><small>Tọa độ: ${coords}</small>`
    );
  }
});

// ---------- 2. Định vị vị trí người dùng ----------
const locateBtn = document.getElementById('locate-btn');
let userMarker = null;
let accuracyCircle = null;

function setLocating(isLocating) {
  locateBtn.disabled = isLocating;
  locateBtn.classList.toggle('loading', isLocating);
}

locateBtn.addEventListener('click', () => {
  if (!navigator.geolocation) {
    showToast('Trình duyệt của bạn không hỗ trợ định vị.', true);
    return;
  }

  setLocating(true);

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;

      // Xóa dấu cũ nếu có
      if (userMarker) map.removeLayer(userMarker);
      if (accuracyCircle) map.removeLayer(accuracyCircle);

      accuracyCircle = L.circle([latitude, longitude], {
        radius: accuracy,
        color: '#0d6efd',
        fillOpacity: 0.1
      }).addTo(map);

      userMarker = L.circleMarker([latitude, longitude], {
        radius: 8,
        color: '#fff',
        weight: 2,
        fillColor: '#0d6efd',
        fillOpacity: 1,
        bubblingMouseEvents: false
      }).addTo(map);
      userMarker.bindPopup(
        `<b>Bạn đang ở đây</b><br><small>Sai số khoảng ${Math.round(accuracy)} m</small>`
      ).openPopup();

      map.flyTo([latitude, longitude], 16);
      setLocating(false);
    },
    (error) => {
      let msg = 'Không xác định được vị trí.';
      if (error.code === error.PERMISSION_DENIED) {
        msg = 'Bạn đã chặn quyền truy cập vị trí. Hãy cho phép trong cài đặt trình duyệt.';
      } else if (error.code === error.POSITION_UNAVAILABLE) {
        msg = 'Thiết bị không lấy được thông tin vị trí.';
      } else if (error.code === error.TIMEOUT) {
        msg = 'Quá thời gian chờ, vui lòng thử lại.';
      }
      showToast(msg, true);
      setLocating(false);
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

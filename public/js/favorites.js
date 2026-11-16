// ====== Địa điểm yêu thích ======
// Khách: lưu bằng localStorage trên trình duyệt (theo đề cương).
// Đã đăng nhập: lưu trong CSDL theo tài khoản; dữ liệu của khách được chuyển lên khi đăng nhập.
const GUEST_FAV_KEY = 'map_favorites'; // Giữ khóa của phiên bản trước để không mất dữ liệu cũ
const IMPORT_BATCH = 50; // Mỗi lần gửi đủ nhỏ để không vượt giới hạn 256kb của máy chủ
// Cùng giới hạn với parseFavorite ở server/routes/favorites.js
const MAX_NAME = 200;
const MAX_ADDRESS = 500;

const cleanName = (name) => String(name).trim().slice(0, MAX_NAME);
const cleanAddress = (address) => String(address).trim().slice(0, MAX_ADDRESS);

const favListEl = document.getElementById('favorites-list');
const favCountEl = document.getElementById('fav-count');
const favLayer = L.layerGroup().addTo(map);

let favorites = [];

// Cùng cách tính với placeKey ở server/routes/favorites.js: tọa độ kèm tên,
// để hai địa điểm trùng tọa độ (vd. cửa hàng trong tòa nhà) không bị coi là một
function makeFavKey(lat, lon, name) {
  return Number(lat).toFixed(5) + ',' + Number(lon).toFixed(5) + '|' + cleanName(name);
}

function findFavorite(lat, lon, name) {
  const key = makeFavKey(lat, lon, name);
  return favorites.find((f) => makeFavKey(f.lat, f.lon, f.name) === key);
}

// Tăng mỗi lần đổi người dùng hoặc tải lại: phản hồi của lần tải cũ bị bỏ qua
let favoritesRequestId = 0;

function handleFavoriteError(error) {
  if (error.status === 401) {
    setCurrentUser(null);
    openAuthDialog('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');
    return;
  }
  console.error(error);
  showToast(error.message, true);
}

// ---------- Lưu cục bộ cho khách ----------
function readGuestFavorites() {
  try {
    const list = JSON.parse(localStorage.getItem(GUEST_FAV_KEY));
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function writeGuestFavorites(list) {
  try {
    localStorage.setItem(GUEST_FAV_KEY, JSON.stringify(list));
    return true;
  } catch (e) {
    console.error(e);
    showToast('Không lưu được dữ liệu vào trình duyệt.', true);
    return false;
  }
}

async function loadFavorites() {
  const requestId = ++favoritesRequestId;
  if (!currentUser) {
    favorites = readGuestFavorites();
    renderFavorites();
    return;
  }
  try {
    const data = await api('GET', '/api/favorites');
    if (requestId !== favoritesRequestId) return;
    favorites = data.favorites;
  } catch (error) {
    if (requestId !== favoritesRequestId) return;
    handleFavoriteError(error);
  }
  renderFavorites();
}

// Chuyển yêu thích đã lưu khi còn là khách sang tài khoản.
// Chỉ xóa khỏi trình duyệt những mục đã xử lý xong: đã lưu, đã có sẵn, hoặc dữ liệu lỗi.
// Mục vượt giới hạn được giữ lại; mục khách thêm trong lúc chờ mạng cũng không bị mất,
// vì danh sách được đọc lại từ localStorage ở cuối thay vì ghi đè bằng bản cũ.
async function importGuestFavorites() {
  const guest = readGuestFavorites();
  if (guest.length === 0) return;

  const identity = (item) => JSON.stringify(item);
  const handled = new Set();
  let imported = 0;
  let kept = 0;
  let invalid = 0;
  for (let i = 0; i < guest.length; i += IMPORT_BATCH) {
    const batch = guest.slice(i, i + IMPORT_BATCH);
    const result = await api('POST', '/api/favorites/import', { favorites: batch });
    imported += result.imported;
    batch.forEach((item, index) => {
      if (result.rejected.includes(index)) {
        kept++;
        return;
      }
      if (result.invalid.includes(index)) invalid++;
      handled.add(identity(item));
    });
  }

  const remaining = readGuestFavorites().filter((item) => !handled.has(identity(item)));
  if (remaining.length > 0) writeGuestFavorites(remaining);
  else localStorage.removeItem(GUEST_FAV_KEY);

  if (imported > 0) showToast(`Đã chuyển ${imported} địa điểm yêu thích vào tài khoản.`);
  if (kept > 0) {
    showToast(`${kept} địa điểm chưa chuyển được vì tài khoản đã đủ số lượng tối đa, vẫn giữ trên trình duyệt.`, true);
  }
  if (invalid > 0) showToast(`Đã bỏ ${invalid} địa điểm có dữ liệu lỗi.`, true);
}

onAuthChange(async (user) => {
  if (user) {
    try {
      await importGuestFavorites();
    } catch (error) {
      console.error(error);
      showToast('Chưa chuyển được yêu thích trên trình duyệt vào tài khoản.', true);
    }
  }
  await loadFavorites();
});

// HTML nút yêu thích, chèn vào cuối nội dung popup
function favButtonHtml(name, address, lat, lon) {
  const saved = Boolean(findFavorite(lat, lon, name));
  return (
    '<div class="mt-2">' +
    `<button type="button" class="btn btn-sm fav-btn ${saved ? 'btn-danger' : 'btn-outline-danger'}" ` +
    `data-name="${encodeURIComponent(name)}" ` +
    `data-address="${encodeURIComponent(address)}" ` +
    `data-lat="${lat}" data-lon="${lon}">` +
    (saved ? '❤️ Đã lưu (bấm để bỏ)' : '🤍 Lưu yêu thích') +
    '</button></div>'
  );
}

function showFavButtonState(btn, saved) {
  btn.className = `btn btn-sm fav-btn ${saved ? 'btn-danger' : 'btn-outline-danger'}`;
  btn.textContent = saved ? '❤️ Đã lưu (bấm để bỏ)' : '🤍 Lưu yêu thích';
}

function toggleGuestFavorite(btn, lat, lon, name, existing) {
  const next = existing
    ? favorites.filter((f) => f.id !== existing.id)
    : [
        {
          id: makeFavKey(lat, lon, name),
          name: cleanName(name),
          address: cleanAddress(decodeURIComponent(btn.dataset.address)),
          lat,
          lon
        },
        ...favorites
      ];
  if (!writeGuestFavorites(next)) return;
  favorites = next;
  showFavButtonState(btn, !existing);
  renderFavorites();
}

// Bấm nút trong popup: thêm hoặc bỏ yêu thích
async function toggleFavorite(btn) {
  const lat = parseFloat(btn.dataset.lat);
  const lon = parseFloat(btn.dataset.lon);
  const name = decodeURIComponent(btn.dataset.name);
  const existing = findFavorite(lat, lon, name);

  if (!currentUser) {
    toggleGuestFavorite(btn, lat, lon, name, existing);
    return;
  }

  btn.disabled = true;
  try {
    if (existing) {
      await api('DELETE', `/api/favorites/${existing.id}`);
      favorites = favorites.filter((f) => f.id !== existing.id);
    } else {
      const { favorite } = await api('POST', '/api/favorites', {
        name: cleanName(name),
        address: cleanAddress(decodeURIComponent(btn.dataset.address)),
        lat,
        lon
      });
      favorites = [favorite, ...favorites];
    }
    showFavButtonState(btn, !existing);
    renderFavorites();
  } catch (error) {
    handleFavoriteError(error);
  } finally {
    btn.disabled = false;
  }
}

async function removeFavorite(id) {
  if (!currentUser) {
    const next = favorites.filter((f) => f.id !== id);
    if (writeGuestFavorites(next)) favorites = next;
    renderFavorites();
    return;
  }
  try {
    await api('DELETE', `/api/favorites/${id}`);
    favorites = favorites.filter((f) => f.id !== id);
    renderFavorites();
  } catch (error) {
    handleFavoriteError(error);
  }
}

// Khách thấy lời mời đăng nhập ở đầu danh sách
function renderGuestPrompt() {
  const li = document.createElement('li');
  li.className = 'list-group-item small text-muted';
  li.innerHTML =
    'Đang lưu trên trình duyệt này. ' +
    '<button type="button" class="btn btn-link btn-sm p-0 align-baseline fav-login-btn">Đăng nhập</button>' +
    ' để lưu vào tài khoản và dùng trên mọi thiết bị.';
  li.querySelector('.fav-login-btn').addEventListener('click', () => openAuthDialog());
  favListEl.appendChild(li);
}

// Vẽ lại danh sách ở thanh bên + chấm đỏ trên bản đồ
function renderFavorites() {
  favLayer.clearLayers();
  favListEl.innerHTML = '';
  favCountEl.textContent = favorites.length;

  if (!currentUser) renderGuestPrompt();

  if (favorites.length === 0) {
    favListEl.insertAdjacentHTML(
      'beforeend',
      '<li class="list-group-item text-muted">Chưa có địa điểm yêu thích</li>'
    );
    return;
  }

  favorites.forEach((fav) => {
    // Chấm đỏ trên bản đồ
    const marker = L.circleMarker([fav.lat, fav.lon], {
      radius: 9,
      color: '#fff',
      weight: 2,
      fillColor: '#dc3545',
      fillOpacity: 1,
      bubblingMouseEvents: false
    }).addTo(favLayer);
    marker.bindPopup(
      () =>
        `<b>${escapeHtml(fav.name)}</b><br>${escapeHtml(fav.address)}` +
        favButtonHtml(fav.name, fav.address, fav.lat, fav.lon)
    );

    // Mục trong danh sách
    const li = document.createElement('li');
    li.className =
      'list-group-item d-flex justify-content-between align-items-start gap-2';
    li.innerHTML =
      '<div class="fav-info flex-grow-1">' +
      `<div class="fw-bold">${escapeHtml(fav.name)}</div>` +
      `<small class="text-muted">${escapeHtml(fav.address)}</small></div>` +
      '<button type="button" class="btn btn-sm btn-outline-secondary fav-remove" title="Xóa" aria-label="Xóa địa điểm">✕</button>';

    li.querySelector('.fav-info').addEventListener('click', () => {
      map.flyTo([fav.lat, fav.lon], 17);
      marker.openPopup();
    });
    li.querySelector('.fav-remove').addEventListener('click', () => {
      removeFavorite(fav.id);
    });

    favListEl.appendChild(li);
  });
}

// Popup của Leaflet chặn click nổi lên ngoài, nên gắn sự kiện ngay trên popup
map.on('popupopen', (e) => {
  const el = e.popup.getElement();
  if (!el || el._favBound) return;
  el._favBound = true;
  el.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.fav-btn');
    if (btn) toggleFavorite(btn);
  });
});

initAuth();

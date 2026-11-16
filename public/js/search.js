// ====== Tìm kiếm địa điểm bằng Nominatim ======
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const clearBtn = document.getElementById('clear-btn');
const resultsList = document.getElementById('results-list');
const quickFilters = document.getElementById('quick-filters');

// Lớp chứa các marker kết quả
const markersLayer = L.layerGroup().addTo(map);

// Tăng mỗi lần tìm: chỉ kết quả của lần tìm mới nhất được hiển thị
let searchRequestId = 0;

function showMessage(text, cssClass = 'text-muted') {
  resultsList.innerHTML = `<li class="list-group-item ${cssClass}">${escapeHtml(text)}</li>`;
}

// Biểu tượng theo loại địa điểm
function emojiFor(place) {
  const t = place.type;
  if (['school', 'university', 'college', 'kindergarten'].includes(t)) return '🏫';
  if (['hospital', 'clinic', 'doctors', 'pharmacy', 'dentist'].includes(t)) return '🏥';
  if (['restaurant', 'cafe', 'fast_food', 'food_court', 'bar'].includes(t)) return '🍜';
  if (['bank', 'atm'].includes(t)) return '🏦';
  return '📍';
}

// Nút ✕ chỉ hiện khi ô tìm kiếm có chữ
function updateClearBtn() {
  clearBtn.classList.toggle('d-none', !searchInput.value);
}
searchInput.addEventListener('input', updateClearBtn);

clearBtn.addEventListener('click', () => {
  searchRequestId++;
  searchInput.value = '';
  updateClearBtn();
  markersLayer.clearLayers();
  showMessage('Nhập từ khóa hoặc chọn một loại địa điểm để bắt đầu.');
  searchInput.focus();
});

function searchPlaces(query, onlyInView, isStale) {
  const b = map.getBounds();
  const params = {
    q: query,
    addressdetails: '1',
    limit: '10',
    countrycodes: 'vn',
    viewbox: [b.getWest(), b.getNorth(), b.getEast(), b.getSouth()].join(',')
  };
  if (onlyInView) params.bounded = '1';
  return nominatimFetch('search', params, isStale);
}

// Hiển thị kết quả lên bản đồ + danh sách
function renderResults(places) {
  markersLayer.clearLayers();
  resultsList.innerHTML = '';
  showTab('results');
  openPanel();

  if (places.length === 0) {
    showMessage('Không tìm thấy địa điểm phù hợp.');
    return;
  }

  const bounds = [];

  places.forEach((place) => {
    const lat = parseFloat(place.lat);
    const lon = parseFloat(place.lon);
    const name = place.name || place.display_name.split(',')[0];

    // Ghim đỏ + popup
    const marker = L.marker([lat, lon], { icon: redPin }).addTo(markersLayer);
    marker.bindPopup(
      () =>
        `<b>${escapeHtml(name)}</b><br>${escapeHtml(place.display_name)}` +
        favButtonHtml(name, place.display_name, lat, lon)
    );
    bounds.push([lat, lon]);

    // Thẻ kết quả
    const li = document.createElement('li');
    li.className =
      'list-group-item list-group-item-action result-item d-flex gap-3 align-items-start';
    li.innerHTML =
      `<div class="result-icon">${emojiFor(place)}</div>` +
      '<div class="result-text">' +
      `<div class="fw-bold">${escapeHtml(name)}</div>` +
      `<small class="text-muted">${escapeHtml(place.display_name)}</small></div>`;

    li.addEventListener('click', () => {
      map.flyTo([lat, lon], 17);
      marker.openPopup();
    });

    resultsList.appendChild(li);
  });

  if (bounds.length === 1) {
    map.setView(bounds[0], 17);
  } else {
    map.fitBounds(bounds, { padding: [60, 60] });
  }
}

async function handleSearch(query, onlyInView = false) {
  query = query.trim();
  if (!query) {
    openPanel();
    showMessage('Vui lòng nhập từ khóa tìm kiếm.');
    return;
  }

  const requestId = ++searchRequestId;
  const isStale = () => requestId !== searchRequestId;

  showTab('results');
  openPanel();
  showMessage('Đang tìm kiếm...');
  try {
    const places = await searchPlaces(query, onlyInView, isStale);
    if (places && !isStale()) renderResults(places);
  } catch (error) {
    console.error(error);
    if (!isStale()) showMessage('Có lỗi khi tìm kiếm. Vui lòng thử lại.', 'text-danger');
  }
}

searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  handleSearch(searchInput.value);
});

quickFilters.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-type]');
  if (!btn) return;
  const type = btn.dataset.type;
  searchInput.value = type;
  updateClearBtn();
  handleSearch(type, true);
});

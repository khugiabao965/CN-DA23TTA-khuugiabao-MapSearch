// ====== Trang quản trị ======
// Trang chỉ là giao diện; quyền truy cập thật được kiểm tra ở API /api/admin.
let me = null;
const state = {
  users: { page: 1, search: '' },
  favorites: { page: 1, search: '' }
};

const formatDate = (ms) => (ms ? new Date(ms).toLocaleDateString('vi-VN') : '—');

// ---------- Hộp thoại xác nhận ----------
const confirmDialog = document.getElementById('confirm-dialog');
let confirmAction = null;

function askConfirm(message, action) {
  document.getElementById('confirm-message').textContent = message;
  confirmAction = action;
  confirmDialog.showModal();
}

document.getElementById('confirm-ok').addEventListener('click', () => {
  confirmDialog.close();
  run(confirmAction);
});

// Chạy một thao tác rồi tải lại dữ liệu; phiên hết quyền thì quay về bản đồ
async function run(action) {
  try {
    await action();
    await refresh();
  } catch (error) {
    handleError(error);
  }
}

// Chuyển trang hay tìm kiếm chỉ cần tải lại đúng danh sách đó, không làm mới cả trang
function reload(load) {
  load().catch(handleError);
}

function handleError(error) {
  if (error.status === 401 || error.status === 403) {
    window.location.replace('/');
    return;
  }
  showToast(error.message, true);
}

// ---------- Thống kê ----------
async function loadStats() {
  const stats = await api('GET', '/api/admin/stats');
  document.getElementById('stat-users').textContent = stats.users;
  document.getElementById('stat-new').textContent = stats.newUsers7d;
  document.getElementById('stat-admins').textContent = stats.admins;
  document.getElementById('stat-locked').textContent = stats.locked;
  document.getElementById('stat-favorites').textContent = stats.favorites;

  document.getElementById('top-places').innerHTML = stats.topPlaces.length
    ? stats.topPlaces
        .map(
          (p) =>
            `<li>${escapeHtml(p.name)} <span class="text-muted">(${p.saves} lượt lưu)</span>` +
            `<br><span class="text-muted">${escapeHtml(p.address)}</span></li>`
        )
        .join('')
    : '<li class="text-muted">Chưa có dữ liệu</li>';
}

// Mỗi danh sách chỉ nhận phản hồi của lần tải mới nhất, tránh kết quả tìm cũ đến muộn ghi đè
const latestRequest = { users: 0, favorites: 0 };

// Trang hiện tại vượt quá số trang (vd. vừa xóa mục cuối của trang cuối) thì lùi về trang cuối
function clampPage(key, data) {
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  if (data.page <= pages) return false;
  state[key].page = pages;
  return true;
}

// ---------- Phân trang ----------
function renderPager(elementId, data, onChange) {
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const pager = document.getElementById(elementId);
  pager.innerHTML =
    `<button type="button" class="btn btn-outline-secondary btn-sm" data-page="${data.page - 1}" ${data.page <= 1 ? 'disabled' : ''}>Trước</button>` +
    `<span class="small text-muted">Trang ${data.page}/${pages}</span>` +
    `<button type="button" class="btn btn-outline-secondary btn-sm" data-page="${data.page + 1}" ${data.page >= pages ? 'disabled' : ''}>Sau</button>`;
  pager.querySelectorAll('button[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => onChange(Number(btn.dataset.page)));
  });
}

// ---------- Người dùng ----------
function userActions(user) {
  if (user.id === me.id) return '<span class="text-muted small">Tài khoản của bạn</span>';
  return (
    '<div class="d-flex flex-wrap gap-1">' +
    `<button type="button" class="btn btn-outline-secondary btn-sm" data-action="role">${user.role === 'admin' ? 'Hạ quyền' : 'Cấp admin'}</button>` +
    `<button type="button" class="btn btn-outline-warning btn-sm" data-action="lock">${user.isLocked ? 'Mở khóa' : 'Khóa'}</button>` +
    '<button type="button" class="btn btn-outline-secondary btn-sm" data-action="reset">Đặt lại mật khẩu</button>' +
    '<button type="button" class="btn btn-outline-danger btn-sm" data-action="delete">Xóa</button>' +
    '</div>'
  );
}

let shownUsers = [];

async function loadUsers() {
  const requestId = ++latestRequest.users;
  const { page, search } = state.users;
  const query = new URLSearchParams({ page, search });
  const data = await api('GET', `/api/admin/users?${query}`);
  if (requestId !== latestRequest.users) return;
  if (clampPage('users', data)) return loadUsers();
  shownUsers = data.users;

  document.getElementById('users-total').textContent = data.total;
  document.getElementById('users-body').innerHTML = data.users.length
    ? data.users
        .map(
          (u) =>
            `<tr data-id="${u.id}">` +
            `<td class="fw-medium">${escapeHtml(u.username)}</td>` +
            `<td><span class="badge ${u.role === 'admin' ? 'text-bg-primary' : 'text-bg-secondary'}">${u.role === 'admin' ? 'Admin' : 'Người dùng'}</span></td>` +
            `<td>${u.isLocked ? '<span class="badge text-bg-danger">Đã khóa</span>' : '<span class="badge text-bg-success">Hoạt động</span>'}</td>` +
            `<td>${u.favoriteCount}</td>` +
            `<td>${formatDate(u.createdAt)}</td>` +
            `<td>${formatDate(u.lastLoginAt)}</td>` +
            `<td>${userActions(u)}</td>` +
            '</tr>'
        )
        .join('')
    : '<tr><td colspan="7" class="text-muted">Không có người dùng phù hợp.</td></tr>';

  renderPager('users-pager', data, (nextPage) => {
    state.users.page = nextPage;
    reload(loadUsers);
  });
}

document.getElementById('users-body').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const user = shownUsers.find((u) => u.id === Number(btn.closest('tr').dataset.id));
  if (!user) return;
  const url = `/api/admin/users/${user.id}`;

  if (btn.dataset.action === 'role') {
    const role = user.role === 'admin' ? 'user' : 'admin';
    const label = role === 'admin' ? 'Cấp quyền admin cho' : 'Hạ quyền admin của';
    askConfirm(`${label} ${user.username}?`, () => api('PATCH', url, { role }));
  } else if (btn.dataset.action === 'lock') {
    run(() => api('PATCH', url, { isLocked: !user.isLocked }));
  } else if (btn.dataset.action === 'reset') {
    openResetDialog(user);
  } else if (btn.dataset.action === 'delete') {
    askConfirm(`Xóa ${user.username} và toàn bộ địa điểm yêu thích của tài khoản này?`, () =>
      api('DELETE', url)
    );
  }
});

// ---------- Đặt lại mật khẩu ----------
const resetDialog = document.getElementById('reset-dialog');
const resetForm = document.getElementById('reset-form');
const resetError = document.getElementById('reset-error');
let resetTarget = null;

function openResetDialog(user) {
  resetTarget = user;
  resetForm.reset();
  resetError.classList.add('d-none');
  document.getElementById('reset-title').textContent = `Đặt lại mật khẩu cho ${user.username}`;
  resetDialog.showModal();
}

resetForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('POST', `/api/admin/users/${resetTarget.id}/password`, {
      password: document.getElementById('reset-password').value
    });
    resetDialog.close();
    showToast('Đã đặt lại mật khẩu.');
  } catch (error) {
    resetError.textContent = error.message;
    resetError.classList.remove('d-none');
  }
});

// ---------- Yêu thích của người dùng ----------
let shownFavorites = [];

async function loadAdminFavorites() {
  const requestId = ++latestRequest.favorites;
  const { page, search } = state.favorites;
  const query = new URLSearchParams({ page, search });
  const data = await api('GET', `/api/admin/favorites?${query}`);
  if (requestId !== latestRequest.favorites) return;
  if (clampPage('favorites', data)) return loadAdminFavorites();
  shownFavorites = data.favorites;

  document.getElementById('favorites-total').textContent = data.total;
  document.getElementById('favorites-body').innerHTML = data.favorites.length
    ? data.favorites
        .map(
          (f) =>
            `<tr data-id="${f.id}">` +
            `<td class="fw-medium">${escapeHtml(f.name)}</td>` +
            `<td class="small text-muted">${escapeHtml(f.address)}</td>` +
            `<td>${escapeHtml(f.username)}</td>` +
            `<td>${formatDate(f.createdAt)}</td>` +
            '<td><button type="button" class="btn btn-outline-danger btn-sm" data-action="delete">Xóa</button></td>' +
            '</tr>'
        )
        .join('')
    : '<tr><td colspan="5" class="text-muted">Không có địa điểm phù hợp.</td></tr>';

  renderPager('favorites-pager', data, (nextPage) => {
    state.favorites.page = nextPage;
    reload(loadAdminFavorites);
  });
}

document.getElementById('favorites-body').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action="delete"]');
  if (!btn) return;
  const favorite = shownFavorites.find((f) => f.id === Number(btn.closest('tr').dataset.id));
  if (!favorite) return;
  askConfirm(`Xóa "${favorite.name}" của ${favorite.username}?`, () =>
    api('DELETE', `/api/admin/favorites/${favorite.id}`)
  );
});

// ---------- Tìm kiếm (chờ người dùng ngừng gõ) ----------
function bindSearch(inputId, key, load) {
  let timer = null;
  document.getElementById(inputId).addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state[key] = { page: 1, search: e.target.value.trim() };
      reload(load);
    }, 300);
  });
}
bindSearch('users-search', 'users', loadUsers);
bindSearch('favorites-search', 'favorites', loadAdminFavorites);

// ---------- Khởi động ----------
async function refresh() {
  await Promise.all([loadStats(), loadUsers(), loadAdminFavorites()]);
}

async function initAdmin() {
  try {
    const { user } = await api('GET', '/api/auth/me');
    if (!user || user.role !== 'admin') {
      window.location.replace('/');
      return;
    }
    me = user;
    document.getElementById('admin-name').textContent = user.username;
    await refresh();
    document.getElementById('admin-main').classList.remove('d-none');
  } catch (error) {
    handleError(error);
  }
}

initAdmin();

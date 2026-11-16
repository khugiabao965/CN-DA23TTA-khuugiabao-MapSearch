// ====== Tiện ích dùng chung cho trang bản đồ và trang quản trị ======

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Gọi API của máy chủ; lỗi được ném ra kèm thông báo và mã trạng thái
async function api(method, url, body) {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (e) {
    // Phản hồi không phải JSON được xử lý như lỗi chung ở dưới
  }
  if (!response.ok) {
    const error = new Error((data && data.error) || 'Không kết nối được máy chủ.');
    error.status = response.status;
    throw error;
  }
  return data;
}

// Thông báo ngắn, thay cho alert để không chặn thao tác trên bản đồ
function showToast(message, isError = false) {
  const toast = document.createElement('div');
  toast.className = isError ? 'gm-toast gm-toast-error' : 'gm-toast';
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// Nút có data-close-dialog đóng hộp thoại chứa nó
document.addEventListener('click', (e) => {
  const closeBtn = e.target.closest('[data-close-dialog]');
  if (closeBtn) closeBtn.closest('dialog').close();
});

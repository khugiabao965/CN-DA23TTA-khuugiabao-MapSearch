// ====== Đăng nhập, đăng ký và tài khoản ======
let currentUser = null;
const authListeners = [];

const accountBtn = document.getElementById('account-btn');
const accountLabel = document.getElementById('account-label');
const authDialog = document.getElementById('auth-dialog');
const authForm = document.getElementById('auth-form');
const authTitle = document.getElementById('auth-title');
const authHint = document.getElementById('auth-hint');
const authUsername = document.getElementById('auth-username');
const authPassword = document.getElementById('auth-password');
const authPasswordHelp = document.getElementById('auth-password-help');
const authError = document.getElementById('auth-error');
const authSubmit = document.getElementById('auth-submit');
const authSwitch = document.getElementById('auth-switch');
const accountDialog = document.getElementById('account-dialog');
const passwordForm = document.getElementById('password-form');
const passwordError = document.getElementById('password-error');

let authMode = 'login';

function onAuthChange(listener) {
  authListeners.push(listener);
}

function setCurrentUser(user) {
  currentUser = user;
  accountLabel.textContent = user ? user.username : 'Đăng nhập';
  authListeners.forEach((listener) => listener(user));
}

function showFormError(element, message) {
  element.textContent = message;
  element.classList.toggle('d-none', !message);
}

function setAuthMode(mode) {
  authMode = mode;
  const isLogin = mode === 'login';
  authTitle.textContent = isLogin ? 'Đăng nhập' : 'Đăng ký tài khoản';
  authSubmit.textContent = isLogin ? 'Đăng nhập' : 'Đăng ký';
  authSwitch.textContent = isLogin ? 'Chưa có tài khoản? Đăng ký' : 'Đã có tài khoản? Đăng nhập';
  authPassword.autocomplete = isLogin ? 'current-password' : 'new-password';
  authPasswordHelp.classList.toggle('d-none', isLogin);
  showFormError(authError, '');
}

function openAuthDialog(hint = '') {
  authForm.reset();
  setAuthMode('login');
  authHint.textContent = hint;
  authHint.classList.toggle('d-none', !hint);
  authDialog.showModal();
}

accountBtn.addEventListener('click', () => {
  if (!currentUser) {
    openAuthDialog();
    return;
  }
  document.getElementById('account-title').textContent = currentUser.username;
  document.getElementById('account-role').textContent =
    currentUser.role === 'admin' ? 'Quản trị viên' : 'Người dùng';
  document.getElementById('admin-link').classList.toggle('d-none', currentUser.role !== 'admin');
  passwordForm.reset();
  showFormError(passwordError, '');
  accountDialog.showModal();
});

authSwitch.addEventListener('click', () => {
  setAuthMode(authMode === 'login' ? 'register' : 'login');
});

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authSubmit.disabled = true;
  showFormError(authError, '');
  try {
    const { user } = await api('POST', `/api/auth/${authMode}`, {
      username: authUsername.value.trim(),
      password: authPassword.value
    });
    authDialog.close();
    setCurrentUser(user);
    showToast(`Xin chào ${user.username}!`);
  } catch (error) {
    showFormError(authError, error.message);
  } finally {
    authSubmit.disabled = false;
  }
});

passwordForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  showFormError(passwordError, '');
  try {
    await api('POST', '/api/auth/password', {
      currentPassword: document.getElementById('current-password').value,
      newPassword: document.getElementById('new-password').value
    });
    passwordForm.reset();
    showToast('Đã đổi mật khẩu.');
  } catch (error) {
    showFormError(passwordError, error.message);
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  try {
    await api('POST', '/api/auth/logout');
    accountDialog.close();
    setCurrentUser(null);
    showToast('Đã đăng xuất.');
  } catch (error) {
    showToast(error.message, true);
  }
});

// Gọi một lần sau khi mọi file đã đăng ký onAuthChange
async function initAuth() {
  try {
    const { user } = await api('GET', '/api/auth/me');
    setCurrentUser(user);
  } catch (error) {
    console.error(error);
    setCurrentUser(null);
    showToast('Không kết nối được máy chủ.', true);
  }
}

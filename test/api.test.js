import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { hashPassword } from '../server/auth.js';
import { createApp } from '../server/app.js';
import { openDatabase } from '../server/db.js';

const PASSWORD = 'mat-khau-123';
const PLACE = { name: 'Chợ Vĩnh Long', address: 'Vĩnh Long, Việt Nam', lat: 10.2537, lon: 105.9722 };

let db;
let server;
let baseUrl;

// Mỗi client giữ cookie riêng, giống một trình duyệt
function client() {
  let cookie = '';
  return async (method, url, body, headers = {}) => {
    const response = await fetch(baseUrl + url, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const setCookie = response.headers.getSetCookie()[0];
    if (setCookie) cookie = setCookie.split(';')[0];
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers };
  };
}

async function signUp(username) {
  const api = client();
  const result = await api('POST', '/api/auth/register', { username, password: PASSWORD });
  assert.equal(result.status, 201);
  return { api, id: result.body.user.id };
}

async function signInAdmin(username = 'quantri') {
  const passwordHash = await hashPassword(PASSWORD);
  db.prepare("INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, 'admin', 1)")
    .run(username, passwordHash);
  const api = client();
  const result = await api('POST', '/api/auth/login', { username, password: PASSWORD });
  assert.equal(result.status, 200);
  return { api, id: result.body.user.id };
}

// Ứng dụng phụ với cấu hình riêng; t.after luôn đóng nó kể cả khi test thất bại,
// nếu không tiến trình test sẽ treo vì server còn mở
async function startExtraApp(t, options) {
  const extraDb = openDatabase(':memory:');
  const server = createApp({ db: extraDb, ...options }).listen(0, '127.0.0.1');
  t.after(() => {
    server.closeAllConnections();
    server.close();
    extraDb.close();
  });
  await new Promise((resolve) => server.once('listening', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

before(async () => {
  db = openDatabase(':memory:');
  server = createApp({ db, loginLimit: 1000, registerLimit: 1000 }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.closeAllConnections();
  server.close();
  db.close();
});

beforeEach(() => {
  db.exec('DELETE FROM favorites; DELETE FROM sessions; DELETE FROM users;');
});

describe('xác thực', () => {
  it('đăng ký tạo tài khoản user và đăng nhập luôn, không lộ mật khẩu', async () => {
    const api = client();
    const registered = await api('POST', '/api/auth/register', { username: 'an.nguyen', password: PASSWORD });
    assert.equal(registered.status, 201);
    assert.equal(registered.body.user.role, 'user');
    assert.equal(registered.body.user.password_hash, undefined);

    const stored = db.prepare('SELECT password_hash FROM users').get().password_hash;
    assert.ok(!stored.includes(PASSWORD));

    const me = await api('GET', '/api/auth/me');
    assert.equal(me.body.user.username, 'an.nguyen');
  });

  it('không cho client tự chọn vai trò khi đăng ký', async () => {
    const api = client();
    const result = await api('POST', '/api/auth/register', { username: 'hacker', password: PASSWORD, role: 'admin' });
    assert.equal(result.body.user.role, 'user');
  });

  it('từ chối tên đăng nhập trùng, không phân biệt hoa thường', async () => {
    await signUp('binh');
    const api = client();
    const result = await api('POST', '/api/auth/register', { username: 'BINH', password: PASSWORD });
    assert.equal(result.status, 409);
  });

  it('từ chối mật khẩu ngắn', async () => {
    const result = await client()('POST', '/api/auth/register', { username: 'chi', password: '1234567' });
    assert.equal(result.status, 400);
  });

  it('báo cùng một lỗi cho sai mật khẩu và sai tên đăng nhập', async () => {
    await signUp('dung');
    const wrongPassword = await client()('POST', '/api/auth/login', { username: 'dung', password: 'sai-mat-khau' });
    const noUser = await client()('POST', '/api/auth/login', { username: 'khongco', password: 'sai-mat-khau' });
    assert.equal(wrongPassword.status, 401);
    assert.deepEqual(wrongPassword.body, noUser.body);
  });

  it('cookie phiên có HttpOnly và SameSite, CSDL chỉ lưu bản băm', async () => {
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'cookie.test', password: PASSWORD })
    });
    const cookie = response.headers.getSetCookie()[0];
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);

    const token = cookie.split(';')[0].split('=')[1];
    assert.ok(!db.prepare('SELECT token_hash FROM sessions').get().token_hash.includes(token));
  });

  it('đăng xuất làm mất hiệu lực phiên', async () => {
    const { api } = await signUp('em.le');
    assert.equal((await api('POST', '/api/auth/logout')).status, 204);
    assert.equal((await api('GET', '/api/auth/me')).body.user, null);
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM sessions').get().total, 0);
  });

  it('phiên hết hạn không còn dùng được', async () => {
    const { api } = await signUp('hethan');
    db.prepare('UPDATE sessions SET expires_at = 1').run();
    assert.equal((await api('GET', '/api/favorites')).status, 401);
  });

  it('đổi mật khẩu yêu cầu mật khẩu cũ và đăng xuất thiết bị khác', async () => {
    const { api } = await signUp('giang');
    const other = client();
    await other('POST', '/api/auth/login', { username: 'giang', password: PASSWORD });

    const wrong = await api('POST', '/api/auth/password', { currentPassword: 'sai-mat-khau', newPassword: 'mat-khau-moi' });
    assert.equal(wrong.status, 401);

    const changed = await api('POST', '/api/auth/password', { currentPassword: PASSWORD, newPassword: 'mat-khau-moi' });
    assert.equal(changed.status, 204);
    assert.equal((await api('GET', '/api/auth/me')).body.user.username, 'giang');
    assert.equal((await other('GET', '/api/auth/me')).body.user, null);
  });

  it('giới hạn số lần đăng nhập sai', async (t) => {
    const base = await startExtraApp(t, { loginLimit: 2 });
    const attempt = () => fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'ai.do', password: 'sai-mat-khau' })
    });

    assert.equal((await attempt()).status, 401);
    assert.equal((await attempt()).status, 401);
    assert.equal((await attempt()).status, 429);
  });
});

describe('bảo vệ yêu cầu', () => {
  it('chặn yêu cầu ghi từ trang khác nguồn nhưng cho phép cùng nguồn', async () => {
    const { api } = await signUp('hoa');
    const foreign = await api('POST', '/api/favorites', PLACE, { Origin: 'https://evil.example' });
    assert.equal(foreign.status, 403);

    const same = await api('POST', '/api/favorites', PLACE, { Origin: baseUrl });
    assert.equal(same.status, 201);
  });

  it('trả JSON khi body sai định dạng và khi API không tồn tại', async () => {
    const malformed = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{sai'
    });
    assert.equal(malformed.status, 400);
    assert.ok((await malformed.json()).error);
    assert.equal((await client()('GET', '/api/khong-co')).status, 404);
  });

  it('CSP và Referrer-Policy cho phép bản đồ hoạt động', async () => {
    const response = await fetch(`${baseUrl}/index.html`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    const csp = response.headers.get('content-security-policy');
    assert.match(csp, /tile\.openstreetmap\.org/);
    assert.match(csp, /nominatim\.openstreetmap\.org/);
  });

  it('không phục vụ mã nguồn server hay CSDL qua static', async () => {
    assert.equal((await fetch(`${baseUrl}/package.json`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/server/app.js`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/data/ban-do.db`)).status, 404);
  });
});

describe('yêu thích', () => {
  it('yêu cầu đăng nhập', async () => {
    assert.equal((await client()('GET', '/api/favorites')).status, 401);
    assert.equal((await client()('POST', '/api/favorites', PLACE)).status, 401);
  });

  it('lưu, liệt kê và xóa', async () => {
    const { api } = await signUp('khanh');
    const saved = await api('POST', '/api/favorites', PLACE);
    assert.equal(saved.status, 201);

    const list = await api('GET', '/api/favorites');
    assert.equal(list.body.favorites.length, 1);
    assert.equal(list.body.favorites[0].name, PLACE.name);

    assert.equal((await api('DELETE', `/api/favorites/${saved.body.favorite.id}`)).status, 204);
    assert.equal((await api('GET', '/api/favorites')).body.favorites.length, 0);
  });

  it('lưu trùng địa điểm không tạo bản ghi mới', async () => {
    const { api } = await signUp('lan');
    const first = await api('POST', '/api/favorites', PLACE);
    const second = await api('POST', '/api/favorites', PLACE);
    assert.equal(second.status, 200);
    assert.equal(second.body.favorite.id, first.body.favorite.id);
  });

  it('người dùng không xem hay xóa được yêu thích của người khác', async () => {
    const owner = await signUp('minh');
    const other = await signUp('nam');
    const saved = await owner.api('POST', '/api/favorites', PLACE);

    assert.equal((await other.api('GET', '/api/favorites')).body.favorites.length, 0);
    assert.equal((await other.api('DELETE', `/api/favorites/${saved.body.favorite.id}`)).status, 404);
    assert.equal((await owner.api('GET', '/api/favorites')).body.favorites.length, 1);

    const sameSpot = await other.api('POST', '/api/favorites', PLACE);
    assert.equal(sameSpot.status, 201);
  });

  it('từ chối dữ liệu sai', async () => {
    const { api } = await signUp('oanh');
    for (const bad of [
      { ...PLACE, lat: 91 },
      { ...PLACE, lon: '105' },
      { ...PLACE, name: '   ' },
      { ...PLACE, name: 'x'.repeat(201) },
      { name: 'Thiếu tọa độ' }
    ]) {
      assert.equal((await api('POST', '/api/favorites', bad)).status, 400);
    }
  });

  it('nhập dữ liệu localStorage cũ, bỏ qua mục lỗi và mục trùng', async () => {
    const { api } = await signUp('phuc');
    await api('POST', '/api/favorites', PLACE);

    const result = await api('POST', '/api/favorites/import', {
      favorites: [PLACE, { ...PLACE, lat: 10.3 }, { name: 'lỗi' }]
    });
    assert.equal(result.body.imported, 1);
    assert.equal((await api('GET', '/api/favorites')).body.favorites.length, 2);
  });
});

describe('quản trị', () => {
  it('chặn khách và người dùng thường khỏi mọi API quản trị', async () => {
    const { api } = await signUp('quang');
    for (const [method, url] of [
      ['GET', '/api/admin/stats'],
      ['GET', '/api/admin/users'],
      ['GET', '/api/admin/favorites'],
      ['PATCH', '/api/admin/users/1'],
      ['DELETE', '/api/admin/users/1'],
      ['DELETE', '/api/admin/favorites/1']
    ]) {
      assert.equal((await api(method, url, method === 'PATCH' ? { role: 'admin' } : undefined)).status, 403);
      assert.equal((await client()(method, url)).status, 401);
    }
  });

  it('thống kê và tìm kiếm người dùng, ký tự % được hiểu theo nghĩa đen', async () => {
    const admin = await signInAdmin();
    const user = await signUp('son.tran');
    await user.api('POST', '/api/favorites', PLACE);
    await signUp('thu');

    const stats = await admin.api('GET', '/api/admin/stats');
    assert.equal(stats.body.users, 3);
    assert.equal(stats.body.admins, 1);
    assert.equal(stats.body.favorites, 1);
    assert.equal(stats.body.topPlaces[0].saves, 1);

    const found = await admin.api('GET', '/api/admin/users?search=son');
    assert.equal(found.body.total, 1);
    assert.equal(found.body.users[0].favoriteCount, 1);
    assert.equal(found.body.users[0].password_hash, undefined);

    const literal = await admin.api('GET', `/api/admin/users?search=${encodeURIComponent('%')}`);
    assert.equal(literal.body.total, 0);
  });

  it('phân trang danh sách người dùng', async () => {
    const admin = await signInAdmin();
    const insert = db.prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?, 'x', ?)");
    for (let i = 0; i < 25; i++) insert.run(`nguoi.dung.${i}`, i + 2);

    const first = await admin.api('GET', '/api/admin/users?page=1');
    const second = await admin.api('GET', '/api/admin/users?page=2');
    assert.equal(first.body.total, 26);
    assert.equal(first.body.users.length, 20);
    assert.equal(second.body.users.length, 6);
    assert.equal(new Set([...first.body.users, ...second.body.users].map((u) => u.id)).size, 26);
  });

  it('khóa tài khoản có hiệu lực ngay và chặn đăng nhập, mở khóa khôi phục', async () => {
    const admin = await signInAdmin();
    const user = await signUp('uyen');

    assert.equal((await admin.api('PATCH', `/api/admin/users/${user.id}`, { isLocked: true })).status, 204);
    assert.equal((await user.api('GET', '/api/auth/me')).body.user, null);
    const locked = await client()('POST', '/api/auth/login', { username: 'uyen', password: PASSWORD });
    assert.equal(locked.status, 403);

    await admin.api('PATCH', `/api/admin/users/${user.id}`, { isLocked: false });
    const unlocked = await client()('POST', '/api/auth/login', { username: 'uyen', password: PASSWORD });
    assert.equal(unlocked.status, 200);
  });

  it('đổi vai trò có hiệu lực ngay trên phiên đang mở', async () => {
    const admin = await signInAdmin();
    const user = await signUp('vy.ha');
    assert.equal((await user.api('GET', '/api/admin/stats')).status, 403);

    await admin.api('PATCH', `/api/admin/users/${user.id}`, { role: 'admin' });
    assert.equal((await user.api('GET', '/api/admin/stats')).status, 200);

    await admin.api('PATCH', `/api/admin/users/${user.id}`, { role: 'user' });
    assert.equal((await user.api('GET', '/api/admin/stats')).status, 403);
  });

  it('từ chối giá trị vai trò và khóa không hợp lệ', async () => {
    const admin = await signInAdmin();
    const user = await signUp('xuan');
    const url = `/api/admin/users/${user.id}`;
    assert.equal((await admin.api('PATCH', url, { role: 'root' })).status, 400);
    assert.equal((await admin.api('PATCH', url, { isLocked: 'true' })).status, 400);
    assert.equal((await admin.api('PATCH', url, {})).status, 400);
  });

  it('admin không tự khóa, hạ quyền hay xóa chính mình', async () => {
    const admin = await signInAdmin();
    const url = `/api/admin/users/${admin.id}`;
    assert.equal((await admin.api('PATCH', url, { role: 'user' })).status, 400);
    assert.equal((await admin.api('PATCH', url, { isLocked: true })).status, 400);
    assert.equal((await admin.api('DELETE', url)).status, 400);
    assert.equal((await admin.api('POST', `${url}/password`, { password: PASSWORD })).status, 400);
    assert.equal((await admin.api('GET', '/api/admin/stats')).status, 200);
  });

  it('đặt lại mật khẩu đăng xuất người dùng và mật khẩu mới dùng được', async () => {
    const admin = await signInAdmin();
    const user = await signUp('yen');

    const reset = await admin.api('POST', `/api/admin/users/${user.id}/password`, { password: 'mat-khau-tam' });
    assert.equal(reset.status, 204);
    assert.equal((await user.api('GET', '/api/auth/me')).body.user, null);
    const login = await client()('POST', '/api/auth/login', { username: 'yen', password: 'mat-khau-tam' });
    assert.equal(login.status, 200);
  });

  it('xóa người dùng xóa luôn phiên và yêu thích của họ', async () => {
    const admin = await signInAdmin();
    const user = await signUp('zuong');
    await user.api('POST', '/api/favorites', PLACE);

    assert.equal((await admin.api('DELETE', `/api/admin/users/${user.id}`)).status, 204);
    assert.equal((await admin.api('DELETE', `/api/admin/users/${user.id}`)).status, 404);
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM favorites').get().total, 0);
    assert.equal((await user.api('GET', '/api/auth/me')).body.user, null);
  });

  it('xem và xóa yêu thích của mọi người dùng', async () => {
    const admin = await signInAdmin();
    const user = await signUp('anh');
    const saved = await user.api('POST', '/api/favorites', PLACE);

    const list = await admin.api('GET', '/api/admin/favorites?search=anh');
    assert.equal(list.body.total, 1);
    assert.equal(list.body.favorites[0].username, 'anh');

    const url = `/api/admin/favorites/${saved.body.favorite.id}`;
    assert.equal((await admin.api('DELETE', url)).status, 204);
    assert.equal((await admin.api('DELETE', url)).status, 404);
  });

  it('thống kê lấy tên và địa chỉ từ cùng một bản ghi', async () => {
    const admin = await signInAdmin();
    const first = await signUp('ba.nguyen');
    const second = await signUp('bon.tran');
    await first.api('POST', '/api/favorites', { ...PLACE, address: 'Z địa chỉ của bản ghi đầu' });
    await second.api('POST', '/api/favorites', { ...PLACE, address: 'A địa chỉ của bản ghi sau' });

    const [top] = (await admin.api('GET', '/api/admin/stats')).body.topPlaces;
    assert.equal(top.saves, 2);
    assert.equal(top.address, 'Z địa chỉ của bản ghi đầu');
  });
});

describe('khóa địa điểm và nhập dữ liệu', () => {
  it('hai địa điểm khác tên nhưng trùng tọa độ được lưu riêng', async () => {
    const { api } = await signUp('trung.toa.do');
    const building = await api('POST', '/api/favorites', { ...PLACE, name: 'Tòa nhà' });
    const shop = await api('POST', '/api/favorites', { ...PLACE, name: 'Cửa hàng trong tòa nhà' });

    assert.equal(shop.status, 201);
    assert.notEqual(shop.body.favorite.id, building.body.favorite.id);
    assert.equal((await api('GET', '/api/favorites')).body.favorites.length, 2);
  });

  it('nhập báo vị trí mục bị từ chối khi vượt giới hạn 500', async () => {
    const { api, id } = await signUp('gan.day');
    const insert = db.prepare(`
      INSERT INTO favorites (user_id, place_key, name, address, lat, lon, created_at)
      VALUES (?, ?, 'x', '', 0, 0, 1)
    `);
    for (let i = 0; i < 499; i++) insert.run(id, `k${i}`);

    const result = await api('POST', '/api/favorites/import', {
      favorites: [{ ...PLACE, name: 'Mục 1' }, { ...PLACE, name: 'Mục 2' }, { name: 'lỗi' }]
    });
    assert.equal(result.body.imported, 1);
    assert.deepEqual(result.body.rejected, [1]);
    assert.deepEqual(result.body.invalid, [2]);
  });

  it('mục đã có trong tài khoản không bị tính là từ chối', async () => {
    const { api } = await signUp('da.co');
    await api('POST', '/api/favorites', PLACE);
    const result = await api('POST', '/api/favorites/import', { favorites: [PLACE] });
    assert.deepEqual(result.body, { imported: 0, rejected: [], invalid: [] });
  });

  it('nhập 50 mục có tên và địa chỉ dài tối đa không vượt giới hạn kích thước yêu cầu', async () => {
    const { api } = await signUp('ten.dai');
    const favorites = Array.from({ length: 50 }, (_, i) => ({
      name: `${i} ${'Đường Nguyễn Huệ '.repeat(20)}`.slice(0, 200),
      address: 'Phường Long Châu, Tỉnh Vĩnh Long, Việt Nam, '.repeat(20).slice(0, 500),
      lat: 10.25,
      lon: 105.97
    }));
    const result = await api('POST', '/api/favorites/import', { favorites });
    assert.equal(result.status, 200);
    assert.equal(result.body.imported, 50);
  });
});

describe('chạy sau reverse proxy', () => {
  it('giới hạn đăng nhập sai tính theo IP thật và kiểm tra Origin theo X-Forwarded-Host', async (t) => {
    const base = await startExtraApp(t, { loginLimit: 1, trustProxy: 'loopback' });
    const login = (ip) => fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
      body: JSON.stringify({ username: 'ai.do', password: 'sai-mat-khau' })
    });

    assert.equal((await login('10.0.0.1')).status, 401);
    assert.equal((await login('10.0.0.1')).status, 429);
    assert.equal((await login('10.0.0.2')).status, 401);

    const logout = await fetch(`${base}/api/auth/logout`, {
      method: 'POST',
      headers: { Origin: 'https://ban-do.example', 'X-Forwarded-Host': 'ban-do.example' }
    });
    assert.equal(logout.status, 204);
  });

  it('không tin X-Forwarded-Host khi chưa bật trust proxy', async () => {
    const response = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Origin: 'https://evil.example', 'X-Forwarded-Host': 'evil.example' }
    });
    assert.equal(response.status, 403);
  });
});

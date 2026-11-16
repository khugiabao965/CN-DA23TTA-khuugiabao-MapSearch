import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

// Mật khẩu ----------------------------------------------------------------
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_LENGTH = 32;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEY_LENGTH, SCRYPT);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [, salt, key] = stored.split('$');
  const expected = Buffer.from(key, 'base64');
  const actual = await scryptAsync(password, Buffer.from(salt, 'base64'), expected.length, SCRYPT);
  return timingSafeEqual(actual, expected);
}

// Băm sẵn để tên đăng nhập không tồn tại vẫn tốn thời gian như tồn tại
const dummyHash = hashPassword(randomBytes(16).toString('hex'));

export async function checkLogin(user, password) {
  const ok = await verifyPassword(password, user ? user.password_hash : await dummyHash);
  return Boolean(user) && ok;
}

// Phiên đăng nhập ---------------------------------------------------------
export const SESSION_COOKIE = 'sid';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

const hashToken = (token) => createHash('sha256').update(token).digest('hex');

export function createSession(db, res, userId) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + SESSION_MS;
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(hashToken(token), userId, expiresAt);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MS,
    path: '/'
  });
}

export function destroySession(db, req, res) {
  if (req.sessionToken) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(req.sessionToken));
  }
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

function readCookie(req, name) {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

// Middleware --------------------------------------------------------------

// Vai trò và trạng thái khóa được đọc lại từ CSDL ở mỗi yêu cầu,
// nên quyết định của admin có hiệu lực ngay với phiên đang mở.
export function loadUser(db) {
  const findUser = db.prepare(`
    SELECT u.id, u.username, u.role, u.created_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.is_locked = 0
  `);
  return (req, res, next) => {
    req.sessionToken = readCookie(req, SESSION_COOKIE);
    req.user = req.sessionToken ? findUser.get(hashToken(req.sessionToken), Date.now()) ?? null : null;
    next();
  };
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Vui lòng đăng nhập.' });
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Vui lòng đăng nhập.' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Bạn không có quyền quản trị.' });
  next();
}

// Chặn yêu cầu ghi đến từ trang khác (bổ sung cho cookie SameSite=Lax).
// req.host đọc X-Forwarded-Host khi bật trust proxy, nên vẫn đúng sau reverse proxy.
export function checkOrigin(req, res, next) {
  const origin = req.headers.origin;
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || !origin) return next();
  let host = null;
  try {
    host = new URL(origin).host;
  } catch {
    // Origin sai định dạng được xử lý như khác nguồn
  }
  if (host !== req.host) return res.status(403).json({ error: 'Yêu cầu không hợp lệ.' });
  next();
}

// Kiểm tra dữ liệu --------------------------------------------------------
const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]{3,30}$/;

export function validateUsername(username) {
  if (typeof username === 'string' && USERNAME_PATTERN.test(username)) return null;
  return 'Tên đăng nhập gồm 3-30 ký tự: chữ không dấu, số, dấu chấm, gạch ngang hoặc gạch dưới.';
}

export function validatePassword(password) {
  if (typeof password === 'string' && password.length >= 8 && password.length <= 128) return null;
  return 'Mật khẩu phải có từ 8 đến 128 ký tự.';
}

export const publicUser = (user) => ({
  id: user.id,
  username: user.username,
  role: user.role,
  createdAt: user.created_at
});

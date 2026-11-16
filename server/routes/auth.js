import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  checkLogin,
  createSession,
  destroySession,
  hashPassword,
  publicUser,
  requireAuth,
  validatePassword,
  validateUsername,
  verifyPassword
} from '../auth.js';

const tooMany = { error: 'Bạn thao tác quá nhiều lần. Vui lòng thử lại sau.' };

export function authRoutes(db, { loginLimit, registerLimit }) {
  const router = Router();

  // Chỉ đếm lần sai để người dùng bình thường không bị chặn
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: loginLimit,
    skipSuccessfulRequests: true,
    message: tooMany
  });
  const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: registerLimit,
    message: tooMany
  });

  const findByName = db.prepare('SELECT * FROM users WHERE username = ?');
  const touchLogin = db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?');

  router.get('/me', (req, res) => {
    res.json({ user: req.user ? publicUser(req.user) : null });
  });

  router.post('/register', registerLimiter, async (req, res) => {
    const { username, password } = req.body ?? {};
    const invalid = validateUsername(username) ?? validatePassword(password);
    if (invalid) return res.status(400).json({ error: invalid });

    const passwordHash = await hashPassword(password);
    const now = Date.now();
    const created = db.prepare(`
      INSERT INTO users (username, password_hash, created_at, last_login_at)
      VALUES (?, ?, ?, ?) ON CONFLICT (username) DO NOTHING
    `).run(username, passwordHash, now, now);
    if (created.changes === 0) return res.status(409).json({ error: 'Tên đăng nhập đã được sử dụng.' });

    const user = findByName.get(username);
    createSession(db, res, user.id);
    res.status(201).json({ user: publicUser(user) });
  });

  router.post('/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || validatePassword(password)) {
      return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu.' });
    }

    const user = findByName.get(username);
    if (!(await checkLogin(user, password))) {
      return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu.' });
    }
    if (user.is_locked) return res.status(403).json({ error: 'Tài khoản của bạn đã bị khóa.' });

    touchLogin.run(Date.now(), user.id);
    createSession(db, res, user.id);
    res.json({ user: publicUser(user) });
  });

  router.post('/logout', (req, res) => {
    destroySession(db, req, res);
    res.status(204).end();
  });

  // Đổi mật khẩu sẽ đăng xuất mọi thiết bị khác
  router.post('/password', requireAuth, loginLimiter, async (req, res) => {
    const { currentPassword, newPassword } = req.body ?? {};
    const invalid = validatePassword(newPassword);
    if (invalid) return res.status(400).json({ error: invalid });

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (validatePassword(currentPassword) || !(await verifyPassword(currentPassword, user.password_hash))) {
      return res.status(401).json({ error: 'Mật khẩu hiện tại không đúng.' });
    }

    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(newPassword), user.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
    createSession(db, res, user.id);
    res.status(204).end();
  });

  return router;
}

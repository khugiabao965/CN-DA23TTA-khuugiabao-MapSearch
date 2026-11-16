import { Router } from 'express';
import { hashPassword, requireAdmin, validatePassword } from '../auth.js';

const PAGE_SIZE = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

const parsePage = (value) => Math.max(1, Number.parseInt(value, 10) || 1);
const likePattern = (text) => `%${String(text ?? '').replace(/[\\%_]/g, '\\$&')}%`;

export function adminRoutes(db) {
  const router = Router();
  router.use(requireAdmin);

  const findUser = db.prepare('SELECT id, role FROM users WHERE id = ?');

  // Nạp người dùng mục tiêu và chặn admin tự thao tác lên tài khoản của mình,
  // nhờ đó hệ thống luôn còn ít nhất một admin hoạt động.
  function loadTarget(req, res, next) {
    const target = findUser.get(Number(req.params.id) || 0);
    if (!target) return res.status(404).json({ error: 'Không tìm thấy người dùng.' });
    if (target.id === req.user.id) {
      return res.status(400).json({ error: 'Không thể thực hiện thao tác này trên tài khoản của chính bạn.' });
    }
    req.target = target;
    next();
  }

  router.get('/stats', (req, res) => {
    const count = (sql, ...params) => db.prepare(sql).get(...params).total;
    res.json({
      users: count('SELECT COUNT(*) AS total FROM users'),
      admins: count("SELECT COUNT(*) AS total FROM users WHERE role = 'admin'"),
      locked: count('SELECT COUNT(*) AS total FROM users WHERE is_locked = 1'),
      newUsers7d: count('SELECT COUNT(*) AS total FROM users WHERE created_at >= ?', Date.now() - 7 * DAY_MS),
      favorites: count('SELECT COUNT(*) AS total FROM favorites'),
      // Lấy tên và địa chỉ từ cùng một bản ghi đại diện của mỗi địa điểm
      topPlaces: db.prepare(`
        SELECT f.name, f.address, g.saves
        FROM (SELECT MIN(id) AS first_id, COUNT(*) AS saves FROM favorites GROUP BY place_key) AS g
        JOIN favorites f ON f.id = g.first_id
        ORDER BY g.saves DESC, f.name LIMIT 5
      `).all()
    });
  });

  router.get('/users', (req, res) => {
    const page = parsePage(req.query.page);
    const pattern = likePattern(req.query.search);
    const total = db.prepare("SELECT COUNT(*) AS total FROM users WHERE username LIKE ? ESCAPE '\\'")
      .get(pattern).total;
    const users = db.prepare(`
      SELECT u.id, u.username, u.role, u.is_locked, u.created_at, u.last_login_at,
             COUNT(f.id) AS favorite_count
      FROM users u LEFT JOIN favorites f ON f.user_id = u.id
      WHERE u.username LIKE ? ESCAPE '\\'
      GROUP BY u.id ORDER BY u.created_at DESC, u.id DESC LIMIT ? OFFSET ?
    `).all(pattern, PAGE_SIZE, (page - 1) * PAGE_SIZE);

    res.json({
      total,
      page,
      pageSize: PAGE_SIZE,
      users: users.map((u) => ({
        id: u.id,
        username: u.username,
        role: u.role,
        isLocked: Boolean(u.is_locked),
        favoriteCount: u.favorite_count,
        createdAt: u.created_at,
        lastLoginAt: u.last_login_at
      }))
    });
  });

  router.patch('/users/:id', loadTarget, (req, res) => {
    const { role, isLocked } = req.body ?? {};
    if (role === undefined && isLocked === undefined) {
      return res.status(400).json({ error: 'Không có thay đổi nào.' });
    }
    if (role !== undefined && !['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Vai trò không hợp lệ.' });
    }
    if (isLocked !== undefined && typeof isLocked !== 'boolean') {
      return res.status(400).json({ error: 'Trạng thái khóa không hợp lệ.' });
    }

    if (role !== undefined) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.target.id);
    if (isLocked !== undefined) {
      db.prepare('UPDATE users SET is_locked = ? WHERE id = ?').run(isLocked ? 1 : 0, req.target.id);
      if (isLocked) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.target.id);
    }
    res.status(204).end();
  });

  // Không có email khôi phục nên admin đặt mật khẩu tạm cho người dùng quên mật khẩu
  router.post('/users/:id/password', loadTarget, async (req, res) => {
    const invalid = validatePassword(req.body?.password);
    if (invalid) return res.status(400).json({ error: invalid });

    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .run(await hashPassword(req.body.password), req.target.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.target.id);
    res.status(204).end();
  });

  router.delete('/users/:id', loadTarget, (req, res) => {
    db.prepare('DELETE FROM users WHERE id = ?').run(req.target.id);
    res.status(204).end();
  });

  router.get('/favorites', (req, res) => {
    const page = parsePage(req.query.page);
    const pattern = likePattern(req.query.search);
    const where = `WHERE f.name LIKE ? ESCAPE '\\' OR f.address LIKE ? ESCAPE '\\' OR u.username LIKE ? ESCAPE '\\'`;
    const total = db.prepare(`
      SELECT COUNT(*) AS total FROM favorites f JOIN users u ON u.id = f.user_id ${where}
    `).get(pattern, pattern, pattern).total;
    const rows = db.prepare(`
      SELECT f.id, f.name, f.address, f.created_at, u.username
      FROM favorites f JOIN users u ON u.id = f.user_id ${where}
      ORDER BY f.created_at DESC, f.id DESC LIMIT ? OFFSET ?
    `).all(pattern, pattern, pattern, PAGE_SIZE, (page - 1) * PAGE_SIZE);

    res.json({
      total,
      page,
      pageSize: PAGE_SIZE,
      favorites: rows.map((f) => ({
        id: f.id,
        name: f.name,
        address: f.address,
        username: f.username,
        createdAt: f.created_at
      }))
    });
  });

  router.delete('/favorites/:id', (req, res) => {
    const result = db.prepare('DELETE FROM favorites WHERE id = ?').run(Number(req.params.id) || 0);
    if (result.changes === 0) return res.status(404).json({ error: 'Không tìm thấy địa điểm.' });
    res.status(204).end();
  });

  return router;
}

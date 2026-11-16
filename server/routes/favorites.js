import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { transaction } from '../db.js';

const MAX_PER_USER = 500;
const MAX_IMPORT = 200;

// Tọa độ làm tròn 5 chữ số kèm tên, để hai địa điểm trùng tọa độ vẫn tách biệt.
// Cùng công thức với makeFavKey ở public/js/favorites.js.
export const placeKey = (lat, lon, name) => `${lat.toFixed(5)},${lon.toFixed(5)}|${name}`;

const inRange = (value, limit) => Number.isFinite(value) && Math.abs(value) <= limit;

function parseFavorite(body) {
  const { name, address, lat, lon } = body ?? {};
  if (typeof name !== 'string' || typeof address !== 'string') return null;
  const cleanName = name.trim();
  const cleanAddress = address.trim();
  if (!cleanName || cleanName.length > 200 || cleanAddress.length > 500) return null;
  if (!inRange(lat, 90) || !inRange(lon, 180)) return null;
  return { name: cleanName, address: cleanAddress, lat, lon };
}

const toJson = (row) => ({
  id: row.id,
  name: row.name,
  address: row.address,
  lat: row.lat,
  lon: row.lon,
  createdAt: row.created_at
});

export function favoriteRoutes(db) {
  const router = Router();
  router.use(requireAuth);

  const countFor = db.prepare('SELECT COUNT(*) AS total FROM favorites WHERE user_id = ?');
  const findByKey = db.prepare('SELECT * FROM favorites WHERE user_id = ? AND place_key = ?');
  const insert = db.prepare(`
    INSERT INTO favorites (user_id, place_key, name, address, lat, lon, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, place_key) DO NOTHING
  `);
  const keyOf = (place) => placeKey(place.lat, place.lon, place.name);
  const save = (userId, place) =>
    insert.run(userId, keyOf(place), place.name, place.address, place.lat, place.lon, Date.now());

  router.get('/', (req, res) => {
    const rows = db.prepare('SELECT * FROM favorites WHERE user_id = ? ORDER BY created_at DESC, id DESC')
      .all(req.user.id);
    res.json({ favorites: rows.map(toJson) });
  });

  router.post('/', (req, res) => {
    const place = parseFavorite(req.body);
    if (!place) return res.status(400).json({ error: 'Dữ liệu địa điểm không hợp lệ.' });

    // Lưu lại cùng một địa điểm là thao tác an toàn: trả về bản ghi đã có
    const existing = findByKey.get(req.user.id, keyOf(place));
    if (existing) return res.json({ favorite: toJson(existing) });

    if (countFor.get(req.user.id).total >= MAX_PER_USER) {
      return res.status(409).json({ error: `Bạn chỉ lưu được tối đa ${MAX_PER_USER} địa điểm.` });
    }
    save(req.user.id, place);
    res.status(201).json({ favorite: toJson(findByKey.get(req.user.id, keyOf(place))) });
  });

  // Chuyển yêu thích đã lưu trên trình duyệt sang tài khoản, trong một giao dịch.
  // Trả về vị trí các mục không lưu được để trình duyệt xử lý:
  //   rejected: vượt giới hạn, giữ lại trên trình duyệt để thử lại sau
  //   invalid: dữ liệu sai, không bao giờ lưu được nên trình duyệt bỏ đi
  router.post('/import', (req, res) => {
    const items = req.body?.favorites;
    if (!Array.isArray(items) || items.length > MAX_IMPORT) {
      return res.status(400).json({ error: 'Danh sách nhập không hợp lệ.' });
    }

    const result = transaction(db, () => {
      let imported = 0;
      const rejected = [];
      const invalid = [];
      let remaining = MAX_PER_USER - countFor.get(req.user.id).total;
      items.forEach((item, index) => {
        const place = parseFavorite(item);
        if (!place) return invalid.push(index);
        if (findByKey.get(req.user.id, keyOf(place))) return; // Đã có trong tài khoản
        if (remaining <= 0) return rejected.push(index);
        save(req.user.id, place);
        imported++;
        remaining--;
      });
      return { imported, rejected, invalid };
    });
    res.json(result);
  });

  router.delete('/:id', (req, res) => {
    const result = db.prepare('DELETE FROM favorites WHERE id = ? AND user_id = ?')
      .run(Number(req.params.id) || 0, req.user.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Không tìm thấy địa điểm.' });
    res.status(204).end();
  });

  return router;
}

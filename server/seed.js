import { randomBytes } from 'node:crypto';
import { hashPassword } from './auth.js';
import { transaction } from './db.js';
import { placeKey } from './routes/favorites.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const USERS = [
  { username: 'demo.admin', role: 'admin', isLocked: 0 },
  { username: 'demo.an', role: 'user', isLocked: 0 },
  { username: 'demo.binh', role: 'user', isLocked: 0 },
  { username: 'demo.khoa', role: 'user', isLocked: 1 }
];

// Tọa độ và địa chỉ lấy từ OpenStreetMap
const PLACES = [
  {
    name: 'Bệnh viện Đa khoa Vĩnh Long',
    address: 'Bệnh viện Đa khoa Vĩnh Long, 301, Đường Trần Phú, Phường Phước Hậu, Tỉnh Vĩnh Long, 85108, Việt Nam',
    lat: 10.2318036,
    lon: 105.9887979
  },
  {
    name: 'Trường Đại học Sư phạm Kỹ thuật Vĩnh Long',
    address: 'Trường Đại học Sư phạm Kỹ thuật Vĩnh Long, 73, Đường Nguyễn Huệ, Phường Long Châu, Phường Tân Hạnh, Tỉnh Vĩnh Long, 85067, Việt Nam',
    lat: 10.25002,
    lon: 105.9624775
  },
  {
    name: 'Chợ Vĩnh Long',
    address: 'Chợ Vĩnh Long, Đường Đoàn Thị Điểm, Phường Long Châu, Vĩnh Long, Tỉnh Vĩnh Long, 85067, Việt Nam',
    lat: 10.2557605,
    lon: 105.9730991
  },
  {
    name: 'Văn Thánh Miếu Vĩnh Long',
    address: 'Văn Thánh Miếu Vĩnh Long, Đường Trần Phú, Phường Phước Hậu, Tỉnh Vĩnh Long, 85108, Việt Nam',
    lat: 10.2428918,
    lon: 105.9846095
  }
];

// Số địa điểm mỗi tài khoản lưu, để thống kê "lưu nhiều nhất" có thứ hạng rõ ràng
const FAVORITE_COUNTS = { 'demo.an': 4, 'demo.binh': 2, 'demo.khoa': 1 };

// Tạo dữ liệu mẫu để demo. Mật khẩu sinh ngẫu nhiên và trả về một lần duy nhất.
// Chạy lại không ghi đè: tài khoản đã có được giữ nguyên.
export async function seedDatabase(db, now = Date.now()) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Không tạo dữ liệu mẫu khi NODE_ENV=production.');
  }

  const password = randomBytes(9).toString('base64url');
  const passwordHash = await hashPassword(password);
  const insertUser = db.prepare(`
    INSERT INTO users (username, password_hash, role, is_locked, created_at)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT (username) DO NOTHING
  `);
  const findUser = db.prepare('SELECT id FROM users WHERE username = ?');
  const insertFavorite = db.prepare(`
    INSERT INTO favorites (user_id, place_key, name, address, lat, lon, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, place_key) DO NOTHING
  `);

  const created = [];
  let favorites = 0;

  transaction(db, () => {
    USERS.forEach((user, index) => {
      const result = insertUser.run(user.username, passwordHash, user.role, user.isLocked, now - index * DAY_MS);
      if (result.changes > 0) created.push(user.username);
    });

    for (const [username, count] of Object.entries(FAVORITE_COUNTS)) {
      const { id } = findUser.get(username);
      PLACES.slice(0, count).forEach((place, index) => {
        favorites += insertFavorite.run(
          id, placeKey(place.lat, place.lon, place.name), place.name, place.address, place.lat, place.lon,
          now - index * DAY_MS
        ).changes;
      });
    }
  });

  return { created, favorites, password: created.length > 0 ? password : null };
}

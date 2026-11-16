import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import { checkOrigin, loadUser } from './auth.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { favoriteRoutes } from './routes/favorites.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));

// trustProxy: đặt khi chạy sau reverse proxy (nginx...) để giới hạn tần suất
// tính theo IP thật của người dùng thay vì IP của proxy
export function createApp({ db, loginLimit = 10, registerLimit = 10, trustProxy = false }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);

  app.use(helmet({
    // Máy chủ tile OSM từ chối yêu cầu không có Referer, nên không dùng no-referrer mặc định
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://unpkg.com'],
        styleSrc: ["'self'", 'https://cdn.jsdelivr.net', 'https://unpkg.com'],
        imgSrc: ["'self'", 'data:', 'https://unpkg.com', 'https://tile.openstreetmap.org', 'https://*.tile.openstreetmap.fr'],
        connectSrc: ["'self'", 'https://nominatim.openstreetmap.org'],
        upgradeInsecureRequests: null
      }
    }
  }));

  app.use(express.json({ limit: '256kb' }));

  app.use('/api', checkOrigin, loadUser(db));
  app.use('/api/auth', authRoutes(db, { loginLimit, registerLimit }));
  app.use('/api/favorites', favoriteRoutes(db));
  app.use('/api/admin', adminRoutes(db));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Không tìm thấy.' }));

  app.use(express.static(PUBLIC_DIR));

  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
      return res.status(err.status).json({ error: 'Dữ liệu gửi lên không hợp lệ.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  });

  return app;
}

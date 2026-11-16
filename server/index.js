import './env.js';
import { createApp } from './app.js';
import { databaseFile, markInUse, openDatabase } from './db.js';

const { PORT = 3000, HOST = '127.0.0.1', TRUST_PROXY } = process.env;

// TRUST_PROXY: số lớp proxy (vd. 1), "true", hoặc danh sách địa chỉ (vd. "loopback")
function parseTrustProxy(value) {
  if (!value || value === 'false') return false;
  if (value === 'true') return true;
  return /^\d+$/.test(value) ? Number(value) : value;
}

const file = databaseFile();
let releaseLock;
try {
  releaseLock = markInUse(file);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const db = openDatabase(file);

process.on('exit', () => {
  releaseLock();
  db.close();
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(0));

createApp({ db, trustProxy: parseTrustProxy(TRUST_PROXY) }).listen(PORT, HOST, () => {
  console.log(`Ứng dụng đang chạy tại http://${HOST}:${PORT}`);
});

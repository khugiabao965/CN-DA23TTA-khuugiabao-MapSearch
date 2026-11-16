import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const DEFAULT_DB_FILE = fileURLToPath(new URL('../data/ban-do.db', import.meta.url));
const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations', import.meta.url));

export const databaseFile = () => process.env.DB_FILE ?? DEFAULT_DB_FILE;

const readVersion = (db) => db.prepare('PRAGMA user_version').get().user_version;

// Mỗi file NNN_ten.sql là một migration; NNN phải liên tiếp từ 001
function loadMigrations(dir) {
  const migrations = readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => {
      const match = /^(\d{3})_.+\.sql$/.exec(file);
      if (!match) throw new Error(`Tên migration không hợp lệ: ${file}`);
      return { version: Number(match[1]), file, path: path.join(dir, file) };
    });

  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new Error(`Migration phải đánh số liên tiếp, lỗi tại: ${migration.file}`);
    }
  });
  return migrations;
}

export const latestVersion = (dir = MIGRATIONS_DIR) => loadMigrations(dir).length;

// Chạy fn trong một giao dịch; lỗi thì hoàn tác mà không che mất lỗi gốc
export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
}

// Phiên bản lược đồ lưu trong PRAGMA user_version. Mỗi migration chạy trong một
// giao dịch, nên lỗi giữa chừng để CSDL nguyên ở phiên bản trước.
export function migrate(db, dir = MIGRATIONS_DIR) {
  const migrations = loadMigrations(dir);
  const current = readVersion(db);
  if (current > migrations.length) {
    throw new Error(`CSDL ở phiên bản ${current}, mới hơn mã nguồn (${migrations.length}).`);
  }

  const applied = [];
  for (const migration of migrations.slice(current)) {
    try {
      transaction(db, () => {
        db.exec(readFileSync(migration.path, 'utf8'));
        db.exec(`PRAGMA user_version = ${migration.version}`);
      });
    } catch (error) {
      throw new Error(`Migration ${migration.file} thất bại: ${error.message}`, { cause: error });
    }
    applied.push(migration.file);
  }
  return applied;
}

export function openDatabase(file, { runMigrations = true } = {}) {
  if (file !== ':memory:') mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  if (runMigrations) migrate(db);
  return db;
}

export function inspectDatabase(db) {
  const tables = db.prepare(`
    SELECT name FROM sqlite_schema
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name
  `).all();
  return {
    version: readVersion(db),
    latestVersion: latestVersion(),
    integrity: db.prepare('PRAGMA integrity_check').get().integrity_check,
    foreignKeyErrors: db.prepare('PRAGMA foreign_key_check').all().length,
    tables: Object.fromEntries(
      tables.map(({ name }) => [name, db.prepare(`SELECT COUNT(*) AS total FROM "${name}"`).get().total])
    )
  };
}

// VACUUM INTO tạo bản sao nhất quán kể cả khi ứng dụng đang chạy
export function backupDatabase(db, target) {
  if (existsSync(target)) throw new Error(`File sao lưu đã tồn tại: ${target}`);
  mkdirSync(path.dirname(path.resolve(target)), { recursive: true });
  db.prepare('VACUUM INTO ?').run(target);
  return target;
}

// ---------- Đánh dấu CSDL đang được ứng dụng sử dụng ----------
const lockFile = (file) => `${path.resolve(file)}.lock`;

// Đọc PID trong file khóa nếu tiến trình đó còn chạy (khác tiến trình hiện tại)
function activeLockPid(file) {
  let pid;
  try {
    pid = Number(readFileSync(lockFile(file), 'utf8'));
  } catch {
    return null;
  }
  if (!pid || pid === process.pid) return null;
  try {
    process.kill(pid, 0);
  } catch (error) {
    if (error.code === 'ESRCH') return null; // Khóa sót lại sau khi ứng dụng bị tắt đột ngột
  }
  return pid;
}

// Ứng dụng ghi PID vào file khóa khi chạy; hàm trả về sẽ xóa khóa khi dừng.
// Từ chối chạy thêm một ứng dụng thứ hai trên cùng CSDL.
export function markInUse(file) {
  if (file === ':memory:') return () => {};
  const runningPid = activeLockPid(file);
  if (runningPid) throw new Error(`Ứng dụng khác đang dùng CSDL này (PID ${runningPid}).`);
  const lock = lockFile(file);
  writeFileSync(lock, String(process.pid));
  return () => {
    try {
      if (readFileSync(lock, 'utf8') === String(process.pid)) rmSync(lock, { force: true });
    } catch {
      // Khóa đã bị xóa: không cần làm gì
    }
  };
}

function assertNotInUse(file) {
  const pid = activeLockPid(file);
  if (!pid) return;
  throw new Error(
    `Ứng dụng đang dùng CSDL (PID ${pid}). Hãy dừng ứng dụng rồi phục hồi lại. ` +
      `Nếu chắc chắn ứng dụng đã dừng, xóa file ${lockFile(file)}.`
  );
}

// ---------- Phục hồi ----------
function assertRestorable(source) {
  if (!existsSync(source)) throw new Error(`Không tìm thấy file sao lưu: ${source}`);
  const candidate = new DatabaseSync(source, { readOnly: true });
  try {
    const hasUsers = candidate.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'users'").get();
    if (!hasUsers) throw new Error('File sao lưu không phải CSDL của ứng dụng.');
    const status = inspectDatabase(candidate);
    if (status.integrity !== 'ok') throw new Error('File sao lưu bị hỏng.');
    if (status.version < 1) throw new Error('File sao lưu không có phiên bản lược đồ hợp lệ.');
    if (status.version > status.latestVersion) {
      throw new Error('File sao lưu được tạo bởi phiên bản mới hơn của ứng dụng.');
    }
  } finally {
    candidate.close();
  }
}

// File chính và file WAL (nếu có) phải đi cùng nhau khi sao chép nguyên trạng
const copyWithWal = (from, to) => {
  copyFileSync(from, to);
  if (existsSync(`${from}-wal`)) copyFileSync(`${from}-wal`, `${to}-wal`);
};

// Ưu tiên VACUUM INTO; chỉ khi SQLite không đọc được CSDL hiện tại (bị hỏng)
// mới sao chép nguyên file. Lỗi khác (vd. đĩa đầy) được báo ra, không che đi.
function saveCurrent(file, target) {
  try {
    const current = new DatabaseSync(file);
    try {
      backupDatabase(current, target);
    } finally {
      current.close();
    }
  } catch (error) {
    if (error.code !== 'ERR_SQLITE_ERROR') throw error;
    copyWithWal(file, target);
  }
}

// Bản hiện tại luôn được lưu lại trước khi thay thế
export function restoreDatabase(file, source, safetyBackup) {
  assertRestorable(source);
  assertNotInUse(file);
  if (existsSync(file)) {
    if (existsSync(safetyBackup)) throw new Error(`File lưu bản hiện tại đã tồn tại: ${safetyBackup}`);
    mkdirSync(path.dirname(path.resolve(safetyBackup)), { recursive: true });
    saveCurrent(file, safetyBackup);
  }

  try {
    for (const suffix of ['', '-wal', '-shm']) rmSync(file + suffix, { force: true });
  } catch (error) {
    if (error.code !== 'EPERM' && error.code !== 'EBUSY') throw error;
    throw new Error('CSDL đang được sử dụng. Hãy dừng ứng dụng rồi phục hồi lại.', { cause: error });
  }
  mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  copyWithWal(source, file);
}

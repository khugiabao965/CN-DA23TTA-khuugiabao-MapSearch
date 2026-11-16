import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import {
  backupDatabase,
  inspectDatabase,
  markInUse,
  migrate,
  openDatabase,
  restoreDatabase,
  transaction
} from '../server/db.js';
import { seedDatabase } from '../server/seed.js';

let dir;

before(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'ban-do-test-'));
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

const version = (db) => db.prepare('PRAGMA user_version').get().user_version;
const addUser = (db, username = 'nguoi.dung') =>
  db.prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?, 'x', 1)")
    .run(username).lastInsertRowid;

const FAVORITE_SQL = `
  INSERT INTO favorites (user_id, place_key, name, address, lat, lon, created_at)
  VALUES (?, ?, ?, ?, ?, ?, 1)
`;

describe('migration', () => {
  function migrationDir(name, files) {
    const target = path.join(dir, name);
    mkdirSync(target);
    for (const [file, sql] of Object.entries(files)) writeFileSync(path.join(target, file), sql);
    return target;
  }

  it('CSDL mới ở phiên bản mới nhất và chạy lại không thay đổi gì', () => {
    const db = openDatabase(':memory:');
    const { version: current, latestVersion } = inspectDatabase(db);
    assert.equal(current, latestVersion);
    assert.deepEqual(migrate(db), []);
    db.close();
  });

  it('chỉ áp dụng migration còn thiếu, theo thứ tự', () => {
    const migrations = migrationDir('tang-dan', {
      '001_a.sql': 'CREATE TABLE a (x INTEGER);',
      '002_b.sql': 'CREATE TABLE b (x INTEGER);'
    });
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE a (x INTEGER); PRAGMA user_version = 1;');

    assert.deepEqual(migrate(db, migrations), ['002_b.sql']);
    assert.equal(version(db), 2);
    db.close();
  });

  it('migration lỗi được hoàn tác toàn bộ', () => {
    const migrations = migrationDir('loi', {
      '001_ok.sql': 'CREATE TABLE ok (x INTEGER);',
      '002_loi.sql': 'CREATE TABLE do_dang (x INTEGER); INSERT INTO khong_ton_tai VALUES (1);'
    });
    const db = new DatabaseSync(':memory:');

    assert.throws(() => migrate(db, migrations), /002_loi\.sql/);
    assert.equal(version(db), 1);
    const partial = db.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'do_dang'").get();
    assert.equal(partial, undefined);
    db.close();
  });

  it('từ chối CSDL mới hơn mã nguồn', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA user_version = 999');
    assert.throws(() => migrate(db), /mới hơn mã nguồn/);
    db.close();
  });

  it('từ chối migration đánh số thiếu', () => {
    const migrations = migrationDir('thieu-so', {
      '001_a.sql': 'SELECT 1;',
      '003_c.sql': 'SELECT 1;'
    });
    const db = new DatabaseSync(':memory:');
    assert.throws(() => migrate(db, migrations), /liên tiếp/);
    db.close();
  });
});

describe('ràng buộc lược đồ', () => {
  let db;

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('users từ chối dữ liệu sai', () => {
    const insert = db.prepare('INSERT INTO users (username, password_hash, role, is_locked, created_at) VALUES (?, ?, ?, ?, ?)');
    assert.throws(() => insert.run('ab', 'x', 'user', 0, 1), /CHECK/);
    assert.throws(() => insert.run('a'.repeat(31), 'x', 'user', 0, 1), /CHECK/);
    assert.throws(() => insert.run('hop.le', '', 'user', 0, 1), /CHECK/);
    assert.throws(() => insert.run('hop.le', 'x', 'root', 0, 1), /CHECK/);
    assert.throws(() => insert.run('hop.le', 'x', 'user', 2, 1), /CHECK/);
  });

  it('tên đăng nhập là duy nhất, không phân biệt hoa thường', () => {
    addUser(db, 'Nguoi.Dung');
    assert.throws(() => addUser(db, 'nguoi.dung'), /UNIQUE/);
  });

  it('bảng STRICT từ chối sai kiểu dữ liệu', () => {
    const userId = addUser(db);
    assert.throws(() => db.prepare(FAVORITE_SQL).run(userId, 'k', 'Tên', '', 'không phải số', 0), /cannot store/);
  });

  it('favorites từ chối tọa độ và độ dài sai', () => {
    const userId = addUser(db);
    const insert = db.prepare(FAVORITE_SQL);
    assert.throws(() => insert.run(userId, 'k', 'Tên', '', 91, 0), /CHECK/);
    assert.throws(() => insert.run(userId, 'k', 'Tên', '', 0, 181), /CHECK/);
    assert.throws(() => insert.run(userId, 'k', '', '', 0, 0), /CHECK/);
    assert.throws(() => insert.run(userId, 'k', 'x'.repeat(201), '', 0, 0), /CHECK/);
    assert.throws(() => insert.run(userId, 'k', 'Tên', 'x'.repeat(501), 0, 0), /CHECK/);
  });

  it('một người dùng không lưu trùng địa điểm, người khác thì được', () => {
    const first = addUser(db, 'nguoi.mot');
    const second = addUser(db, 'nguoi.hai');
    const insert = db.prepare(FAVORITE_SQL);
    insert.run(first, 'k', 'Tên', '', 0, 0);
    assert.throws(() => insert.run(first, 'k', 'Tên', '', 0, 0), /UNIQUE/);
    insert.run(second, 'k', 'Tên', '', 0, 0);
  });

  it('khóa ngoại được bật và xóa người dùng xóa theo tầng', () => {
    assert.throws(() => db.prepare(FAVORITE_SQL).run(999, 'k', 'Tên', '', 0, 0), /FOREIGN KEY/);

    const userId = addUser(db);
    db.prepare(FAVORITE_SQL).run(userId, 'k', 'Tên', '', 0, 0);
    db.prepare("INSERT INTO sessions VALUES ('t', ?, 9)").run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    const { tables } = inspectDatabase(db);
    assert.equal(tables.favorites, 0);
    assert.equal(tables.sessions, 0);
  });

  it('truy vấn danh sách chính dùng chỉ mục, không sắp xếp tạm', () => {
    const plan = (sql) => db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(1).map((row) => row.detail).join(' | ');

    const favorites = plan('SELECT * FROM favorites WHERE user_id = ? ORDER BY created_at DESC, id DESC');
    assert.match(favorites, /idx_favorites_user_created/);
    assert.doesNotMatch(favorites, /TEMP B-TREE/);

    const users = plan('SELECT * FROM users WHERE id > ? ORDER BY created_at DESC, id DESC LIMIT 20');
    assert.doesNotMatch(users, /TEMP B-TREE/);
    assert.match(plan('DELETE FROM sessions WHERE expires_at < ?'), /idx_sessions_expires/);
  });
});

describe('dữ liệu mẫu', () => {
  it('tạo dữ liệu hợp lệ, chạy lại không trùng hay đổi mật khẩu', async () => {
    const db = openDatabase(':memory:');
    const first = await seedDatabase(db);
    assert.equal(first.created.length, 4);
    assert.ok(first.password.length >= 12);

    const hash = db.prepare("SELECT password_hash FROM users WHERE username = 'demo.an'").get().password_hash;
    assert.ok(!hash.includes(first.password));

    const again = await seedDatabase(db);
    assert.deepEqual(again, { created: [], favorites: 0, password: null });
    assert.equal(db.prepare("SELECT password_hash FROM users WHERE username = 'demo.an'").get().password_hash, hash);

    const status = inspectDatabase(db);
    assert.equal(status.tables.favorites, first.favorites);
    assert.equal(status.foreignKeyErrors, 0);
    db.close();
  });

  it('từ chối chạy ở môi trường production', async () => {
    const db = openDatabase(':memory:');
    const saved = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    await assert.rejects(seedDatabase(db), /production/);
    if (saved === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = saved;
    assert.equal(inspectDatabase(db).tables.users, 0);
    db.close();
  });
});

describe('sao lưu và phục hồi', () => {
  it('bản sao lưu đầy đủ và phục hồi đúng, kể cả sau khi dữ liệu đổi', () => {
    const file = path.join(dir, 'chinh.db');
    const backup = path.join(dir, 'backups', 'ban-sao.db');
    const safety = path.join(dir, 'backups', 'truoc-phuc-hoi.db');

    const db = openDatabase(file);
    addUser(db, 'con.lai');
    backupDatabase(db, backup);
    assert.throws(() => backupDatabase(db, backup), /đã tồn tại/);
    addUser(db, 'se.mat');
    db.close();

    restoreDatabase(file, backup, safety);

    const restored = openDatabase(file);
    const names = restored.prepare('SELECT username FROM users').all().map((row) => row.username);
    assert.deepEqual(names, ['con.lai']);
    restored.close();

    const before = new DatabaseSync(safety, { readOnly: true });
    assert.equal(inspectDatabase(before).tables.users, 2);
    before.close();
  });

  it('từ chối file không phải CSDL của ứng dụng và giữ nguyên CSDL hiện tại', () => {
    const file = path.join(dir, 'giu-nguyen.db');
    const stranger = path.join(dir, 'la.db');
    const notDatabase = path.join(dir, 'van-ban.db');

    const db = openDatabase(file);
    addUser(db, 'con.nguyen');
    db.close();

    const other = new DatabaseSync(stranger);
    other.exec('CREATE TABLE khac (x INTEGER)');
    other.close();
    writeFileSync(notDatabase, 'đây không phải SQLite, chỉ là văn bản thuần');

    const safety = path.join(dir, 'khong-duoc-tao.db');
    assert.throws(() => restoreDatabase(file, stranger, safety), /không phải CSDL/);
    assert.throws(() => restoreDatabase(file, notDatabase, safety));
    assert.throws(() => restoreDatabase(file, path.join(dir, 'khong-co.db'), safety), /Không tìm thấy/);
    assert.equal(existsSync(safety), false);

    const reopened = openDatabase(file);
    assert.equal(inspectDatabase(reopened).tables.users, 1);
    reopened.close();
  });

  it('vẫn phục hồi được khi CSDL hiện tại bị hỏng, bản hỏng được giữ lại', () => {
    const file = path.join(dir, 'bi-hong.db');
    const backup = path.join(dir, 'tot.db');
    const safety = path.join(dir, 'backups', 'ban-hong.db');

    const good = openDatabase(backup);
    addUser(good, 'du.lieu.tot');
    good.close();
    writeFileSync(file, 'SQLite format 3\0' + 'rác'.repeat(2000));

    restoreDatabase(file, backup, safety);

    const restored = openDatabase(file);
    assert.equal(inspectDatabase(restored).tables.users, 1);
    restored.close();
    assert.ok(existsSync(safety));
  });

  it('từ chối bản sao lưu có lược đồ mới hơn mã nguồn', () => {
    const file = path.join(dir, 'dang-dung.db');
    const newer = path.join(dir, 'moi-hon.db');
    openDatabase(file).close();

    const db = openDatabase(newer);
    db.exec('PRAGMA user_version = 99');
    db.close();

    assert.throws(() => restoreDatabase(file, newer, path.join(dir, 'khong-tao.db')), /phiên bản mới hơn/);
    const current = openDatabase(file);
    assert.equal(inspectDatabase(current).tables.users, 0);
    current.close();
  });

  it('từ chối phục hồi khi ứng dụng đang dùng CSDL, bỏ qua khóa của tiến trình đã dừng', () => {
    const file = path.join(dir, 'co-khoa.db');
    const backup = path.join(dir, 'cho-khoa.db');
    openDatabase(file).close();
    openDatabase(backup).close();

    // Tiến trình cha (node --test) đang chạy, đóng vai ứng dụng
    writeFileSync(`${path.resolve(file)}.lock`, String(process.ppid));
    assert.throws(() => restoreDatabase(file, backup, path.join(dir, 'khoa-1.db')), /đang dùng CSDL/);

    writeFileSync(`${path.resolve(file)}.lock`, '999999');
    restoreDatabase(file, backup, path.join(dir, 'khoa-2.db'));
  });

  it('markInUse tạo khóa và chỉ xóa khóa của chính tiến trình', () => {
    const file = path.join(dir, 'danh-dau.db');
    const lock = `${path.resolve(file)}.lock`;

    const release = markInUse(file);
    assert.ok(existsSync(lock));
    release();
    assert.equal(existsSync(lock), false);

    const releaseAgain = markInUse(file);
    writeFileSync(lock, '999999');
    releaseAgain();
    assert.ok(existsSync(lock));
  });

  it('markInUse từ chối chạy ứng dụng thứ hai và bỏ qua CSDL trong bộ nhớ', () => {
    const file = path.join(dir, 'hai-ung-dung.db');
    writeFileSync(`${path.resolve(file)}.lock`, String(process.ppid));
    assert.throws(() => markInUse(file), /Ứng dụng khác đang dùng/);

    const release = markInUse(':memory:');
    release();
    assert.equal(existsSync(path.resolve(':memory:.lock')), false);
  });

  it('từ chối bản sao lưu chưa có phiên bản lược đồ', () => {
    const file = path.join(dir, 'giu-v0.db');
    const unversioned = path.join(dir, 'v0.db');
    openDatabase(file).close();
    const db = new DatabaseSync(unversioned);
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY)');
    db.close();

    assert.throws(() => restoreDatabase(file, unversioned, path.join(dir, 'khong-tao-v0.db')), /phiên bản lược đồ/);
  });

  it('không ghi đè bản lưu trước khi phục hồi đã có', () => {
    const file = path.join(dir, 'trung-ten.db');
    const backup = path.join(dir, 'nguon-trung-ten.db');
    const safety = path.join(dir, 'backups', 'da-co.db');
    openDatabase(file).close();
    openDatabase(backup).close();
    mkdirSync(path.dirname(safety), { recursive: true });
    writeFileSync(safety, 'bản lưu quan trọng');

    assert.throws(() => restoreDatabase(file, backup, safety), /đã tồn tại/);
    assert.equal(readFileSync(safety, 'utf8'), 'bản lưu quan trọng');
  });

  it('phục hồi giữ cả dữ liệu còn trong file WAL của bản sao lưu', () => {
    const live = path.join(dir, 'dang-ghi.db');
    const source = path.join(dir, 'chep-nguyen.db');
    const file = path.join(dir, 'nhan-wal.db');

    const db = openDatabase(live);
    db.exec('PRAGMA wal_autocheckpoint = 0');
    addUser(db, 'chi.trong.wal');
    // Sao chép nguyên trạng khi dữ liệu mới còn nằm trong WAL
    copyFileSync(live, source);
    copyFileSync(`${live}-wal`, `${source}-wal`);
    db.close();

    openDatabase(file).close();
    restoreDatabase(file, source, path.join(dir, 'backups', 'wal-truoc.db'));
    const restored = openDatabase(file);
    assert.equal(inspectDatabase(restored).tables.users, 1);
    restored.close();
  });
});

describe('nâng cấp lược đồ', () => {
  it('migration 002 thêm tên vào khóa địa điểm của dữ liệu có sẵn', () => {
    const onlyFirst = path.join(dir, 'chi-001');
    mkdirSync(onlyFirst);
    const source = fileURLToPath(new URL('../server/migrations/001_khoi_tao.sql', import.meta.url));
    copyFileSync(source, path.join(onlyFirst, '001_khoi_tao.sql'));

    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    migrate(db, onlyFirst);
    const userId = addUser(db);
    db.prepare(FAVORITE_SQL).run(userId, '10.00000,106.00000', 'Chợ', '', 10, 106);

    assert.deepEqual(migrate(db), ['002_khoa_dia_diem_theo_ten.sql']);
    assert.equal(db.prepare('SELECT place_key FROM favorites').get().place_key, '10.00000,106.00000|Chợ');
    assert.deepEqual(migrate(db), []);
    db.close();
  });

  it('transaction hoàn tác và giữ nguyên lỗi gốc', () => {
    const db = openDatabase(':memory:');
    assert.throws(
      () => transaction(db, () => {
        addUser(db, 'se.bi.huy');
        throw new Error('lỗi gốc');
      }),
      /lỗi gốc/
    );
    assert.equal(db.isTransaction, false);
    assert.equal(inspectDatabase(db).tables.users, 0);
    db.close();
  });
});

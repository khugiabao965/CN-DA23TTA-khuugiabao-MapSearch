// Công cụ quản lý CSDL. Cách dùng: npm run db:<status|migrate|seed|backup|restore>
import '../env.js';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { backupDatabase, databaseFile, inspectDatabase, migrate, openDatabase, restoreDatabase } from '../db.js';
import { seedDatabase } from '../seed.js';

const [command, argument] = process.argv.slice(2);
const file = databaseFile();

// Tên kèm mili giây để hai lần chạy liên tiếp không trùng file
function backupPath(label = 'ban-do') {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace('.', '-').slice(0, 19);
  return path.join(path.dirname(file), 'backups', `${label}-${stamp}.db`);
}

function printStatus(db) {
  const status = inspectDatabase(db);
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); // Gộp WAL vào file chính để kích thước đúng thực tế
  const pending = status.latestVersion - status.version;
  console.log(`File:        ${file}`);
  console.log(`Kích thước:  ${(statSync(file).size / 1024).toFixed(1)} KB`);
  console.log(
    `Lược đồ:     phiên bản ${status.version}/${status.latestVersion}` +
      (pending > 0 ? ` (còn ${pending} migration chưa áp dụng, chạy npm run db:migrate)` : '')
  );
  console.log(`Toàn vẹn:    ${status.integrity}, ${status.foreignKeyErrors} lỗi khóa ngoại`);
  for (const [table, total] of Object.entries(status.tables)) {
    console.log(`  ${table.padEnd(10)} ${total} dòng`);
  }
}

// runMigrations: lệnh nào tự nâng lược đồ khi mở CSDL.
// status và backup không nâng, để thấy đúng hiện trạng và sao lưu được bản trước khi nâng cấp.
const commands = {
  migrate: {
    runMigrations: false,
    run(db) {
      const applied = migrate(db);
      console.log(applied.length ? `Đã áp dụng: ${applied.join(', ')}` : 'CSDL đã ở phiên bản mới nhất.');
      printStatus(db);
    }
  },

  status: { runMigrations: false, mustExist: true, run: printStatus },

  seed: {
    runMigrations: true,
    async run(db) {
      const { created, favorites, password } = await seedDatabase(db);
      console.log(`Đã tạo ${created.length} tài khoản và ${favorites} địa điểm yêu thích.`);
      if (password) {
        console.log(`Tài khoản: ${created.join(', ')}`);
        console.log(`Mật khẩu chung (chỉ hiện lần này): ${password}`);
      }
    }
  },

  backup: {
    runMigrations: false,
    mustExist: true,
    run(db) {
      console.log(`Đã sao lưu: ${backupDatabase(db, argument ?? backupPath())}`);
    }
  }
};

async function main() {
  if (command === 'restore') {
    if (!argument) throw new Error('Cách dùng: npm run db:restore -- <file_sao_lưu>');
    const safety = backupPath('truoc-phuc-hoi');
    restoreDatabase(file, argument, safety);
    // In đường dẫn bản cũ trước khi nâng lược đồ, để vẫn biết nó nằm đâu nếu bước sau lỗi
    console.log(`Đã phục hồi từ ${argument}`);
    console.log(`Bản trước khi phục hồi (nếu có): ${safety}`);
    const restored = openDatabase(file);
    printStatus(restored);
    restored.close();
    return;
  }

  const action = commands[command];
  if (!action) throw new Error('Lệnh hợp lệ: migrate, status, seed, backup, restore');
  if (action.mustExist && !existsSync(file)) {
    throw new Error(`Chưa có CSDL tại ${file}. Chạy npm run db:migrate hoặc npm start để tạo.`);
  }

  const db = openDatabase(file, { runMigrations: action.runMigrations });
  try {
    await action.run(db);
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

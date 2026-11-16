// Tạo tài khoản admin, hoặc nâng tài khoản đã có lên admin và đặt lại mật khẩu.
// Cách dùng: npm run create-admin -- <tên_đăng_nhập>
import '../env.js';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { hashPassword, validatePassword, validateUsername } from '../auth.js';
import { databaseFile, openDatabase, transaction } from '../db.js';

// Đọc mật khẩu mà không hiện ký tự lên màn hình
function askHidden(question) {
  if (!stdin.isTTY) {
    const prompt = createInterface({ input: stdin, output: stdout });
    return prompt.question(question).finally(() => prompt.close());
  }

  return new Promise((resolve, reject) => {
    let value = '';
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const finish = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
      stdout.write('\n');
    };
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          finish();
          resolve(value);
          return;
        }
        if (char === '\u0003') {
          finish();
          reject(new Error('Đã hủy.'));
          return;
        }
        if (char === '\u0008' || char === '\u007f') value = value.slice(0, -1);
        else value += char;
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  const username = process.argv[2];
  const usernameError = validateUsername(username);
  if (usernameError) {
    throw new Error(`${usernameError}\nCách dùng: npm run create-admin -- <tên_đăng_nhập>`);
  }

  // Mật khẩu không nhận qua tham số dòng lệnh để không lưu lại trong lịch sử shell
  const password = process.env.ADMIN_PASSWORD ?? (await askHidden('Mật khẩu: '));
  const passwordError = validatePassword(password);
  if (passwordError) throw new Error(passwordError);

  const passwordHash = await hashPassword(password);
  const db = openDatabase(databaseFile());
  try {
    // Tài khoản có sẵn bị đăng xuất khỏi mọi thiết bị, như khi admin đặt lại mật khẩu
    transaction(db, () => {
      db.prepare(`
        INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, 'admin', ?)
        ON CONFLICT (username) DO UPDATE SET
          password_hash = excluded.password_hash, role = 'admin', is_locked = 0
      `).run(username, passwordHash, Date.now());
      db.prepare('DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE username = ?)').run(username);
    });
  } finally {
    db.close();
  }
  console.log(`Đã sẵn sàng tài khoản admin: ${username}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

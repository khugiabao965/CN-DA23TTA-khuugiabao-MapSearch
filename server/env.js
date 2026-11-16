// Nạp .env nếu có; không có file thì dùng giá trị mặc định.
// Phải được import đầu tiên ở mọi điểm khởi chạy.
try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

-- Lược đồ ban đầu của ứng dụng bản đồ.
-- Thời gian lưu dạng số mili giây kể từ 1970 (kết quả của Date.now()).
-- Ràng buộc CHECK khớp với kiểm tra ở tầng API, là lớp bảo vệ cuối nếu API có lỗi.

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  username      TEXT    NOT NULL COLLATE NOCASE UNIQUE
                        CHECK (length(username) BETWEEN 3 AND 30),
  password_hash TEXT    NOT NULL CHECK (length(password_hash) > 0),
  role          TEXT    NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  is_locked     INTEGER NOT NULL DEFAULT 0 CHECK (is_locked IN (0, 1)),
  created_at    INTEGER NOT NULL CHECK (created_at > 0),
  last_login_at INTEGER
) STRICT;

CREATE TABLE sessions (
  token_hash TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
) STRICT, WITHOUT ROWID;

CREATE TABLE favorites (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  place_key  TEXT    NOT NULL CHECK (length(place_key) > 0),
  name       TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  address    TEXT    NOT NULL CHECK (length(address) <= 500),
  lat        REAL    NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lon        REAL    NOT NULL CHECK (lon BETWEEN -180 AND 180),
  created_at INTEGER NOT NULL CHECK (created_at > 0),
  UNIQUE (user_id, place_key)
) STRICT;

-- Danh sách người dùng mới nhất ở trang quản trị
CREATE INDEX idx_users_created ON users (created_at DESC, id DESC);

-- Xóa toàn bộ phiên của một người dùng; dọn phiên hết hạn
CREATE INDEX idx_sessions_user ON sessions (user_id);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);

-- Danh sách yêu thích của một người dùng, mới nhất trước
CREATE INDEX idx_favorites_user_created ON favorites (user_id, created_at DESC, id DESC);

-- Danh sách yêu thích toàn hệ thống ở trang quản trị
CREATE INDEX idx_favorites_created ON favorites (created_at DESC, id DESC);

-- Thống kê địa điểm được lưu nhiều nhất
CREATE INDEX idx_favorites_place ON favorites (place_key);

# Phân tích yêu cầu

Tài liệu cho Nội dung 1 của đề cương: khảo sát các ứng dụng bản đồ hiện có, phân tích yêu cầu và xác định các chức năng cần xây dựng.

## 1. Khảo sát ứng dụng bản đồ hiện có

| Tiêu chí | Google Maps | OpenStreetMap (osm.org) | Ứng dụng của đề tài |
|---|---|---|---|
| Dữ liệu bản đồ | Dữ liệu độc quyền của Google | Dữ liệu mở do cộng đồng đóng góp | Dữ liệu OpenStreetMap |
| Nhúng vào ứng dụng riêng | Qua Maps JavaScript API, cần khóa API và tài khoản thanh toán | Qua thư viện mã nguồn mở như Leaflet, không cần khóa API | Leaflet, không cần khóa API |
| Tìm kiếm địa điểm | Rất mạnh, có thông tin doanh nghiệp, đánh giá | Nominatim, tìm theo tên và địa chỉ, giới hạn 1 yêu cầu/giây với máy chủ công cộng | Nominatim |
| Tra địa chỉ từ tọa độ | Có | Có (Nominatim reverse) | Có |
| Chỉ đường | Có | Có trên trang osm.org | Không (ngoài phạm vi đề tài) |
| Lưu địa điểm | Có, cần tài khoản Google | Không có trên trang xem bản đồ | Có: khách lưu trên trình duyệt, người dùng lưu theo tài khoản |
| Khả năng tùy biến | Hạn chế theo điều khoản sử dụng | Cao, chỉ cần ghi công nguồn dữ liệu | Toàn quyền tùy biến giao diện |

**Kết luận khảo sát:**
- Google Maps mạnh nhất về dữ liệu, nhưng tốn chi phí, cần khóa API và khó tùy biến.
- OpenStreetMap kết hợp Leaflet và Nominatim đáp ứng đủ nhu cầu tìm kiếm và hiển thị địa điểm của đề tài mà không tốn chi phí. Đổi lại phải tuân thủ chính sách sử dụng: ghi công OpenStreetMap, tối đa 1 yêu cầu/giây tới Nominatim.
- Giao diện được thiết kế theo bố cục quen thuộc của Google Maps (thanh tìm kiếm nổi, nút lọc nhanh, bảng kết quả bên trái) để người dùng dễ làm quen.

## 2. Tác nhân

| Tác nhân | Mô tả |
|---|---|
| Khách | Người mở trang mà không đăng nhập |
| Người dùng | Người đã đăng ký và đăng nhập; làm được mọi việc của khách |
| Quản trị viên | Người dùng có vai trò `admin`; làm được mọi việc của người dùng |

Sơ đồ use case: [so-do/use-case.drawio.png](so-do/use-case.drawio.png).

## 3. Yêu cầu chức năng

Cột "Nguồn" cho biết yêu cầu đến từ đề cương hay được bổ sung khi nâng cấp. Phần bổ sung vượt phạm vi đề cương ("không bao gồm máy chủ và cơ sở dữ liệu riêng"), nên cần giảng viên hướng dẫn đồng ý.

| Mã | Yêu cầu | Tác nhân | Nguồn | Hiện thực |
|---|---|---|---|---|
| FR01 | Hiển thị bản đồ tương tác: phóng to, thu nhỏ, kéo thả | Khách | Mục tiêu 1 | `public/js/app.js` |
| FR02 | Hiển thị marker và popup thông tin địa điểm | Khách | Mục tiêu 1 | `public/js/search.js` |
| FR03 | Tìm địa điểm theo tên hoặc địa chỉ, kết quả trên bản đồ và trong danh sách | Khách | Mục tiêu 2 | `public/js/search.js` |
| FR04 | Tìm nhanh theo loại: trường học, bệnh viện, quán ăn, ngân hàng | Khách | Mục tiêu 2 | `public/js/search.js` |
| FR05 | Lấy địa chỉ khi bấm vào bản đồ | Khách | Mục tiêu 3 | `public/js/location.js` |
| FR06 | Định vị vị trí người dùng | Khách | Mục tiêu 3 | `public/js/location.js` |
| FR07 | Lưu, xem, xóa địa điểm yêu thích bằng localStorage | Khách | Mục tiêu 3, Nội dung 4 | `public/js/favorites.js` |
| FR08 | Đăng ký, đăng nhập, đăng xuất, đổi mật khẩu | Người dùng | Bổ sung | `server/routes/auth.js`, `public/js/auth.js` |
| FR09 | Lưu yêu thích theo tài khoản trong CSDL, dùng trên mọi thiết bị | Người dùng | Bổ sung | `server/routes/favorites.js` |
| FR10 | Chuyển yêu thích đã lưu trên trình duyệt vào tài khoản khi đăng nhập | Người dùng | Bổ sung | `public/js/favorites.js` |
| FR11 | Xem thống kê người dùng và địa điểm được lưu nhiều nhất | Quản trị viên | Bổ sung | `server/routes/admin.js`, `public/js/admin.js` |
| FR12 | Quản lý người dùng: phân quyền, khóa, đặt lại mật khẩu, xóa | Quản trị viên | Bổ sung | `server/routes/admin.js` |
| FR13 | Quản lý địa điểm yêu thích của người dùng | Quản trị viên | Bổ sung | `server/routes/admin.js` |

## 4. Yêu cầu phi chức năng

| Mã | Yêu cầu | Cách đáp ứng |
|---|---|---|
| NFR01 | Giao diện tương thích máy tính và điện thoại (Mục tiêu 4) | CSS responsive với mốc 768px, bảng kết quả thu gọn trên điện thoại |
| NFR02 | Chạy trên Chrome, Edge và trình duyệt điện thoại (Phương pháp) | Chỉ dùng API chuẩn của trình duyệt; kiểm thử theo [kiem-thu.md](kiem-thu.md) |
| NFR03 | Giao diện tiếng Việt, dễ dùng | Toàn bộ nhãn và thông báo bằng tiếng Việt, bố cục theo kiểu Google Maps |
| NFR04 | Tuân thủ chính sách dịch vụ bản đồ | Giữ ghi công OpenStreetMap; mọi yêu cầu Nominatim đi qua hàng đợi tối đa 1 yêu cầu/giây |
| NFR05 | Bảo mật tài khoản | Mật khẩu băm bằng scrypt, cookie phiên HttpOnly, giới hạn đăng nhập sai, chặn yêu cầu khác nguồn, CSP |
| NFR06 | Toàn vẹn dữ liệu | Ràng buộc CHECK, khóa ngoại xóa theo tầng, migration có phiên bản, sao lưu và phục hồi; xem [database.md](database.md) |
| NFR07 | Riêng tư | Khách không cần tài khoản; vị trí người dùng chỉ dùng trên trình duyệt, không gửi lên máy chủ |

## 5. Ràng buộc và giới hạn

- Không có chỉ đường chi tiết (Phạm vi của đề cương).
- Phạm vi địa lý chủ yếu là Việt Nam: tìm kiếm giới hạn `countrycodes=vn`.
- Chất lượng kết quả tìm kiếm phụ thuộc dữ liệu OpenStreetMap tại khu vực.
- Định vị trên điện thoại chỉ hoạt động khi trang chạy qua HTTPS hoặc `localhost`.
- Không có email nên không có chức năng quên mật khẩu tự động; quản trị viên đặt lại mật khẩu tạm.

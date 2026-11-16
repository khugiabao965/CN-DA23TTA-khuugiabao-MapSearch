# Kế hoạch và kết quả kiểm thử

Theo Nội dung 5 của đề cương: kiểm thử chức năng trên Chrome, Edge và điện thoại, ghi nhận và sửa lỗi.

## 1. Kiểm thử tự động

Chạy `npm test` trong thư mục `web-ban-do`. Bộ kiểm thử gồm 63 ca, chạy trên CSDL tạm trong bộ nhớ:

| Nhóm | Nội dung chính |
|---|---|
| Xác thực | Đăng ký, đăng nhập, đăng xuất, đổi mật khẩu, phiên hết hạn, cookie HttpOnly, giới hạn đăng nhập sai |
| Bảo vệ yêu cầu | Chặn yêu cầu khác nguồn, CSP và Referrer-Policy, không lộ mã nguồn máy chủ |
| Yêu thích | Lưu, xóa, không trùng lặp, cách ly giữa người dùng, kiểm tra dữ liệu, nhập từ trình duyệt |
| Quản trị | Phân quyền, khóa tài khoản, đặt lại mật khẩu, xóa theo tầng, phân trang, thống kê |
| Cơ sở dữ liệu | Migration, ràng buộc CHECK và khóa ngoại, chỉ mục, dữ liệu mẫu, sao lưu và phục hồi |
| Reverse proxy | Giới hạn tần suất theo IP thật, kiểm tra Origin sau proxy |

Mỗi bản sửa lỗi đều được kiểm tra theo cách "đỏ rồi xanh": tạm gỡ bản sửa trên một bản sao mã nguồn, chạy test tương ứng và xác nhận test thất bại, rồi khôi phục và xác nhận test đạt lại. Cả 15 bản sửa trong mục 3 đều qua bước này.

## 2. Kiểm thử chức năng thủ công

Ký hiệu: **Đạt**: đã kiểm và đúng; **Lỗi**: đã kiểm và sai (ghi vào mục 3); để trống: chưa kiểm.

Cột Chrome ghi kết quả kiểm thử trong quá trình phát triển (Chrome trên Windows 11, ngày 03/11/2026). Cột Edge và Điện thoại cần điền khi kiểm thử.

| Mã | Chức năng | Các bước | Kết quả mong đợi | Chrome | Edge | Điện thoại |
|---|---|---|---|---|---|---|
| TC01 | Hiển thị bản đồ | Mở trang chủ | Bản đồ Vĩnh Long hiện đầy đủ, kéo thả và phóng to được | Đạt | | |
| TC02 | Tìm kiếm | Nhập "bệnh viện Vĩnh Long", nhấn Enter | Danh sách kết quả và ghim đỏ trên bản đồ | Đạt | | |
| TC03 | Xem kết quả | Bấm một kết quả | Bản đồ bay tới địa điểm, mở popup thông tin | Đạt | | |
| TC04 | Tìm nhanh theo loại | Bấm nút "Bệnh viện" | Kết quả bệnh viện trong khung nhìn hiện tại | Đạt | | |
| TC05 | Lấy địa chỉ | Bấm một điểm trên bản đồ | Popup hiện địa chỉ và tọa độ | Đạt | | |
| TC06 | Bấm nhanh liên tiếp | Bấm 3 điểm khác nhau thật nhanh | Popup chỉ hiện địa chỉ của điểm cuối, không gửi quá 1 yêu cầu/giây | Đạt | | |
| TC07 | Định vị | Bấm nút 📍, cho phép truy cập vị trí | Chấm xanh và vòng sai số tại vị trí hiện tại | | | |
| TC08 | Từ chối định vị | Bấm 📍, chặn quyền vị trí | Thông báo hướng dẫn cho phép trong cài đặt | | | |
| TC09 | Khách lưu yêu thích | Chưa đăng nhập, bấm "Lưu yêu thích" trong popup | Nút đổi thành "Đã lưu", địa điểm có trong tab Yêu thích, còn sau khi tải lại trang | Đạt | | |
| TC10 | Khách xóa yêu thích | Bấm ✕ trong tab Yêu thích | Địa điểm biến mất khỏi danh sách và bản đồ | Đạt | | |
| TC11 | Đăng ký | Bấm Đăng nhập → Đăng ký, nhập tên và mật khẩu từ 8 ký tự | Đăng nhập luôn, góc trên hiện tên tài khoản | Đạt | | |
| TC12 | Đăng ký sai | Mật khẩu dưới 8 ký tự hoặc tên đã có | Thông báo lỗi trong hộp thoại | | | |
| TC13 | Chuyển yêu thích khi đăng nhập | Khách lưu vài địa điểm rồi đăng nhập | Thông báo đã chuyển, danh sách nằm trong tài khoản | Đạt | | |
| TC14 | Yêu thích theo tài khoản | Đăng nhập trên trình duyệt khác | Thấy cùng danh sách yêu thích | | | |
| TC15 | Đổi mật khẩu | Bấm tên tài khoản → Đổi mật khẩu | Sai mật khẩu hiện tại thì báo lỗi; đúng thì thông báo thành công, mật khẩu cũ không còn đăng nhập được | Đạt | | |
| TC16 | Đăng xuất | Bấm tên tài khoản → Đăng xuất | Trở về trạng thái khách | Đạt | | |
| TC17 | Chặn trang quản trị | Người dùng thường mở `/admin.html` | Bị chuyển về trang bản đồ | Đạt | | |
| TC18 | Thống kê | Admin mở trang quản trị | Số liệu và địa điểm được lưu nhiều nhất | Đạt | | |
| TC19 | Khóa tài khoản | Admin bấm "Khóa" | Trạng thái "Đã khóa", người dùng bị đăng xuất ngay | Đạt | | |
| TC20 | Đổi vai trò | Admin bấm "Cấp admin" rồi xác nhận | Vai trò đổi, có hiệu lực ngay | Đạt | | |
| TC21 | Đặt lại mật khẩu | Admin bấm "Đặt lại mật khẩu" | Người dùng đăng nhập được bằng mật khẩu tạm | Đạt | | |
| TC22 | Xóa tài khoản | Admin bấm "Xóa" rồi xác nhận | Tài khoản và yêu thích của tài khoản biến mất | Đạt | | |
| TC23 | Tìm trong quản trị | Gõ vào ô tìm người dùng | Danh sách lọc theo tên | Đạt | | |
| TC24 | Giao diện điện thoại | Mở trên màn hình rộng khoảng 390px | Không tràn ngang, bảng kết quả thu gọn ở đáy, nút tài khoản chỉ còn biểu tượng | Đạt (giả lập) | | |
| TC25 | Chống XSS | Lưu địa điểm có tên chứa `<img src=x onerror=alert(1)>` | Tên hiện thành văn bản, không chạy mã | Đạt | | |
| TC26 | Phân trang quản trị | Ở trang cuối chỉ còn 1 người dùng, xóa người đó | Danh sách tự lùi về trang trước, không hiện trang trống | Đạt | | |
| TC27 | Hai địa điểm trùng tọa độ | Lưu hai địa điểm khác tên nhưng cùng tọa độ | Cả hai được lưu riêng, bỏ lưu cái này không ảnh hưởng cái kia | Đạt | | |

TC24 trên Chrome được kiểm bằng khung 390px trong trình duyệt máy tính, chưa phải điện thoại thật.

## 3. Lỗi phát hiện và đã sửa

| Lỗi | Cách phát hiện | Cách sửa |
|---|---|---|
| Nút định vị tràn chữ, không trở về biểu tượng ban đầu | Đọc mã | Giữ biểu tượng, chỉ làm mờ khi đang định vị |
| Bấm bản đồ nhanh: địa chỉ lần trước ghi đè lần sau | Đọc mã | Bỏ qua phản hồi đã lỗi thời |
| Tìm kiếm và tra địa chỉ có thể vượt 1 yêu cầu/giây | Đọc mã | Hàng đợi dùng chung `nominatimFetch` |
| Hai địa điểm trùng tọa độ bị coi là một | Code review | Khóa địa điểm gồm tọa độ và tên (migration 002) |
| Chuyển yêu thích vượt giới hạn làm mất dữ liệu trên trình duyệt | Code review | Chỉ xóa mục máy chủ đã nhận |
| Phục hồi CSDL thất bại khi CSDL hiện tại bị hỏng | Code review | Sao chép nguyên file khi không đọc được |
| Phục hồi được khi ứng dụng đang chạy (Linux, macOS) | Code review | File khóa ghi PID của ứng dụng |
| Sau reverse proxy, mọi người dùng chung một giới hạn đăng nhập | Code review | Tùy chọn `TRUST_PROXY` |
| Thống kê lấy tên và địa chỉ từ hai bản ghi khác nhau | Code review | Lấy cả hai từ cùng một bản ghi đại diện |
| Địa chỉ dài hơn 500 ký tự làm việc lưu yêu thích thất bại | Code review lần 2 | Cắt tên và địa chỉ theo giới hạn trước khi lưu |
| Chuyển yêu thích lúc đăng nhập có thể xóa mục khách vừa thêm trong lúc chờ mạng | Code review lần 2 | Đọc lại localStorage và chỉ xóa mục đã xử lý xong |
| Gói dữ liệu chuyển lên quá 256kb khi có nhiều địa chỉ dài | Code review lần 2 | Gửi theo từng nhóm 50 mục |
| Mục dữ liệu lỗi bị giữ lại mãi và báo lỗi ở mỗi lần đăng nhập | Code review lần 2 | Máy chủ tách mục lỗi (`invalid`) khỏi mục vượt giới hạn (`rejected`) |
| Chạy ứng dụng lần thứ hai chiếm mất file khóa của ứng dụng đang chạy | Code review lần 2 | Từ chối khởi động khi ứng dụng khác đang dùng CSDL |
| Phục hồi từ bản sao chép nguyên trạng làm mất dữ liệu trong file WAL | Code review lần 2 | Sao chép cả file WAL đi kèm |
| Hai lần phục hồi liên tiếp có thể ghi đè bản lưu trước khi phục hồi | Code review lần 2 | Tên file kèm mili giây, từ chối nếu file đã tồn tại |
| Test để lại server mở khi thất bại làm `npm test` treo | Kiểm tra đỏ-xanh | Server phụ trong test luôn được đóng bằng `t.after` |

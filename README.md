# Giá Vàng

Website nội bộ HTML/CSS/JS thuần, không build, không backend: `index.html` → đăng nhập (`login.html`)
→ **dashboard giá vàng** (`dashboard.html`, phần 0) → quản lý tài khoản cho ADMIN (`admin.html`, từ phần 1 trở đi).

---

## 0. Giá vàng trong dashboard (`dashboard.html`)

Chạy tại `https://hoanganh2503.github.io/gia_vang/` (sau khi đăng nhập). Toàn bộ dữ liệu do **trình duyệt gọi trực tiếp** các API
miễn phí, không key, có CORS — không dùng GitHub Actions, không có thư mục `data/` do máy tự ghi.
Đặc tả gốc ở `SPEC.md`; các điểm khác đặc tả được liệt kê ở cuối mục này.

| Khối | Nguồn | Làm mới |
|---|---|---|
| 1. Giờ thế giới | `Intl.DateTimeFormat` | mỗi giây |
| 2. Biểu đồ nến XAU/USD | Widget TradingView Advanced Chart `OANDA:XAUUSD` | liên tục |
| 3. Vàng thế giới + quy đổi VND | `api.gold-api.com/price/XAU` + fawazahmed0 currency-api (`usd.vnd`) | 10 giây (tỷ giá: 30 phút, nguồn chỉ đổi theo ngày) |
| 4. DXY | Tự tính từ currency-api (công thức ICE), so với ngày trước | 30 phút |
| 5. Dầu WTI | Widget TradingView Single Quote `TVC:USOIL` | liên tục |
| 6. Bạc | `api.gold-api.com/price/XAG`, tỷ lệ vàng/bạc | 10 giây |
| 7. Biểu đồ trong nước | `vang.today/api/prices?type=…&days=1100` (≈ 1 năm lịch sử) + đường thế giới quy đổi từ currency-api theo ngày | 30 phút |
| 8. Bảng giá trong nước | `vang.today/api/prices` (SJC, DOJI, PNJ HN, Bảo Tín Minh Châu, VN Gold, VietinBank Gold) + API JSON của PNJ (`edge-cf-api.pnj.io`) | 10 giây |

### Cấu trúc

```text
dashboard.html   # khung sidebar/header/đăng xuất có sẵn + các khối giá vàng
css/gold.css     # style riêng cho khối giá vàng, nạp sau css/style.css
js/dashboard.js  # kiểm tra phiên, chuyển mục; phát sự kiện app:ready khi phiên hợp lệ
js/gold/         # ES module, chỉ chạy sau app:ready
  main.js        # khởi động, hẹn giờ làm mới, tạm dừng khi tab ẩn
  config.js      # URL nguồn, mã sản phẩm, múi giờ, chu kỳ làm mới
  api.js         # fetchJSON (timeout + nhiều URL dự phòng), cache localStorage
  format.js      # định dạng số, tiền, thời gian kiểu Việt Nam
  ui.js          # nhãn trạng thái thẻ, nút Thử lại, nhúng widget TradingView
  clock.js       # khối 1
  world-gold.js  # khối 2, 3
  markets.js     # khối 4, 5, 6
  domestic.js    # khối 7, 8
```

Các mục trong sidebar (theo `#hash`): `#overview` Tổng quan (thẻ chỉ số + bảng giá trong nước),
`#world-chart` Biểu đồ XAU/USD, `#history` Diễn biến trong nước, `#notes` Ghi chú, và Quản trị (chỉ ADMIN).
Giờ thế giới và thời điểm cập nhật giá nằm trong sidebar. Màn hình ≤ 860 px: sidebar mở bằng nút ☰.

Muốn đổi chu kỳ làm mới: sửa `REFRESH_MS` / `SLOW_REFRESH_MS` trong `js/gold/config.js`.

### Cấu trúc dữ liệu thật đã kiểm tra (15/11/2026)

- **gold-api.com**: `{ "price": 3887.6, "updatedAt": "…Z", "symbol": "XAU" }`.
- **currency-api**: `{ "date": "2026-11-14", "usd": { "vnd": …, "eur": …, "xau": …, "xag": … } }`. `usd.xau` là ounce/USD → giá = `1 / usd.xau`. Có bản theo ngày `@YYYY-MM-DD`, dùng cho đường thế giới quy đổi trong khối 7 (lấy mẫu mỗi 1/2/7 ngày tùy khoảng xem, kết quả từng ngày được lưu vĩnh viễn trong localStorage).
- **vang.today**: `prices.<MÃ>.{ name, buy, sell, change_sell, currency }`, đơn vị **đồng/lượng**. Mã chính: `SJL1L10` (SJC miếng), `SJ9999` (nhẫn SJC). Bảng mã → tên ở `VANG_TODAY_CODES` trong `config.js`; mã mới chưa khai báo vẫn hiện với tên gốc.
- **PNJ**: `data[].{ masp, tensp, giamua, giaban }`, đơn vị **nghìn đồng/chỉ** → nhân 10.000 ra đồng/lượng. `zone=00` là TP.HCM.

### Khác với `SPEC.md`

- **Không dùng GitHub Actions / `scripts/` / `data/*.json`** — theo yêu cầu "chỉ HTML, CSS, JS". GitHub Pages để nguyên *Deploy from a branch* (main, `/`).
- **Giá trong nước gọi thẳng từ trình duyệt**: PNJ và vang.today đều trả `Access-Control-Allow-Origin: *`, không cần key. BTMC cần key và bị chặn CORS → lấy giá Bảo Tín Minh Châu qua vang.today. Tỷ giá Vietcombank bị chặn CORS → bỏ, dùng tỷ giá thị trường của currency-api.
- **Lịch sử trong nước** lấy sẵn từ vang.today (≈ 358 ngày) thay vì tự tích lũy.
- **WTI** dùng widget TradingView vì không có nguồn giá dầu miễn phí, không key mà trình duyệt gọi được (API Ninjas / EIA cần key, không được để lộ trong code).
- **Thay đổi của vàng/bạc** tính so với giá tham chiếu theo ngày của currency-api (ghi rõ ngày), không phải đúng 24 giờ.
- **Làm mới 10 giây** cho giá vàng/bạc và giá trong nước. Mỗi giá được tô xanh ▲ nếu lần thay đổi gần nhất là tăng, đỏ ▼ nếu giảm, và nháy nền khi vừa đổi (giá trước lưu trong localStorage `gv:ticks`, nên tải lại trang vẫn giữ màu).

### Rủi ro cần biết

- vang.today và endpoint PNJ là API **không chính thức**, có thể đổi cấu trúc hoặc tắt CORS bất cứ lúc nào. Khi đó khối tương ứng hiện dữ liệu đã lưu (nhãn "Dữ liệu lúc HH:mm") hoặc "Chưa tải được" + nút Thử lại; các khối khác vẫn chạy.
- Widget TradingView có thể bị trình chặn quảng cáo chặn → hiện khung thông báo kèm link.
- Mỗi người xem gọi các API này mỗi 10 giây (khoảng 4 request) từ trình duyệt của họ; nếu lượng truy cập lớn, nguồn có thể giới hạn tần suất.

---

# Khu vực nội bộ (bản mẫu tĩnh)

Website mẫu có trang đăng nhập, dashboard và phân luồng hai vai trò **ADMIN** / **MEMBER**.
Viết bằng HTML, CSS và JavaScript thuần, không framework, không backend, có thể chạy trên GitHub Pages
hoặc bất kỳ hosting tĩnh nào.

> ⚠️ **Đây KHÔNG phải hệ thống bảo mật.** Mọi kiểm tra đăng nhập đều chạy trên trình duyệt.
> Đọc kỹ mục [Giới hạn bảo mật](#giới-hạn-bảo-mật) trước khi đưa nội dung thật lên.

---

## 1. Chức năng

| Chức năng | Trạng thái |
|---|---|
| Trang đăng nhập (hiện/ẩn mật khẩu, thông báo lỗi) | ✅ |
| Băm mật khẩu PBKDF2-SHA256 + salt riêng (Web Crypto API) | ✅ |
| Dashboard: sidebar, header, tên, vai trò, đăng xuất | ✅ |
| MEMBER chỉ xem nội dung | ✅ |
| Trang ADMIN (`admin.html`): thống kê, tìm kiếm, lọc theo trạng thái | ✅ |
| ADMIN tạo / khóa / mở khóa / sửa role & mật khẩu / xóa tài khoản (có xác nhận) | ✅ |
| Nhập CSV từ máy, xuất CSV mới để tải lên máy chủ | ✅ |
| Đọc danh sách tài khoản từ `data/users.csv` trên máy chủ | ✅ |
| Kiểm tra CSV: header, số cột, username, hash, role, status, trùng lặp | ✅ |
| Kiểm tra lại CSV mỗi 60 giây → đăng xuất tài khoản bị khóa/xóa/đổi mật khẩu | ✅ (chỉ "cổng mềm", xem giới hạn) |
| Phiên hết hạn sau 8 giờ hoặc khi đóng tab | ✅ |
| Công cụ tạo dòng CSV có hash: `tools/hash.html` | ✅ |
| Lưu thay đổi thẳng lên máy chủ | ❌ Website tĩnh không ghi được lên máy chủ — ADMIN xuất CSV rồi tự tải lên |

## 2. Cấu trúc thư mục

```text
gia_vang/
├── index.html          # Chuyển hướng sang login.html
├── login.html          # Trang đăng nhập
├── dashboard.html      # Dashboard giá vàng sau đăng nhập (MEMBER + ADMIN), xem phần 0
├── admin.html          # Quản lý tài khoản (chỉ ADMIN)
├── tools/
│   └── hash.html       # Công cụ tạo dòng CSV có mật khẩu đã băm
├── css/
│   └── style.css
├── js/
│   ├── app.js          # Toast, hộp xác nhận, sidebar/header, nút hiện/ẩn mật khẩu
│   ├── csv.js          # Đọc + kiểm tra CSV
│   ├── password.js     # Băm / kiểm tra mật khẩu (PBKDF2)
│   ├── auth.js         # Đăng nhập, phiên, kiểm tra lại trạng thái
│   ├── login.js        # Form đăng nhập
│   ├── dashboard.js    # Dashboard, điều hướng
│   └── admin.js        # Trang quản trị tài khoản
├── assets/
│   └── logo.svg
├── data/
│   └── users.csv       # CHỈ chứa tài khoản DEMO
├── .gitignore
└── README.md
```

## 3. Chạy thử trên máy

Trình duyệt không cho `fetch()` file khi mở trực tiếp bằng `file://`, nên cần một web server tĩnh bất kỳ:

- **VS Code**: cài extension *Live Server* → chuột phải `index.html` → *Open with Live Server*.
- Hoặc nếu máy có sẵn Python: `python -m http.server 8000` trong thư mục dự án, rồi mở `http://localhost:8000`.

Tài khoản demo (trong `data/users.csv`):

| Username | Mật khẩu | Role | Status |
|---|---|---|---|
| admin | `Admin@123` | admin | active |
| user01 | `User01@123` | member | active |
| user02 | `User02@123` | member | disabled → bị từ chối |

**Xóa hoặc thay toàn bộ tài khoản demo trước khi dùng thật.**

## 4. Định dạng CSV

```csv
username,password_hash,role,status
admin,pbkdf2_sha256$210000$<salt_base64>$<hash_base64>,admin,active
user01,pbkdf2_sha256$210000$<salt_base64>$<hash_base64>,member,active
```

| Cột | Quy tắc |
|---|---|
| `username` | 3–32 ký tự: chữ, số, `.`, `_`, `-`. Không phân biệt hoa/thường khi đăng nhập. |
| `password_hash` | Tạo bằng `tools/hash.html`. Không bao giờ ghi mật khẩu gốc. |
| `role` | `admin` hoặc `member` |
| `status` | `active` hoặc `disabled` |

Khi đọc CSV, website sẽ:
- Từ chối toàn bộ file nếu header sai.
- Bỏ qua dòng sai số cột, username không hợp lệ, hash sai định dạng, role/status không hợp lệ.
- Nếu một username xuất hiện nhiều lần → **bỏ qua tất cả** các dòng đó (tài khoản đó không đăng nhập được) để tránh dùng nhầm dòng cũ.
- Ghi danh sách lỗi vào Console của trình duyệt (F12) để ADMIN kiểm tra.

## 5. Quản lý tài khoản

Đăng nhập bằng tài khoản ADMIN → sidebar → **Quản trị** (`admin.html`).
Trang này tải `data/users.csv` từ máy chủ và hiển thị danh sách.

| Việc cần làm | Cách làm |
|---|---|
| **Tạo tài khoản** | Bấm **+ Tạo tài khoản**, nhập username, mật khẩu (≥ 10 ký tự), role, status. Mật khẩu được băm ngay trong trình duyệt. |
| **Khóa tài khoản** | Bấm **Khóa** ở dòng tương ứng → xác nhận. |
| **Mở khóa** | Bấm **Mở khóa**. |
| **Đổi role / mật khẩu** | Bấm **Sửa**. Để trống ô mật khẩu nếu không đổi. |
| **Xóa tài khoản** | Bấm **Xóa** → xác nhận. |
| **Nhập CSV** | Bấm **Nhập CSV**, chọn file. File được kiểm tra; dòng lỗi bị bỏ qua và liệt kê ra. Sau khi xác nhận, file **thay toàn bộ** danh sách đang sửa. |
| **Xuất CSV** | Bấm **Xuất CSV** → được file `users.csv` (Chrome/Edge cho chọn chỗ lưu, trình duyệt khác tải về thư mục Downloads). |
| **Tải lại** | Bỏ mọi thay đổi chưa xuất và tải lại file đang có trên máy chủ. |

**Quan trọng:** mọi thay đổi chỉ nằm trong trình duyệt của bạn cho đến khi bạn **xuất CSV và tải file đó lên
máy chủ**, đè vào `data/users.csv`. Thanh màu vàng "Có thay đổi chưa xuất" nhắc việc này. Bản nháp được giữ
khi tải lại trang nhưng mất khi đóng tab.

Sau khi file mới đã lên máy chủ, các phiên đang mở của tài khoản bị khóa / xóa / đổi mật khẩu sẽ bị đăng xuất
ở lần kiểm tra kế tiếp (≤ 60 giây, hoặc ngay khi người đó quay lại tab) — **với điều kiện người dùng không can
thiệp mã nguồn**.

Các ràng buộc để tránh tự khóa mình:
- Không thể tự khóa, tự xóa, hay tự hạ quyền tài khoản đang đăng nhập.
- Luôn phải còn ít nhất một ADMIN đang hoạt động.
- File nhập vào phải có chính bạn là ADMIN đang hoạt động.

Vẫn có thể sửa `users.csv` bằng tay; dùng `tools/hash.html` để tạo dòng có hash mật khẩu.
Nên giữ một bản sao lưu ở nơi riêng tư (không phải repo công khai).

Mẹo: lưu file bằng UTF-8, không thêm dòng trống giữa các dòng; mở bằng Excel có thể làm hỏng
dấu `$` / `=` trong hash — nên dùng trình soạn thảo văn bản (VS Code, Notepad++).

## 6. Triển khai GitHub Pages

1. Tạo repository mới trên GitHub (nên **Private** nếu tài khoản có hỗ trợ Pages cho repo private;
   repo Public thì mọi file đều xem được).
2. Đưa mã nguồn lên:
   ```bash
   git init
   git add .
   git commit -m "init"
   git branch -M main
   git remote add origin https://github.com/<user>/<repo>.git
   git push -u origin main
   ```
3. Kiểm tra `.gitignore` và chạy `git ls-files data/` — chỉ được thấy file demo.
4. Đảm bảo **không** có CSV chứa tài khoản thật trong lịch sử commit.
5. Vào **Settings** → **Pages**.
6. *Source*: **Deploy from a branch**.
7. *Branch*: **main**, thư mục **/ (root)**.
8. **Save**, chờ 1–2 phút.
9. Truy cập đường dẫn được cung cấp, dạng `https://<user>.github.io/<repo>/`.

> Lưu ý: với GitHub Pages, cập nhật `users.csv` = commit + push file đó, nghĩa là file tài khoản
> **nằm trong repo**. Nếu repo public, ai cũng tải được. Nếu cần giữ danh sách tài khoản riêng tư,
> hãy dùng hosting khác (xem mục 8).

## 7. Giới hạn bảo mật

Hãy đọc phần này như một cam kết minh bạch, không phải lời khuyên tùy chọn.

**Website tĩnh (GitHub Pages hoặc bất kỳ hosting tĩnh nào) không có backend, nên:**

1. **Nội dung "riêng tư" không được bảo vệ.** `dashboard.html` là file công khai. Ai biết đường dẫn
   đều mở được bằng *View Source*, `curl`, hoặc tắt JavaScript. Trang đăng nhập chỉ là cổng mềm.
2. **`data/users.csv` là công khai.** Trình duyệt phải tải file này về để kiểm tra mật khẩu, nên ai cũng
   tải được. Hash PBKDF2 (210.000 vòng, salt riêng) làm việc dò mật khẩu **chậm hơn**, không phải
   **không thể** — mật khẩu yếu vẫn sẽ bị dò ra.
3. **Phân quyền chỉ là giao diện.** Role được đọc lại từ CSV mỗi lần (không tin sessionStorage), nhưng
   người dùng vẫn có thể sửa JavaScript để mở `admin.html`. Họ cũng chỉ xem được những gì đã công khai
   (danh sách trong CSV) và tạo được một file CSV trên máy họ — **không** ghi được lên máy chủ. Quyền thật
   sự nằm ở chỗ ai có quyền tải file lên máy chủ.
4. **Khóa tài khoản không có hiệu lực tức thì và không được đảm bảo.** Việc đăng xuất phiên bị khóa dựa
   vào JavaScript chạy trên máy người dùng. Người cố ý có thể chặn việc kiểm tra lại, hoặc đơn giản là
   đã lưu nội dung trang từ trước. Không có cách thu hồi quyền truy cập trên thiết bị khác.
5. **Không có giới hạn số lần đăng nhập sai** có ý nghĩa — kẻ tấn công dò offline trên file CSV đã tải về.
6. **CDN/cache:** GitHub Pages có thể cache file CSV vài phút; thay đổi status có thể chậm hơn 60 giây.

**Phù hợp để:** demo, tài liệu nội bộ không nhạy cảm, phân luồng người dùng cho tiện.
**Không phù hợp để:** dữ liệu cá nhân, tài chính, hợp đồng, hay bất cứ thứ gì gây hại nếu lộ ra.

## 8. Nếu cần bảo mật thật

Yêu cầu "chỉ HTML/CSS/JS + GitHub Pages" và yêu cầu "bảo mật thật + khóa tức thì" **mâu thuẫn nhau**.
Cần có một thành phần phía máy chủ kiểm tra quyền **trước khi** trả nội dung. Một số hướng (đều có gói miễn phí,
nhưng phải tự kiểm tra điều khoản và giới hạn):

- **Cloudflare Pages + Cloudflare Access (Zero Trust)**: đặt website tĩnh sau lớp đăng nhập do Cloudflare quản lý;
  khóa người dùng có hiệu lực ngay. Giữ nguyên toàn bộ HTML/CSS/JS, chỉ bỏ phần đăng nhập tự viết.
- **Máy chủ riêng (Nginx/Apache)** với HTTP Basic Auth hoặc một backend nhỏ; đặt `users.csv` **ngoài**
  thư mục public và để máy chủ đọc nó.
- **Mã hóa nội dung phía client** (Web Crypto, AES-GCM, khóa sinh từ mật khẩu): nội dung trong repo là bản mã,
  chỉ giải được khi có mật khẩu. Bảo vệ được nội dung, nhưng vẫn không thu hồi được quyền của người đã có mật khẩu.

Nếu bạn định "up file CSV lên server", hãy đảm bảo server đó **không phục vụ file CSV công khai**
và tự kiểm tra đăng nhập — khi đó phần kiểm tra trong `auth.js` nên được chuyển sang server.

## 9. Tuyệt đối không làm với dữ liệu tài khoản thật

- ❌ Commit file CSV chứa tài khoản thật vào repo công khai (kể cả commit rồi xóa — lịch sử git vẫn giữ).
- ❌ Ghi mật khẩu gốc vào CSV, HTML, JS, README, issue, hay tin nhắn commit.
- ❌ Dùng Base64 hay "mã hóa" tự chế thay cho băm mật khẩu.
- ❌ Dùng mật khẩu ngắn/dễ đoán (CSV công khai → có thể dò offline). Dùng ≥ 12 ký tự ngẫu nhiên.
- ❌ Dùng lại mật khẩu của email, ngân hàng... cho website này.
- ❌ Đặt dữ liệu thật sự bí mật vào `dashboard.html`.
- ❌ Mở CSV bằng Excel rồi lưu đè (dễ hỏng hash).
- ❌ Coi việc ẩn nút ADMIN là phân quyền.

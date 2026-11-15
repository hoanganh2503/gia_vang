# Spec: Website giá vàng (repo gia_vang)

Nov 15, 2026 · @Hoàng Anh

> **Ghi chú triển khai (15/11/2026):** người dùng yêu cầu bổ sung *"chỉ dùng HTML, CSS, JS, dữ liệu làm mới 1 phút/lần"*.
> Vì vậy **không** làm Lớp B (GitHub Actions, `scripts/`, `data/*.json`); mọi nguồn được gọi từ trình duyệt.
> Chi tiết các điểm khác đặc tả: README.md → mục 0 → "Khác với SPEC.md".

## 1. Mục tiêu và phạm vi

Xây một trang web tĩnh trong repo `hoanganh2503/gia_vang`, chạy tại https://hoanganh2503.github.io/gia_vang/, hiển thị 8 khối thông tin về giá vàng.

| # | Khối | Nguồn chính | Cập nhật |
|---|---|---|---|
| 1 | Giờ thế giới | JavaScript Intl (không cần API) | Mỗi giây |
| 2 | Biểu đồ nến vàng thế giới | Widget TradingView OANDA:XAUUSD | Liên tục |
| 3 | Quy đổi vàng thế giới sang VND | gold-api.com + fawazahmed0 currency-api | 60 giây (giá vàng), hằng ngày (tỷ giá) |
| 4 | Chỉ số DXY | Tự tính từ currency-api | Hằng ngày |
| 5 | Giá dầu WTI | API Ninjas hoặc EIA, qua GitHub Actions | Hằng ngày |
| 6 | Giá bạc thế giới | gold-api.com XAG | 60 giây |
| 7 | Biểu đồ vàng trong nước | Lịch sử tự tích lũy trong data/ | Mỗi ngày một điểm |
| 8 | Giá vàng trong nước | PNJ, BTMC qua GitHub Actions | 30 phút |

Ngoài phạm vi: máy chủ backend, đăng nhập, bước build (npm build, bundler). Toàn bộ trang là HTML, CSS, JavaScript thuần để GitHub Pages phục vụ trực tiếp.

Repo có thể đã có sẵn file (ví dụ index.html). Phải đọc các file hiện có trước, giữ lại nội dung người dùng đã viết.

## 2. Ràng buộc kỹ thuật và kiến trúc

Dữ liệu đi theo hai lớp, vì GitHub Pages chỉ phục vụ file tĩnh và mọi lệnh gọi từ trình duyệt đều lộ ra cho người xem.

- **Lớp A – trình duyệt gọi trực tiếp:** chỉ dùng cho API không cần key và cho phép CORS: gold-api.com, fawazahmed0 currency-api, widget TradingView.
- **Lớp B – GitHub Actions chạy định kỳ:** gọi các nguồn bị chặn CORS hoặc cần key (PNJ, BTMC, Vietcombank, API Ninjas/EIA), ghi vào `data/` dạng JSON, commit, deploy. *(Không triển khai — xem ghi chú đầu trang.)*

Quy tắc bắt buộc:

- Không bao giờ đặt API key trong code hoặc commit vào repo.
- Không có bước build. Thư viện ngoài nạp bằng thẻ `<script>` từ jsDelivr hoặc cdnjs, ghim đúng phiên bản (ví dụ `chart.js@4.4.1`), không dùng `@latest`.
- JavaScript dạng ES module (`<script type="module">`), không framework.
- (Lớp B) Nguồn deploy GitHub Pages đổi sang "GitHub Actions"; lịch cron tối thiểu 5 phút, có thể trễ; workflow có thể bị tắt sau 60 ngày không hoạt động.

## 3. Cấu trúc thư mục (theo đặc tả gốc)

```text
gia_vang/
├── index.html
├── SPEC.md
├── README.md
├── assets/
│   ├── css/style.css
│   └── js/
│       ├── main.js        # khởi động, hẹn giờ làm mới
│       ├── config.js      # URL nguồn, múi giờ, hằng số
│       ├── api.js         # fetch có timeout + dự phòng
│       ├── format.js      # định dạng số, tiền, thời gian
│       ├── clock.js       # khối 1
│       ├── world-gold.js  # khối 2, 3
│       ├── markets.js     # khối 4, 5, 6
│       └── domestic.js    # khối 7, 8
├── data/                  # (Lớp B) do GitHub Actions ghi
├── scripts/fetch-data.mjs # (Lớp B)
└── .github/workflows/update-data.yml  # (Lớp B)
```

## 4. Nguồn dữ liệu từng khối

Trước khi viết code cho một nguồn, gọi thử bằng curl để xem cấu trúc JSON thật; nếu khác tài liệu, làm theo dữ liệu thật và ghi chú trong README.

**Khối 1 – Giờ thế giới.** `Intl.DateTimeFormat('vi-VN', { timeZone, hour, minute, second })`, cập nhật mỗi giây. Hà Nội (Asia/Ho_Chi_Minh), New York (America/New_York), London (Europe/London), Zurich (Europe/Zurich), Hồng Kông (Asia/Hong_Kong), Tokyo (Asia/Tokyo).

**Khối 2 – Biểu đồ nến vàng thế giới.** Widget Advanced Chart của TradingView, mã `OANDA:XAUUSD`, khung mặc định 1 giờ, `locale: "vi_VN"`, theme theo `prefers-color-scheme`. Dùng đoạn mã nhúng chính thức.

**Khối 3 – Quy đổi vàng thế giới sang VND.**
- Giá vàng USD/ounce: `GET https://api.gold-api.com/price/XAU`.
- Tỷ giá USD/VND: `GET https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json`, đọc `usd.vnd`. Dự phòng: `https://latest.currency-api.pages.dev/v1/currencies/usd.min.json`.
- Tỷ giá Vietcombank (tùy chọn, qua Actions).
- VND/lượng = USD/oz × USDVND × 37,5 / 31,1034768. Hiển thị VND/lượng, VND/chỉ, và chênh lệch giá bán vàng miếng SJC trong nước so với giá thế giới quy đổi (số tiền và %).

**Khối 4 – DXY.** EURUSD = 1/usd.eur, USDJPY = usd.jpy, GBPUSD = 1/usd.gbp, USDCAD = usd.cad, USDSEK = usd.sek, USDCHF = usd.chf.
DXY = 50,14348112 × EURUSD^−0,576 × USDJPY^0,136 × GBPUSD^−0,119 × USDCAD^0,091 × USDSEK^0,042 × USDCHF^0,036.
Thay đổi so với hôm trước: gọi `currency-api@YYYY-MM-DD` ngày trước. Ghi nhãn "DXY tính từ tỷ giá, cập nhật theo ngày".

**Khối 5 – WTI.** (Lớp B) API Ninjas (`X-Api-Key`) hoặc EIA API v2 (RWTC). Có thể kèm widget TradingView `TVC:USOIL`.

**Khối 6 – Bạc.** `GET https://api.gold-api.com/price/XAG`. USD/ounce, thay đổi, tỷ lệ vàng/bạc = XAU ÷ XAG.

**Khối 7, 8 – Giá vàng trong nước.** PNJ (host `edge-cf-api.pnj.io`), BTMC (`api.btmc.vn`, cần key), SJC (tùy chọn). Nguồn nào lỗi thì bỏ qua, giữ dữ liệu cũ. Chuẩn hóa về VND/lượng. Tối thiểu: vàng miếng SJC và vàng nhẫn 9999.

## 5. GitHub Actions

(Không triển khai — xem ghi chú đầu trang.)

## 6. Giao diện

Một trang, đọc tốt ở 375 px và màn hình máy tính, sáng/tối theo hệ thống.

1. Thanh tiêu đề: tên trang, thời điểm cập nhật gần nhất.
2. Dải đồng hồ (khối 1): cuộn ngang trên điện thoại.
3. Lưới thẻ chỉ số: vàng + quy đổi (3), bạc (6), DXY (4), WTI (5). 4 cột / 2 cột / 1 cột.
4. Biểu đồ nến (khối 2): rộng đầy đủ, cao ~500 px (máy tính), 360 px (điện thoại).
5. Bảng giá trong nước (khối 8): Nguồn · Loại vàng · Mua vào · Bán ra · Chênh lệch mua–bán, kèm dòng chênh lệch so với thế giới quy đổi.
6. Biểu đồ trong nước (khối 7): giá bán SJC, giá bán nhẫn 9999, thế giới quy đổi; nút 1 tháng / 3 tháng / 1 năm / Tất cả; Chart.js ghim phiên bản. Dưới 2 điểm: "Đang tích lũy dữ liệu, biểu đồ sẽ hiện sau vài ngày".
7. Chân trang: danh sách nguồn có link, "Thông tin chỉ mang tính tham khảo, không phải lời khuyên đầu tư".

Thẻ chỉ số: tên, giá trị chính, thay đổi (số và %), nguồn, thời điểm cập nhật. Tăng xanh lá, giảm đỏ, kèm mũi tên.

Định dạng: VND `Intl.NumberFormat('vi-VN')` (143.800.000; điện thoại có thể 143,8 tr); USD 2 chữ số thập phân (4.050,12); thời gian giờ Việt Nam dạng 09:30 15/11/2026.

Làm mới: đồng hồ mỗi giây; ~~gold-api 60 giây~~ **dữ liệu giá 1 phút** (yêu cầu bổ sung); currency-api khi tải trang và mỗi 30 phút; tạm dừng khi tab ẩn, làm mới ngay khi quay lại.

## 7. Xử lý lỗi, dự phòng và cache

- `fetchJSON(urls, { timeout = 8000 })` thử lần lượt từng URL.
- Tải các khối song song bằng `Promise.allSettled`; mỗi khối tự hiển thị lỗi.
- Lưu giá trị tốt gần nhất vào localStorage; khi lỗi hiện giá trị đã lưu với nhãn "Dữ liệu lúc HH:mm", không có thì "Chưa tải được" + nút Thử lại.
- Dữ liệu cũ hơn 2 giờ → nhãn "Dữ liệu cũ".
- Widget TradingView không tải được → khung thông báo kèm link.
- Trình duyệt không gọi API cần key.
- Không có lỗi trong Console khi mọi nguồn hoạt động bình thường.

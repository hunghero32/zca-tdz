# HƯỚNG DẪN VẬN HÀNH & KẾT NỐI HỆ THỐNG ZCA-BRIDGE & CHATWOOT
## (Comprehensive Operations Manual & Walkthrough Guide)

> **Dự án**: Tích hợp ZaloCRM Bridge (ZCA-Bridge) và Nền tảng Hỗ trợ Khách hàng Chatwoot (Account ID 1)  
> **Môi trường**: Hệ thống Sản xuất erp365.vn · Ubuntu 24.04 LTS · Docker Engine 28.0.0  
> **Phiên bản tài liệu**: 2.0.0 (Cập nhật: Tháng 11/2026)  
> **Ngôn ngữ chính**: Tiếng Việt (kèm thuật ngữ kỹ thuật tiếng Anh chuẩn hóa)

---

## MỤC LỤC TỔNG QUÁT (Table of Contents)

1. [Tổng quan Kiến trúc & Nguyên lý Vận hành (System Overview & Architecture)](#1-tổng-quan-kiến-trúc--nguyên-lý-vận-hành)
   - 1.1 Sơ đồ Khối Kiến trúc Hệ thống (System Architecture Diagram)
   - 1.2 Luồng Dữ liệu Đồng bộ Tin nhắn 2 Chiều (Bidirectional Message Flows)
   - 1.3 Hạ tầng Mạng Docker Bridge & Bản đồ Cổng Dịch vụ (Ports & Network Map)
2. [Phương thức Truy cập Admin Console (Accessing Admin Console — Requirement R3)](#2-phương-thức-truy-cập-admin-console)
   - 2.1 Phương thức 1: Reverse Proxy Nginx qua Tên miền SSL (Khuyến nghị cho Quản trị Web)
   - 2.2 Phương thức 2: Truy cập Cục bộ LAN / Localhost qua Cổng 4000
   - 2.3 Phương thức 3: Đường hầm Bảo mật SSH Port Forwarding (SSH Tunnel)
   - 2.4 Lưu ý Kỹ thuật về NAT Loopback / Hairpinning trên IP WAN 123.24.6.74
3. [Xác thực & Cơ chế Bảo mật Hệ thống (Authentication & Security Model)](#3-xác-thực--cơ-chế-bảo-mật-hệ-thống)
   - 3.1 Thông tin Tài khoản Quản trị viên Mặc định (Admin Credentials)
   - 3.2 Cơ chế Băm Mật khẩu Scrypt & Quản lý Phiên Cookie (Signed Session Cookies)
   - 3.3 Cơ chế Mã hóa Dữ liệu Nhạy cảm Cơ sở Dữ liệu (AES-256-GCM Encryption)
4. [Hướng dẫn Chi tiết 4 Phân hệ Giao diện Admin Console (UI Walkthrough)](#4-hướng-dẫn-chi-tiết-4-phân-hệ-giao-diện-admin-console)
   - 4.1 Tab 1: "Tài khoản" (Accounts Management)
   - 4.2 Tab 2: "Nhật ký" (System & Bridge Logs)
   - 4.3 Tab 3: "Cấu hình" (Settings Configuration)
   - 4.4 Tab 4: "Proxy" (Proxy Pool Management)
5. [Hướng dẫn Từng Bước Kết nối Zalo Cá nhân (Zalo Personal QR Walkthrough)](#5-hướng-dẫn-từng-bước-kết-nối-zalo-cá-nhân)
   - 5.1 Quy trình 5 Bước Kết nối bằng Mã QR Code
   - 5.2 Cơ chế Lưu trữ & Tự động Khôi phục Phiên (Session Persistence & Auto-Refresh)
   - 5.3 Quản trị Từ xa / Máy chủ Không màn hình (Headless Server QR Image Access)
6. [Hướng dẫn Từng Bước Kết nối Zalo Official Account (Zalo OA Walkthrough)](#6-hướng-dẫn-từng-bước-kết-nối-zalo-official-account)
   - 6.1 Thiết lập Thông số trên Zalo Developer Portal
   - 6.2 Quy trình 5 Bước Cấp quyền OAuth qua Admin Console
   - 6.3 Cơ chế Lưu trữ & Tự động Làm mới Access Token của Zalo OA
7. [Thiết lập & Quản trị Hộp thư trên Chatwoot (Chatwoot Configuration Walkthrough)](#7-thiết-lập--quản-trị-hộp-thư-trên-chatwoot)
   - 7.1 Truy cập Giao diện Chatwoot tại `https://chat.erp365.vn`
   - 7.2 Cấu hình 2 Hộp thư Kênh API (Inbox 2: Zalo OA & Inbox 3: Zalo Personal)
   - 7.3 Thiết lập Outgoing Webhook Tích hợp Ngược về ZCA-Bridge
   - 7.4 Phân công Chuyên viên Hỗ trợ (Agent Assignments)
8. [Vận hành, Giám sát & Xử lý Sự cố Nâng cao (Operations, Maintenance & Troubleshooting)](#8-vận-hành-giám-sát--xử-lý-sự-cố-nâng-cao)
   - 8.1 Sửa lỗi Chặn Webhook Docker SSRF SafeFetch trong Chatwoot Sidekiq
   - 8.2 Sửa lỗi Database Sequences Trùng lặp trên Chatwoot (`conv_dpid_seq_1`, `camp_dpid_seq_1`)
   - 8.3 Sổ tay Lệnh CLI Chẩn đoán & Giám sát Nhanh (Healthcheck & Logs)
   - 8.4 Hướng dẫn Sao lưu & Khôi phục Cơ sở Dữ liệu và Khóa Mã hóa (Backup & Disaster Recovery)
   - 8.5 Bảng Tra cứu Lỗi Phổ biến & Biện pháp Khắc phục Tức thì (Troubleshooting Cheat Sheet)

---

## 1. TỔNG QUAN KIẾN TRÚC & NGUYÊN LÝ VẬN HÀNH

Hệ thống tích hợp giữa **Zalo (Zalo Personal Hotline & Zalo Official Account)** với nền tảng đa kênh **Chatwoot** được thiết kế nhằm đồng bộ hóa toàn diện hoạt động giao tiếp khách hàng vào một giao diện tập trung duy nhất. Nhân viên tư vấn có thể xử lý đồng thời cả tin nhắn từ tài khoản cá nhân (qua thư viện mô phỏng giao thức `zca-js`) và tài khoản doanh nghiệp được xác thực chính thức (Zalo OA Open API v3).

### 1.1 Sơ đồ Khối Kiến trúc Hệ thống (System Architecture Diagram)

```
       ┌─────────────────────────────────────────────────────────────┐
       │                      INTERNET / KHÁCH HÀNG                   │
       └──────────────┬───────────────────────────────┬──────────────┘
                      │ (Zalo App Mobile/Desktop)     │ (Zalo OA Webhook)
                      ▼                               ▼
       ┌───────────────────────────────┐ ┌───────────────────────────┐
       │   Zalo Personal Cloud Server  │ │  Zalo OA Open API Platform│
       └──────────────┬────────────────┘ └─────────────┬─────────────┘
                      │ Long-polling Socket            │ POST /webhooks/zalo-oa
                      ▼                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ MÁY CHỦ SẢN XUẤT erp365.vn (IP LAN: 192.168.1.10 · IP WAN: 123.24.6.74)    │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ DOCKER BRIDGE NETWORK: `chatwoot_default` (Subnet: 172.21.0.0/16)     │  │
│  │                                                                       │  │
│  │  ┌────────────────────────────────┐  ┌─────────────────────────────┐  │  │
│  │  │ Container: `zca-bridge`        │  │ Container: `zca-bridge-db`  │  │  │
│  │  │ - Fastify 5.2.0 (Node.js 24)   │  │ - PostgreSQL 16 Alpine      │  │  │
│  │  │ - zca-js 2.1.2 protocol engine │◄─┤ - Port: 5432 (Nội bộ)       │  │  │
│  │  │ - Port: 4000 (Exposed host)    │  │ - DB: `zca_bridge`          │  │  │
│  │  └───────────────▲────────────────┘  └─────────────────────────────┘  │  │
│  │                  │                                                    │  │
│  │  HTTP Outbound   │ HTTP Inbound                                       │  │
│  │  Webhook:4000    │ Public Channel API:3000                            │  │
│  │                  ▼                                                    │  │
│  │  ┌────────────────────────────────┐  ┌─────────────────────────────┐  │  │
│  │  │ Container: `chatwoot_rails`    │  │ Container: `chatwoot_sidekiq│  │  │
│  │  │ - Ruby on Rails 7.0 (API)      │  │ - Background Queue Worker   │  │  │
│  │  │ - Webhook Publisher            │◄─┤ - WebhookJob Dispatcher     │  │  │
│  │  │ - Internal URL: :3000          │  │ - SafeFetch SSRF Bypass     │  │  │
│  │  └────────────────────────────────┘  └─────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                     ▲                                       │
│                                     │ Reverse Proxy Loopback                │
│  ┌──────────────────────────────────┴────────────────────────────────────┐  │
│  │ NGINX WEB SERVER & REVERSE PROXY LAYER (Host Ports 80 & 443)          │  │
│  │ - `zca.erp365.vn`  ──► Proxy tới http://127.0.0.1:4000 (ZCA Admin)    │  │
│  │ - `chat.erp365.vn` ──► Proxy tới http://127.0.0.1:3200 (Chatwoot UI)  │  │
│  │ - SSL/TLS Wildcard Let's Encrypt Certificate                         │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Luồng Dữ liệu Đồng bộ Tin nhắn 2 Chiều (Bidirectional Message Flows)

Hệ thống hoạt động theo nguyên lý định tuyến phi tập trung, tách biệt rõ ràng giữa chiều thu nhận (Inbound) và chiều gửi đi (Outbound).

#### A. Luồng Tin nhắn Chiều vào (Inbound: Khách hàng Zalo ➔ Chatwoot Inbox)

1. **Khách hàng nhắn tin tới Zalo Cá nhân (Hotline)**:
   - Module `zca-js` bên trong container `zca-bridge` duy trì kết nối WebSocket / Long-polling bảo mật tới cụm máy chủ Zalo bằng Cookie phiên đã giải mã.
   - Khi có tin nhắn phát sinh, sự kiện `message` được kích hoạt.
   - `InboundHandler` của ZCA-Bridge tiến hành bóc tách định dạng, tải dữ liệu media (ảnh, file, ghi âm nếu có), kiểm tra mã kiểm tra trùng lặp (`message_dedup`), và gọi Chatwoot Public API:
     ```http
     POST http://chatwoot_rails:3000/public/api/v1/inboxes/HkzhKDhqUJDv24RpTrWy2N6K/contacts
     POST http://chatwoot_rails:3000/public/api/v1/inboxes/HkzhKDhqUJDv24RpTrWy2N6K/contacts/:source_id/conversations
     POST http://chatwoot_rails:3000/public/api/v1/inboxes/HkzhKDhqUJDv24RpTrWy2N6K/contacts/:source_id/conversations/:conv_id/messages
     ```
   - Tin nhắn hiển thị ngay lập tức trong Inbox ID 3 ("Zalo Personal") trên giao diện của nhân viên trực chat.

2. **Khách hàng nhắn tin tới Zalo Official Account (ERP 365)**:
   - Máy chủ Zalo Developer gửi một yêu cầu `POST /webhooks/zalo-oa` kèm Header `X-ZEvent-Signature: mac=sha256(appId + rawBody + timestamp + oaSecretKey)`.
   - ZCA-Bridge xác thực chữ ký số bằng thuật toán HMAC SHA-256 để chống giả mạo dữ liệu.
   - Xử lý các sự kiện `user_send_text`, `user_send_image`, `user_send_link`, `user_send_audio`, `user_send_video`.
   - Tin nhắn được chuyển tới Chatwoot Inbox ID 2 ("Zalo OA", định danh: `yZCfiJdkVx96ub8HrQiUAUid`).

#### B. Luồng Tin nhắn Chiều ra (Outbound: Chuyên viên Chatwoot ➔ Khách hàng Zalo)

1. **Nhân viên trả lời trên giao diện Chatwoot**:
   - Chatwoot Rails lưu bản ghi tin nhắn và đẩy tác vụ `WebhookJob` vào hàng đợi Redis của Sidekiq.
   - `chatwoot_sidekiq` thực hiện gửi HTTP POST tới Outgoing Webhook đã được đăng ký:
     ```http
     POST http://zca-bridge:4000/webhooks/chatwoot/69c46bc97a6d9d25282c8bb46561c687
     Content-Type: application/json

     {
       "event": "message_created",
       "message_type": "outgoing",
       "content": "Chào anh/chị! Em có thể hỗ trợ gì cho anh/chị ạ?",
       "inbox": { "id": 3 },
       "conversation": { "id": 12 },
       "sender": { "name": "Nguyễn Văn Hưng" }
     }
     ```
2. **Xử lý tại ZCA-Bridge**:
   - `OutboundHandler` phân tích `inbox.id`:
     - Nếu `inbox.id == 3` (Personal): Chuyển nội dung cho `zca-js` gửi qua kết nối socket của tài khoản cá nhân tới người nhận.
     - Nếu `inbox.id == 2` (OA): ZCA-Bridge trích xuất Access Token hợp lệ từ bảng `oa_tokens` (tự động refresh nếu hết hạn) và gọi Zalo Open API v3:
       ```http
       POST https://openapi.zalo.me/v3.0/oa/message/cs
       access_token: <ZALO_OA_ACCESS_TOKEN>
       ```
   - Khách hàng nhận được tin nhắn trên ứng dụng Zalo cá nhân trong vòng chưa đầy 500ms.

### 1.3 Hạ tầng Mạng Docker Bridge & Bản đồ Cổng Dịch vụ (Ports & Network Map)

| Container Name | Dịch vụ & Công nghệ | Cổng Nội bộ | Cổng Host Ánh xạ | Mạng Docker (Bridge) |
|---|---|---|---|---|
| `zca-bridge` | Node.js 24 + Fastify + zca-js | `4000` | `0.0.0.0:4000:4000` | `chatwoot_default` (172.21.0.3) |
| `zca-bridge-db` | PostgreSQL 16 Alpine | `5432` | Không ánh xạ ra ngoài | `chatwoot_default` (172.21.0.2) |
| `chatwoot_rails` | Ruby on Rails 7.0 | `3000` | `127.0.0.1:3200:3000` | `chatwoot_default` (172.21.0.5) |
| `chatwoot_sidekiq` | Sidekiq Background Worker | - | Không có cổng | `chatwoot_default` (172.21.0.4) |
| `nginx` (Host) | Nginx 1.26 Web Server | - | `80`, `443` | Cục bộ máy chủ Ubuntu Host |

---

## 2. PHƯƠNG THỨC TRUY CẬP ADMIN CONSOLE (Requirement R3)

Giao diện quản trị ZCA-Bridge Admin Console cung cấp quyền giám sát tài khoản, quét QR đăng nhập, xem log thời gian thực và cấu hình hệ thống. Quản trị viên có thể truy cập qua 3 phương thức linh hoạt:

### 2.1 Phương thức 1: Reverse Proxy Nginx qua SSL (Khuyến nghị cho Web Quản trị Từ xa)

Đây là phương thức tối ưu, an toàn và thuận tiện nhất khi truy cập qua trình duyệt từ máy tính xách tay, điện thoại di động hoặc mạng ngoài văn phòng.

- **Địa chỉ truy cập**: `https://zca.erp365.vn/admin/`
- **Giao thức**: HTTPS (TLS 1.2 / TLS 1.3), tự động mã hóa đầu cuối với chứng chỉ SSL Wildcard Let's Encrypt.
- **File cấu hình Nginx máy chủ**: `/www/server/panel/vhost/nginx/zca.conf`
- **Nội dung cấu hình tối ưu chuẩn hóa**:
  ```nginx
  server {
      listen 80;
      listen 443 ssl;
      server_name zca.erp365.vn;

      ssl_certificate /www/server/panel/vhost/cert/erp365.vn/fullchain.pem;
      ssl_certificate_key /www/server/panel/vhost/cert/erp365.vn/privkey.pem;
      ssl_protocols TLSv1.2 TLSv1.3;
      ssl_ciphers EECDH+CHACHA20:EECDH+AES128:EECDH+AES256:AES128+EECDH:AES256+EECDH;
      ssl_prefer_server_ciphers on;

      access_log /www/wwwlogs/zca.erp365.vn.log;
      error_log /www/wwwlogs/zca.erp365.vn.error.log;

      client_max_body_size 50M;

      location / {
          proxy_pass http://127.0.0.1:4000;
          proxy_http_version 1.1;
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
          proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
          proxy_set_header X-Forwarded-Proto $scheme;
          proxy_set_header Upgrade $http_upgrade;
          proxy_set_header Connection "upgrade";
          proxy_read_timeout 86400s;
          proxy_send_timeout 86400s;
          proxy_buffering off;
      }
  }
  ```

> **Ghi chú về phân giải tên miền (DNS)**: Nếu máy tính bên ngoài chưa cập nhật bản ghi DNS công khai cho `zca.erp365.vn`, bạn có thể thêm dòng sau vào file `hosts` cục bộ của máy tính quản trị (`C:\Windows\System32\drivers\etc\hosts` trên Windows hoặc `/etc/hosts` trên macOS/Linux):
> ```text
> 123.24.6.74 zca.erp365.vn
> ```

### 2.2 Phương thức 2: Truy cập Cục bộ LAN / Localhost qua Cổng 4000

Dành cho quản trị viên làm việc trực tiếp tại văn phòng trong cùng lớp mạng nội bộ (LAN) hoặc trên chính máy chủ:

- **Truy cập trực tiếp tại máy chủ**: `http://localhost:4000/admin/`
- **Truy cập qua mạng nội bộ LAN văn phòng**: `http://192.168.1.10:4000/admin/`
- Cổng 4000 đã được cấu hình mở tường lửa UFW:
  ```bash
  # Trạng thái mở cổng tường lửa
  sudo ufw status | grep 4000
  # Kết quả: 4000/tcp ALLOW IN Anywhere
  ```

### 2.3 Phương thức 3: Đường hầm Bảo mật SSH Port Forwarding (SSH Tunnel)

Dành cho Quản trị viên hệ thống (DevOps / SRE) cần truy cập tuyệt đối an toàn mà không cần cấu hình DNS hay mở cổng ra ngoài:

1. Chạy lệnh mở đường hầm SSH từ máy tính của bạn:
   ```bash
   ssh -L 4000:localhost:4000 tgs365@erp365.vn
   # Hoặc chỉ định rõ IP nếu DNS chưa trỏ:
   ssh -L 4000:localhost:4000 tgs365@123.24.6.74
   ```
2. Nhập mật khẩu tài khoản `tgs365`: `tgs365`
3. Mở trình duyệt bất kỳ trên máy tính của bạn và truy cập:
   ```text
   http://localhost:4000/admin/
   ```
   *Toàn bộ lưu lượng sẽ được mã hóa an toàn qua kênh SSH của bạn.*

### 2.4 Lưu ý Kỹ thuật về Hiện tượng NAT Loopback trên IP WAN (123.24.6.74:4000)

Khi bạn ngồi trực tiếp trên máy chủ hoặc trong mạng LAN nội bộ và gõ trực tiếp `http://123.24.6.74:4000/admin/`, trình duyệt có thể báo lỗi `Connection Timed Out`.  
**Nguyên nhân kỹ thuật**: Đây là đặc tính phổ biến của các thiết bị cân bằng tải hoặc Modem quang gia đình/doanh nghiệp nhỏ không hỗ trợ tính năng **NAT Hairpinning (NAT Loopback)**. Gói tin đi từ IP nội bộ tới IP WAN của chính cổng mạng đó sẽ bị Router hủy bỏ.  
**Giải pháp**: Sử dụng tên miền đã qua Nginx (`https://zca.erp365.vn/admin/`), sử dụng IP nội bộ (`http://192.168.1.10:4000/admin/`) hoặc SSH Tunnel như hướng dẫn ở trên.

---

## 3. XÁC THỰC & CƠ CHẾ BẢO MẬT HỆ THỐNG

### 3.1 Thông tin Tài khoản Quản trị viên Mặc định (Admin Credentials)

| Thuộc tính | Giá trị cấu hình | Mô tả |
|---|---|---|
| **Tên đăng nhập (Username)** | `tgs365vn@gmail.com` | Email quản trị viên hệ thống ERP-365 |
| **Mật khẩu (Password)** | `thegioiso365` | Mật khẩu chuẩn quản trị hệ thống (đồng bộ với aaPanel) |
| **Bảng lưu trữ** | `admin_users` | Nằm trong cơ sở dữ liệu `zca_bridge` (PostgreSQL) |

### 3.2 Cơ chế Băm Mật khẩu Scrypt & Quản lý Phiên Cookie (Signed Session Cookies)

Hệ thống ZCA-Bridge triển khai tiêu chuẩn mã hóa định danh cấp cao:
- **Thuật toán băm mật khẩu**: `scrypt` chuẩn của Node.js `crypto` với muối ngẫu nhiên (salt 16-byte) và độ dài khóa sinh ra 64-byte. Mật khẩu không bao giờ được lưu dưới dạng văn bản thuần.
- **Quản lý Phiên Đăng nhập (Session Token)**:
  - Khi đăng nhập thành công qua `POST /admin/api/login`, máy chủ Fastify ký số một chuỗi định danh phiên bao gồm Payload base64 (`{u: username, exp: timestamp}`) kết hợp với chữ ký HMAC SHA-256 được dẫn xuất từ khóa bí mật `CREDENTIALS_KEY`.
  - Phiên làm việc được đính kèm vào Header `Set-Cookie`:
    ```http
    Set-Cookie: sid=eyJ1IjoidGdzMzY1...; HttpOnly; SameSite=Lax; Path=/admin; Max-Age=604800
    ```
  - **Thời hạn phiên**: `Max-Age=604800` giây (tương đương **7 ngày** liên tục).
  - Cờ `HttpOnly` ngăn chặn mọi mã độc JavaScript phía máy khách đánh cắp Cookie (phòng vệ tấn công XSS).

### 3.3 Cơ chế Mã hóa Dữ liệu Nhạy cảm trong Cơ sở Dữ liệu (AES-256-GCM)

Tất cả các thông tin nhạy cảm lưu trong cơ sở dữ liệu đều được mã hóa đối xứng bằng thuật toán **AES-256-GCM** (Galois/Counter Mode) trước khi ghi xuống đĩa cứng:
- **Các trường được mã hóa**:
  - `chatwoot_api_access_token`
  - `zalo_oa_app_secret`
  - `zalo_oa_secret_key`
  - Dữ liệu Cookie phiên cá nhân trong bảng `zalo_sessions` (`session_data`)
  - Access Token & Refresh Token trong bảng `oa_tokens`
- **Khóa chủ mã hóa**: Biến môi trường `CREDENTIALS_KEY` (khóa hex 64 ký tự / 256 bit) được định nghĩa trong `/www/wwwroot/admin/zca-bridge/.env`.  
  *Tuyệt đối không để lộ hoặc làm mất khóa này, nếu mất khóa hệ thống sẽ không thể giải mã các phiên Zalo hiện có.*

---

## 4. HƯỚNG DẪN CHI TIẾT 4 PHÂN HỆ GIAO DIỆN ADMIN CONSOLE

Giao diện Quản trị viên (Admin Console) được thiết kế hiện đại, tinh gọn và tối ưu hóa cao cho hoạt động vận hành thời gian thực. Giao diện bao gồm 4 tab điều hướng chính:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ZALOCRM BRIDGE · ADMIN CONSOLE                    [ Đã đăng nhập ] [Đăng xuất]│
├─────────────────────────────────────────────────────────────────────────────┤
│  [ Tài khoản ]       [ Logs ]       [ Cấu hình ]       [ Proxy ]            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 4.1 Tab 1: "Tài khoản" (Accounts Management)

Tab **Tài khoản** là trung tâm giám sát hoạt động của tất cả các tài khoản Zalo đang kết nối với hệ thống.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Tài khoản Zalo                                       [ + Thêm tài khoản ]  │
│  Theo dõi trạng thái kết nối và thao tác nhanh.                             │
├──────────────────┬──────────────────┬──────────────────┬────────────────────┤
│  Tổng tài khoản  │    Đã kết nối    │    Cần xử lý     │    Cảnh báo/lỗi    │
│        2         │        0         │        2         │         0          │
└──────────────────┴──────────────────┴──────────────────┴────────────────────┘
```

#### A. Khung Chỉ số Tổng quan (Summary Cards)
- **Tổng tài khoản**: Tổng số tài khoản đã khai báo trong hệ thống.
- **Đã kết nối**: Số tài khoản đang hoạt động bình thường, sẵn sàng đồng bộ 2 chiều.
- **Cần xử lý**: Số tài khoản chưa đăng nhập, phiên hết hạn hoặc thiếu thông tin định danh Inbox.
- **Cảnh báo/lỗi**: Số lượng sự kiện cảnh báo hoặc lỗi nghiêm trọng gần đây cần người vận hành chú ý (kèm nút `×` để ẩn cảnh báo sau khi đã xử lý).

#### B. Danh sách Tài khoản Chi tiết

Hệ thống đã được thiết lập sẵn 2 tài khoản cốt lõi:

| ID | Tên Nhãn (Label) | Phân Loại | Trạng Thái Hiện Tại | Chatwoot Inbox Mapped | Nút Thao Tác Chức Năng |
|---|---|---|---|---|---|
| **#2** | `Zalo OA - ERP 365` | **OA** | `Chờ đăng nhập` (`pending_qr`) | `yZCfiJdkVx96ub8HrQiUAUid`<br>(ID: 2 · Account: 1) | `[Kết nối OA]` `[Xin thông tin]` `[Sửa]` `[Xóa]` |
| **#3** | `Zalo Personal - Hotline` | **Cá nhân** | `Chờ đăng nhập` (`pending_qr`) | `HkzhKDhqUJDv24RpTrWy2N6K`<br>(ID: 3 · Account: 1) | `[Quét QR]` `[Sửa]` `[Xóa]` |

#### C. Ý nghĩa Chi tiết Các Huy hiệu Trạng thái (Status Badges)
- **`● Đã kết nối` (Màu xanh lục - `connected`)**: Tài khoản đang duy trì phiên hợp lệ, socket lắng nghe ổn định, sẵn sàng nhận và gửi tin tức thì.
- **`Chờ đăng nhập` (Màu vàng cam - `pending_qr`)**: Tài khoản mới tạo hoặc chưa quét mã QR / chưa hoàn tất ủy quyền OAuth.
- **`Đang kết nối lại…` (Màu vàng cam - `reconnecting`)**: Kết nối socket tạm thời bị gián đoạn, hệ thống đang tự động kích hoạt tiến trình nối lại.
- **`Hết hạn` (Màu xám/đỏ nhạt - `expired`)**: Phiên đăng nhập Zalo đã bị hủy từ phía ứng dụng Zalo trên điện thoại hoặc Token OA bị thu hồi, cần xác thực lại.
- **`Đã đăng xuất` (Màu xám - `logged_out`)**: Tài khoản đã chủ động đăng xuất khỏi bridge.
- **`Cần áp dụng proxy` (Màu vàng - `proxyPending`)**: Tài khoản cá nhân vừa được đổi cấu hình proxy mới, cần bấm nút "Áp dụng proxy" để kết nối lại qua IP proxy mới.

#### D. Ý nghĩa Các Nút Thao tác
- **`[Kết nối OA]`**: Mở đường dẫn điều hướng tới cổng xác thực OAuth của Zalo (`oauth.zaloapp.com`) để người sở hữu OA cấp quyền truy cập.
- **`[Quét QR]`**: Mở slide-over drawer trượt từ bên phải sang hiển thị mã QR Code động để đăng nhập Zalo Cá nhân.
- **`[Xin thông tin]`**: Mở bảng cấu hình biểu mẫu tự động gửi tin nhắn kèm nút (Action Card) xin số điện thoại, tên của khách hàng khi họ vừa nhắn tin vào OA.
- **`[Sửa]`**: Mở drawer cho phép đổi nhãn hiển thị, thay đổi Chatwoot Account ID, cập nhật Inbox Identifier hoặc Inbox ID, và gán Proxy mạng.
- **`[Xóa]`**: Xóa bỏ hoàn toàn tài khoản và dữ liệu phiên liên quan khỏi ZCA-Bridge.
- **`[+ Thêm tài khoản]`**: Khai báo thêm tài khoản Zalo OA hoặc Zalo Cá nhân mới khi doanh nghiệp mở rộng quy mô kinh doanh.

---

### 4.2 Tab 2: "Nhật ký" (Logs)

Tab **Nhật ký** hiển thị luồng thông tin ghi nhận thời gian thực của máy chủ Fastify và tiến trình `zca-js`.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Nhật ký                                                        [ Tải lại ] │
│  Lọc lỗi, copy log, hoặc export JSON để debug.                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  Mức: [ Tất cả ▼ ]  Tài khoản: [ Mọi tài khoản ▼ ]  [ Copy ]  [ Export JSON ]│
├─────────────────────────────────────────────────────────────────────────────┤
│  THỜI GIAN         │ MỨC  │ ACCOUNT │ EVENT                    │ MESSAGE    │
│  21/11/2026, 16:54 │ INFO │ #3      │ zca_qr_generated         │ Got login..│
│  21/11/2026, 16:15 │ INFO │ #2      │ chatwoot_webhook_received│ outbound ..│
└─────────────────────────────────────────────────────────────────────────────┘
```

#### A. Thanh Công cụ & Bộ Lọc Nhanh (Toolbar Filters)
- **Lọc theo Mức độ (Log Level)**:
  - *Tất cả*: Hiển thị toàn bộ sự kiện (`debug`, `info`, `warn`, `error`).
  - *Cảnh báo trở lên (`level >= 40`)*: Lọc các trường hợp mất kết nối, token sắp hết hạn, tin nhắn bị bỏ qua do chưa có session.
  - *Chỉ lỗi (`level >= 50`)*: Lọc các lỗi nghiêm trọng như kết nối cơ sở dữ liệu thất bại, API Zalo từ chối trả về mã lỗi âm, lỗi phân tích cú pháp webhook.
- **Lọc theo Tài khoản (Account)**: Chọn chính xác tài khoản `#2 (Zalo OA)` hoặc `#3 (Zalo Personal)` để phân tích riêng biệt dòng sự kiện của tài khoản đó.
- **Nút Sao chép (`Copy`)**: Sao chép toàn bộ nội dung nhật ký hiện tại dưới dạng văn bản có cấu trúc vào Clipboard để gửi cho kỹ thuật viên.
- **Nút Xuất dữ liệu (`Export JSON`)**: Tải về file `logs.json` phục vụ phân tích hệ thống tự động.

#### B. Phân tích Dữ liệu Ngữ cảnh Mở rộng (Context JSON Details)
Mỗi dòng nhật ký có thể chứa một mục mở rộng `<details><summary>Context</summary>`. Khi bấm vào, quản trị viên có thể xem toàn bộ Payload HTTP, ID tin nhắn, mã lỗi chi tiết từ Zalo và địa chỉ IP gửi tới:
```json
{
  "sourceId": "verify_worker_oa_001",
  "inboxId": 2,
  "msgId": 30,
  "chatwootMessageId": 30,
  "remoteAddress": "172.21.0.4"
}
```

---

### 4.3 Tab 3: "Cấu hình" (Settings)

Tab **Cấu hình** cho phép điều chỉnh toàn bộ các thông số liên kết giữa ZCA-Bridge, Chatwoot và Zalo Developer.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Cấu hình                                                                   │
│  Thiết lập Chatwoot, Zalo OA, và webhook URL.                               │
├───────────────────────┬───────────────────────┬─────────────────────────────┤
│  Chatwoot             │  Zalo OA              │  Webhook URLs               │
│  - Base URL           │  - App ID             │  - Chatwoot inbox webhook   │
│  - Account ID         │  - App Secret         │  - Zalo OA webhook          │
│  - API Access Token   │  - Secret Key         │                             │
│  [Kiểm tra kết nối]   │  - OAuth Redirect     │                             │
├───────────────────────┴───────────────────────┴─────────────────────────────┤
│  Cảnh báo Giám sát (Telegram Bot / Webhook Alerting)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  [ Lưu & áp dụng ]                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### A. Cụm Thông số Chatwoot
- **Base URL**: `http://chatwoot_rails:3000` *(URL giao tiếp nội bộ container qua mạng Docker bridge `chatwoot_default`)*.
- **Account ID**: `1` *(ID tài khoản doanh nghiệp chính "ERP 365" trên Chatwoot)*.
- **API Access Token**: `pg5Gv9sycaQ2PEUpmUHqixrf` *(Token quyền Quản trị viên cấp cao của Chatwoot)*.
- **Nút "Kiểm tra kết nối"**: Gọi thử nghiệm ngầm tới Chatwoot API để xác thực Token và URL có kết nối thông suốt hay không. Kết quả trả về thông báo màu xanh `Kết nối thành công (ERP 365)`.

#### B. Cụm Thông số Zalo OA
- **App ID**: `15022555662372316` *(ID Ứng dụng đăng ký trên cổng Zalo Developers)*.
- **App Secret**: `lOGx9x5QOy5St1RL7ynJ` *(Mã bí mật của App Zalo, được tự động che giấu bằng mật khẩu khi hiển thị)*.
- **Secret Key**: Khóa bí mật dùng để xác thực chữ ký số Webhook OA.
- **OAuth Redirect**: `http://123.24.6.74:4000/oa/oauth/callback` (hoặc `https://zca.erp365.vn/oa/oauth/callback`).

#### C. Cụm Webhook URLs (Chỉ đọc - Kèm nút Copy nhanh)
- **Chatwoot inbox webhook**:  
  `http://zca-bridge:4000/webhooks/chatwoot/69c46bc97a6d9d25282c8bb46561c687`  
  *(Dán URL này vào mục Webhook của Hộp thư Chatwoot để bắn tin nhắn gửi đi về Bridge)*.
- **Zalo OA webhook**:  
  `http://123.24.6.74:4000/webhooks/zalo-oa` (hoặc `https://zca.erp365.vn/webhooks/zalo-oa`)  
  *(Dán URL này vào Cổng Zalo Developer để nhận sự kiện tin nhắn từ người dùng Zalo gửi đến)*.

#### D. Cụm Cảnh báo Giám sát (Alerting Settings)
- **Telegram Alert**: Bật/Tắt gửi thông báo khẩn cấp tới nhóm Telegram khi tài khoản bị văng phiên đăng nhập (`alert_telegram_enabled`), yêu cầu cung cấp Bot Token và Chat ID.
- **Webhook Alert**: Gửi tín hiệu thông báo JSON tới hệ thống giám sát bên ngoài nếu tài khoản rơi vào trạng thái mất kết nối kéo dài.
- **Ngưỡng Reconnecting**: Số giây cho phép thử kết nối lại trước khi bắn cảnh báo (mặc định: `300` giây / 5 phút).
- **Thời gian hồi phục (Cooldown)**: Khoảng thời gian giãn cách giữa 2 lần gửi cảnh báo trùng lặp (mặc định: `600` giây / 10 phút).

#### E. Cơ chế Ưu tiên Cấu hình: Database `settings` vs File `.env`
Hệ thống áp dụng mô hình phân cấp tải cấu hình động (`resolveSettings`):
1. Khi khởi động, ZCA-Bridge nạp các giá trị mặc định từ file `/www/wwwroot/admin/zca-bridge/.env`.
2. Tiếp theo, hệ thống đọc bảng `settings` trong PostgreSQL `zca_bridge`.
3. **Mọi giá trị được lưu trong bảng Database `settings` (thao tác qua nút "Lưu & áp dụng") sẽ GHI ĐÈ hoàn toàn giá trị tương ứng trong file `.env`**.
4. Việc lưu cấu hình trên giao diện Web sẽ có hiệu lực ngay lập tức và tự động khởi động lại worker của bridge mà không cần can thiệp SSH vào máy chủ.

---

### 4.4 Tab 4: "Proxy" (Proxy Pool Management)

Tab **Proxy** phục vụ quản trị danh sách máy chủ chuyển tiếp (Proxy Pool) nhằm bảo vệ tài khoản Zalo Cá nhân:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Proxy                                                       [ + Thêm proxy ]│
│  Quản lý danh sách proxy dùng cho tài khoản cá nhân.                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  Chưa có proxy nào.                                                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### A. Mục đích & Tình huống Sử dụng Proxy
- **Chống giới hạn tần suất (Rate Limit Bypass)**: Khi vận hành nhiều tài khoản Zalo cá nhân cùng lúc trên một địa chỉ IP máy chủ datacenter, Zalo có thể áp đặt hạn chế lưu lượng mạng hoặc yêu cầu xác minh bảo mật thường xuyên.
- **Cố định vị trí địa lý (Geo-IP Consistency)**: Gán IP Residential (Proxy dân cư) tại đúng tỉnh/thành phố nơi số Hotline đăng ký hoạt động giúp phiên đăng nhập bền vững và không bị kiểm duyệt bất thường.

#### B. Thao tác Quản lý Proxy
1. Bấm nút **`[+ Thêm proxy]`**, một drawer hiện ra:
   - **Nhãn**: Đặt tên gợi nhớ (ví dụ: `VPS Viettel HCM` hoặc `Proxy Dân Cư 01`).
   - **Loại giao thức**: Chọn `http`, `https` hoặc `socks5`.
   - **Host & Port**: Nhập địa chỉ IP máy chủ Proxy và cổng dịch vụ (ví dụ: `103.150.x.x`, cổng `1080`).
   - **Xác thực**: Điền Username và Password nếu Proxy có cài đặt mật khẩu.
2. Bấm **`Thêm`** để lưu vào cơ sở dữ liệu.
3. Sau khi thêm Proxy, quay lại **Tab Tài khoản**, bấm nút **`[Sửa]`** tại tài khoản cá nhân mong muốn, chọn Proxy từ danh sách đổ xuống và bấm **`Lưu`**.
4. Trạng thái tài khoản sẽ hiện huy hiệu `Cần áp dụng proxy`. Quản trị viên chỉ cần bấm **`[Áp dụng proxy]`** để hệ thống tái khởi tạo socket qua đường truyền trung gian mới.

---

## 5. HƯỚNG DẪN TỪNG BƯỚC KẾT NỐI ZALO CÁ NHÂN (Zalo Personal QR Walkthrough)

Tài khoản Zalo Cá nhân (**Account ID 3 - "Zalo Personal - Hotline"**) kết nối trực tiếp với Zalo thông qua giao thức mô phỏng của thư viện `zca-js`. Dưới đây là quy trình xác thực chuẩn:

### 5.1 Quy trình 5 Bước Kết nối bằng Mã QR Code

```
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  BƯỚC 1: ADMIN   │    │  BƯỚC 2: QUÉT QR │    │  BƯỚC 3: XÁC NHẬN│
│  Mở Tab Tài khoản│───►│  Drawer hiện mã  │───►│  Mở Zalo App     │
│  Bấm [Quét QR]   │    │  QR thời gian thực│   │  Quét & Duyệt    │
└──────────────────┘    └──────────────────┘    └─────────┬────────┘
                                                          │
                        ┌──────────────────┐              │
                        │  BƯỚC 5: ĐỒNG BỘ │              ▼
                        │  Huy hiệu hiển thị│◄───┌──────────────────┐
                        │  ● Đã kết nối     │    │  BƯỚC 4: LƯU PHIÊN│
                        └──────────────────┘    │  Mã hóa AES-256  │
                                                │  Vào DB Postgres │
                                                └──────────────────┘
```

- **Bước 1**: Truy cập Admin Console tại `https://zca.erp365.vn/admin/` (hoặc `http://localhost:4000/admin/`). Đăng nhập bằng tài khoản `tgs365vn@gmail.com` / `thegioiso365`.
- **Bước 2**: Tại Tab **Tài khoản**, tìm đến dòng tài khoản **#3 (`Zalo Personal - Hotline`)**, bấm nút màu xanh **`[Quét QR]`**.
- **Bước 3**: Một ngăn trượt (slide-over drawer) mở ra từ góc phải màn hình với tiêu đề "Quét QR".
  - ZCA-Bridge lập tức gửi yêu cầu `POST /admin/api/accounts/3/login` tới máy chủ Zalo.
  - Sau khoảng 300ms, mã QR Code đăng nhập dạng ảnh PNG 399x399 pixel sẽ được kết xuất động ngay trên màn hình.
- **Bước 4**: Người cầm điện thoại Hotline thực hiện:
  1. Mở ứng dụng Zalo trên điện thoại di động.
  2. Bấm vào biểu tượng **Quét mã QR** ở góc trên cùng bên phải màn hình tìm kiếm.
  3. Hướng camera điện thoại vào mã QR trên màn hình máy tính.
  4. Trên màn hình điện thoại xuất hiện câu hỏi *"Đăng nhập Zalo trên máy tính?"* ➔ Bấm nút **`Đăng nhập`** (Approve).
  > ⚠️ **Lưu ý về Thời gian hiệu lực**: Mã QR của Zalo có thời gian sống khoảng **120 giây (2 phút)**. Nếu quá thời gian trên chưa kịp quét, mã sẽ hết hạn. Bạn chỉ cần đóng ngăn trượt và bấm nút `[Quét QR]` lại một lần nữa để lấy mã mới.
- **Bước 5**: Ngay sau khi người dùng bấm "Đăng nhập" trên điện thoại:
  - Máy chủ Zalo kích hoạt sự kiện cấp quyền thành công.
  - ZCA-Bridge tự động trích xuất chuỗi định danh Cookie phiên đăng nhập, tạo khóa và mã hóa AES-256-GCM.
  - Bản ghi được lưu vĩnh viễn vào bảng `zalo_sessions` trong PostgreSQL `zca_bridge`.
  - Huy hiệu của tài khoản #3 chuyển tức thì sang màu xanh: **`● Đã kết nối`**.

### 5.2 Cơ chế Lưu trữ & Tự động Khôi phục Phiên (Session Persistence & Auto-Refresh)

Hệ thống ZCA-Bridge được trang bị cơ chế tự phục hồi thông minh:
1. **Mã hóa an toàn**: Toàn bộ chuỗi Cookies và thông tin `zaloUid` được mã hóa đối xứng AES-256-GCM với khóa bí mật trước khi lưu vào bảng `zalo_sessions`.
2. **Tự động làm mới phiên (Auto-Refresh Background Job)**: Định kỳ mỗi **30 phút**, một tác vụ nền sẽ kiểm tra độ trễ và làm mới phiên đăng nhập với máy chủ Zalo để tránh bị hết hạn Cookie ngầm.
3. **Tự khôi phục sau Restart máy chủ**: Khi máy chủ khởi động lại hoặc container `docker restart zca-bridge`, ứng dụng sẽ tự động tải phiên đã mã hóa từ cơ sở dữ liệu lên bộ nhớ, tự giải mã và thiết lập lại socket mà **hoàn toàn KHÔNG yêu cầu nhân viên phải quét lại mã QR**.

### 5.3 Quản trị Từ xa / Máy chủ Không màn hình (Headless Server QR Image Access)

Đối với các Quản trị viên hệ thống thao tác qua giao diện dòng lệnh (CLI SSH) hoặc khi quản trị viên ở xa muốn gửi ảnh QR cho nhân sự cầm máy Hotline quét:
- Mỗi khi lệnh `POST /admin/api/accounts/3/login` được kích hoạt, file ảnh QR gốc cũng được tự động sao lưu tại đường dẫn vật lý trên máy chủ:
  ```text
  /www/wwwroot/admin/zca-bridge/data/zalo_personal_qr.png
  ```
- Quản trị viên có thể tải file này về máy tính qua SCP/SFTP hoặc chạy lệnh gửi nhanh:
  ```bash
  # Kiểm tra thông số file ảnh QR hiện tại
  file /www/wwwroot/admin/zca-bridge/data/zalo_personal_qr.png
  # Kết quả: PNG image data, 399 x 399, 8-bit/color RGBA
  ```

---

## 6. HƯỚNG DẪN TỪNG BƯỚC KẾT NỐI ZALO OFFICIAL ACCOUNT (Zalo OA Walkthrough)

Tài khoản Zalo Official Account (**Account ID 2 - "Zalo OA - ERP 365"**) được quản lý theo tiêu chuẩn OAuth 2.0 và Open API v3 của Zalo for Developers.

### 6.1 Thiết lập Thông số trên Zalo Developer Portal

Trước khi bấm xác thực trên Admin Console, đảm bảo các cấu hình trên cổng `https://developers.zalo.me/` của ứng dụng đã được thiết lập chính xác:

- **Địa chỉ trang quản trị ứng dụng**: `https://developers.zalo.me/app/15022555662372316`
- **Thông tin xác thực ứng dụng**:
  - **App ID**: `15022555662372316`
  - **App Secret**: `lOGx9x5QOy5St1RL7ynJ`
  - **Official Account được liên kết**: Chọn trang OA doanh nghiệp: **"ERP 365"**
- **Cấu hình Đăng ký Webhook (Zalo OA Webhook)**:
  - **Webhook URL**: `http://123.24.6.74:4000/webhooks/zalo-oa` (hoặc `https://zca.erp365.vn/webhooks/zalo-oa` nếu đã cấu hình SSL).
  - **Danh sách Sự kiện Bắt buộc Đăng ký (Event Subscriptions)**:
    - `user_send_text` (Khách hàng gửi tin nhắn văn bản)
    - `user_send_image` (Khách hàng gửi hình ảnh)
    - `user_send_link` (Khách hàng gửi liên kết web)
    - `user_send_audio` (Khách hàng gửi tin nhắn thoại)
    - `user_send_video` (Khách hàng gửi video clip)
    - `oa_send_text` (Tin nhắn phản hồi từ quản trị viên OA)
- **Cấu hình Đường dẫn Chuyển hướng Ủy quyền (OAuth Redirect URI)**:
  - Thêm URL: `http://123.24.6.74:4000/oa/oauth/callback` (hoặc `https://zca.erp365.vn/oa/oauth/callback`).

### 6.2 Quy trình 5 Bước Cấp quyền OAuth qua Admin Console

- **Bước 1**: Truy cập Admin Console, chuyển tới Tab **Tài khoản**.
- **Bước 2**: Tại dòng tài khoản **#2 (`Zalo OA - ERP 365`)**, bấm vào nút màu xanh **`[Kết nối OA]`**.
- **Bước 3**: Trình duyệt sẽ tự động chuyển hướng (HTTP 302) sang trang ủy quyền bảo mật chính thức của Zalo:
  ```text
  https://oauth.zaloapp.com/v4/oa/permission?app_id=15022555662372316&redirect_uri=http%3A%2F%2F123.24.6.74%3A4000%2Foa%2Foauth%2Fcallback&state=2
  ```
- **Bước 4**: Trên giao diện web của Zalo:
  1. Đăng nhập bằng tài khoản Zalo cá nhân có quyền Quản trị viên cao nhất (Admin/Owner) của OA "ERP 365".
  2. Trong danh sách Official Account hiển thị, tích chọn vào **"ERP 365"**.
  3. Tích chọn đầy đủ các quyền: *Quản lý tin nhắn, Đọc thông tin người quan tâm, Gửi tin nhắn CSKH*.
  4. Bấm nút màu xanh **`Cho phép`** (Allow).
- **Bước 5**: Hoàn tất chu trình cấp phép:
  - Zalo chuyển hướng trình duyệt quay trở lại địa chỉ:  
    `http://123.24.6.74:4000/oa/oauth/callback?code=<AUTHORIZATION_CODE>&state=2`
  - Endpoint của Fastify nhận mã `code`, lập tức gửi yêu cầu ngầm tới máy chủ Zalo OAuth (`https://oauth.zaloapp.com/v4/oa/access_token`) để đổi lấy cặp khóa:
    - `access_token` (Thời hạn 25 giờ)
    - `refresh_token` (Thời hạn 3 tháng)
  - Khóa được mã hóa AES-256 và lưu trữ vào bảng `oa_tokens`.
  - Cập nhật trạng thái tài khoản thành **`● Đã kết nối`**.
  - Trình duyệt tự động chuyển hướng quay về trang Admin Console với thông báo kết nối OA thành công.

### 6.3 Cơ chế Lưu trữ & Tự động Làm mới Access Token của Zalo OA

Access Token của Zalo OA chỉ có giá trị trong vòng 25 giờ (90.000 giây). ZCA-Bridge tích hợp bộ quản lý token tự động:
- Trước khi thực hiện bất kỳ lệnh gửi tin nhắn nào hoặc định kỳ mỗi giờ, ZCA-Bridge kiểm tra trường `expires_at` trong bảng `oa_tokens`.
- Nếu token còn dưới 2 giờ hiệu lực, Bridge sẽ tự động dùng `refresh_token` để yêu cầu Zalo cấp Access Token mới mà **không cần người quản trị phải thao tác ủy quyền lại**.

---

## 7. THIẾT LẬP & QUẢN TRỊ HỘP THƯ TRÊN CHATWOOT

Giao diện Chatwoot tại `https://chat.erp365.vn` là nơi tập trung toàn bộ cuộc trò chuyện của khách hàng để các chuyên viên chăm sóc khách hàng (Agent) xử lý hằng ngày.

### 7.1 Truy cập Giao diện Chatwoot tại `https://chat.erp365.vn`

- **Địa chỉ truy cập**: `https://chat.erp365.vn`
- **Tài khoản Đăng nhập**: Sử dụng email và mật khẩu của chuyên viên hoặc Quản trị viên (Admin).
- **Account ID Doanh nghiệp**: `1` (Tên hiển thị: **ERP 365**).

### 7.2 Cấu hình 2 Hộp thư Kênh API (Inboxes)

Hệ thống đã được thiết lập sẵn 2 Hộp thư chuyên biệt (Channel API) trong Chatwoot:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  HỘP THƯ CHATWOOT (INBOXES) CHO TÀI KHOẢN 1 (ERP 365)                       │
├────┬─────────────────┬──────────────┬──────────────────────────┬────────────┤
│ ID │ TÊN HỘP THƯ     │ LOẠI KÊNH    │ INBOX IDENTIFIER         │ STATUS     │
├────┼─────────────────┼──────────────┼──────────────────────────┼────────────┤
│ 2  │ Zalo OA         │ Channel::Api │ yZCfiJdkVx96ub8HrQiUAUid │ Hoạt động  │
│ 3  │ Zalo Personal   │ Channel::Api │ HkzhKDhqUJDv24RpTrWy2N6K │ Hoạt động  │
└────┴─────────────────┴──────────────┴──────────────────────────┴────────────┘
```

- **Hộp thư 2 ("Zalo OA")**: Tiếp nhận tất cả tin nhắn khách hàng gửi vào Zalo Official Account "ERP 365".
- **Hộp thư 3 ("Zalo Personal")**: Tiếp nhận tất cả tin nhắn khách hàng gửi trực tiếp vào số điện thoại Zalo Hotline cá nhân.

### 7.3 Thiết lập Outgoing Webhook Tích hợp Ngược về ZCA-Bridge

Để tin nhắn do nhân viên gõ trong Chatwoot có thể gửi ngược lại cho khách hàng trên Zalo, Chatwoot cần một kênh Webhook gửi đi:

1. Trong giao diện Chatwoot, bấm vào biểu tượng **Cài đặt (Settings)** ở góc dưới bên trái (hình bánh răng).
2. Chọn menu **Tích hợp (Integrations)** ➔ Chọn mục **Webhooks**.
3. Bấm **Thêm Webhook mới (Add new webhook)**:
   - **URL Webhook**:
     ```text
     http://zca-bridge:4000/webhooks/chatwoot/69c46bc97a6d9d25282c8bb46561c687
     ```
   - **Đăng ký các sự kiện (Events)**:
     - `message_created` *(Kích hoạt mỗi khi nhân viên gửi một tin nhắn mới)*
     - `message_updated` *(Kích hoạt khi tin nhắn cập nhật trạng thái đã gửi/đã đọc)*
4. Bấm **Lưu (Save)**.

### 7.4 Phân công Chuyên viên Hỗ trợ (Agent Assignments)

Cả 2 hộp thư Zalo đã được phân công đầy đủ cho 5 chuyên viên phụ trách tư vấn của hệ thống:

| User ID | Họ và Tên Nhân Viên | Vai Trò (Role) | Hộp Thư Phụ Trách |
|---|---|---|---|
| **3** | Nguyễn Văn Hưng | Agent / Tư vấn viên | Zalo OA & Zalo Personal |
| **4** | Hung Admin | Administrator / Quản trị viên | Zalo OA & Zalo Personal |
| **5** | Đỗ Thanh Tùng | Agent / Tư vấn viên | Zalo OA & Zalo Personal |
| **6** | Vũ Đức Huy | Agent / Tư vấn viên | Zalo OA & Zalo Personal |
| **7** | Nguyễn Minh Quang | Agent / Tư vấn viên | Zalo OA & Zalo Personal |

> **Hướng dẫn thêm nhân viên mới vào Hộp thư**:
> - Vào **Settings** ➔ **Inboxes** ➔ Chọn biểu tượng bánh răng bên cạnh Hộp thư muốn sửa ➔ Chọn tab **Collaborators**.
> - Tích chọn nhân viên cần giao việc và bấm **Update**.

### 7.5 Thao tác Trò chuyện & Tiếp nhận Hội thoại Thực tế

1. Khi khách hàng nhắn tin từ Zalo, một hội thoại mới sẽ xuất hiện trong mục **Hội thoại (Conversations)** của Chatwoot kèm nhãn hộp thư tương ứng.
2. Thông tin khách hàng (Tên Zalo, Ảnh đại diện đại diện Zalo, User ID Zalo) sẽ tự động được tạo thành một Hồ sơ liên hệ (**Contact**) trên Chatwoot.
3. Nhân viên chỉ cần gõ nội dung vào ô trả lời và bấm phím **Gửi** (Enter). Tin nhắn sẽ ngay lập tức được chuyển tiếp tới điện thoại của khách hàng thông qua ZCA-Bridge.
4. Hỗ trợ đầy đủ gửi hình ảnh đính kèm, tập tin tài liệu, liên kết và tin nhắn thoại.

---

## 8. VẬN HÀNH, GIÁM SÁT & XỬ LÝ SỰ CỐ NÂNG CAO

Dành cho Quản trị viên hệ thống (SRE / DevOps) khi vận hành thực tế hệ thống trên máy chủ.

### 8.1 Sửa lỗi Chặn Webhook Docker SSRF SafeFetch trong Chatwoot Sidekiq

#### A. Triệu chứng Sự cố (Symptom)
Khách hàng gửi tin nhắn vào Chatwoot thì nhận được bình thường, nhưng khi nhân viên trả lời trên Chatwoot, khách hàng trên Zalo **không bao giờ nhận được tin nhắn**.  
Kiểm tra log của `chatwoot_sidekiq` thấy ngoại lệ:
```text
Exception: Invalid webhook URL http://zca-bridge:4000/... : Hostname 'zca-bridge' has no public ip addresses
content_attributes: {"external_error" => "Hostname 'zca-bridge' has no public ip addresses"}
```

#### B. Nguyên nhân Kỹ thuật (Root Cause)
Chatwoot tích hợp cơ chế bảo vệ chống tấn công nội bộ SSRF (Server-Side Request Forgery) qua module `SafeFetch` (`ssrf_filter`). Mặc định, Chatwoot cấm gửi Webhook tới các dải mạng riêng tư RFC 1918 (bao gồm cả địa chỉ nội bộ Docker `172.21.0.0/16` và hostname `zca-bridge`).

#### C. Biện pháp Khắc phục Triệt để (Remediation)
1. Thêm biến môi trường cho phép gọi mạng nội bộ vào file cấu hình Chatwoot:
   ```bash
   # Mở file .env của Chatwoot
   nano /www/wwwroot/admin/chatwoot/.env

   # Thêm vào cuối file dòng sau:
   SAFE_FETCH_ALLOW_PRIVATE_NETWORK=true
   ```
2. Tái tạo lại container của Chatwoot để nhận biến cấu hình:
   ```bash
   cd /www/wwwroot/admin/chatwoot
   docker compose up -d rails sidekiq
   ```
3. Kiểm tra biến đã có hiệu lực trong container:
   ```bash
   docker exec chatwoot_sidekiq env | grep SAFE_FETCH_ALLOW_PRIVATE_NETWORK
   # Kết quả mong muốn: SAFE_FETCH_ALLOW_PRIVATE_NETWORK=true
   ```

---

### 8.2 Sửa lỗi Database Sequences Trùng lặp trên Chatwoot

#### A. Triệu chứng Sự cố
Khi ZCA-Bridge gọi API tạo hội thoại hoặc chiến dịch mới trên Chatwoot, Chatwoot trả về lỗi `HTTP 500 Internal Server Error` với thông báo PostgreSQL:
```text
PG::UniqueViolation: ERROR: duplicate key value violates unique constraint "conversations_pkey"
Key (id)=(...) already exists.
```
Hoặc lỗi tương tự trên sequence `display_id`: `conv_dpid_seq_1` hoặc `camp_dpid_seq_1`.

#### B. Biện pháp Khắc phục Triệt để
Chạy lệnh đồng bộ lại giá trị hiện tại của Sequence khớp với giá trị `MAX(id)` lớn nhất đang có trong bảng cơ sở dữ liệu `chatwoot_production`:

```bash
docker exec -i chatwoot_postgres psql -U chatwoot -d chatwoot_production << 'EOF'
-- Đồng bộ lại display_id sequence của conversations cho Account 1
SELECT setval('conv_dpid_seq_1', COALESCE((SELECT MAX(display_id) FROM conversations WHERE account_id = 1), 0) + 1, false);

-- Đồng bộ lại display_id sequence của campaigns cho Account 1
SELECT setval('camp_dpid_seq_1', COALESCE((SELECT MAX(display_id) FROM campaigns WHERE account_id = 1), 0) + 1, false);

-- Đồng bộ sequence khóa chính id của bảng conversations
SELECT setval(pg_get_serial_sequence('conversations', 'id'), COALESCE((SELECT MAX(id) FROM conversations), 0) + 1, false);

-- Đồng bộ sequence khóa chính id của bảng messages
SELECT setval(pg_get_serial_sequence('messages', 'id'), COALESCE((SELECT MAX(id) FROM messages), 0) + 1, false);
EOF
```

---

### 8.3 Sổ tay Lệnh CLI Chẩn đoán & Giám sát Nhanh

Các lệnh quản trị viên có thể copy và chạy trực tiếp trên Terminal SSH máy chủ:

```bash
# 1. Kiểm tra trạng thái hoạt động của tất cả container liên quan
docker ps --format "table {{.Names}}	{{.Status}}	{{.Ports}}" | grep -E "zca|chatwoot"

# 2. Kiểm tra sức khỏe trực tiếp của Fastify ZCA-Bridge
curl -s http://localhost:4000/healthz
# Kết quả mong muốn: {"ok":true}

# 3. Theo dõi 50 dòng log mới nhất của ZCA-Bridge (xem socket và sự kiện tin nhắn)
docker logs --tail 50 -f zca-bridge

# 4. Theo dõi log Webhook của Chatwoot Sidekiq (kiểm tra tin nhắn gửi ra)
docker logs --tail 50 -f chatwoot_sidekiq | grep -E "WebhookJob|ActiveJob"

# 5. Kiểm tra trạng thái Nginx Reverse Proxy
sudo nginx -t && sudo systemctl status nginx
```

---

### 8.4 Truy vấn & Kiểm tra Trực tiếp Cơ sở Dữ liệu PostgreSQL (`zca_bridge`)

Quản trị viên có thể dùng lệnh CLI sau để kiểm tra bảng dữ liệu nội bộ của Bridge:

```bash
# 1. Kiểm tra cấu hình hệ thống đã nạp trong bảng settings
docker exec -i zca-bridge-db psql -U postgres -d zca_bridge   -c "SELECT key, is_secret, updated_at FROM settings ORDER BY key;"

# 2. Kiểm tra danh sách tài khoản Zalo và trạng thái kết nối
docker exec -i zca-bridge-db psql -U postgres -d zca_bridge   -c "SELECT id, label, type, status, chatwoot_inbox_id, chatwoot_inbox_identifier FROM zalo_accounts;"

# 3. Kiểm tra các phiên Zalo cá nhân đã được lưu mã hóa
docker exec -i zca-bridge-db psql -U postgres -d zca_bridge -c "SELECT zalo_account_id, last_login_at, last_seen_at FROM zalo_sessions;"

# 4. Kiểm tra mã Token Zalo OA hiện có
docker exec -i zca-bridge-db psql -U postgres -d zca_bridge -c "SELECT zalo_account_id, access_expires_at, updated_at FROM oa_tokens;"
```

---

### 8.5 Quy trình Khởi động lại Cụm Dịch vụ An toàn (Graceful Restart)

Khi cần bảo trì định kỳ hoặc tái nạp cấu hình toàn bộ hệ thống:

```bash
# Bước 1: Khởi động lại dịch vụ cơ sở dữ liệu và ZCA-Bridge
cd /www/wwwroot/admin/zca-bridge
docker compose restart zca-bridge-db
docker compose restart zca-bridge

# Bước 2: Kiểm tra lại dịch vụ đã sẵn sàng
sleep 3
curl -s http://localhost:4000/healthz

# Bước 3: Nạp lại cấu hình Nginx
echo tgs365 | sudo -S nginx -s reload
```

---

### 8.6 Hướng dẫn Sao lưu & Khôi phục Cơ sở Dữ liệu và Khóa Mã hóa (Backup & Recovery)

#### A. Sao lưu Dữ liệu (Backup Procedure)
Tạo bản sao lưu định kỳ cho cơ sở dữ liệu `zca_bridge` và file biến môi trường chứa khóa bí mật:
```bash
# Tạo thư mục chứa backup nếu chưa có
mkdir -p /backups/zca-bridge

# 1. Sao lưu cơ sở dữ liệu PostgreSQL zca_bridge
docker exec -t zca-bridge-db pg_dump -U postgres zca_bridge > /backups/zca-bridge/zca_bridge_$(date +%Y%m%d_%H%M%S).sql

# 2. Sao lưu file .env (chứa CREDENTIALS_KEY)
cp /www/wwwroot/admin/zca-bridge/.env /backups/zca-bridge/.env_$(date +%Y%m%d_%H%M%S).bak

# Giữ lại tối đa 30 bản sao lưu gần nhất
find /backups/zca-bridge -name "*.sql" -mtime +30 -delete
```

#### B. Phục hồi Dữ liệu khi Gặp Sự cố (Restore Procedure)
Trong trường hợp di chuyển máy chủ hoặc máy chủ gặp sự cố hỏng ổ cứng:
1. Triển khai lại file `docker-compose.yml` và khôi phục file `.env` (đặc biệt là biến `CREDENTIALS_KEY`).
2. Khởi động container cơ sở dữ liệu:
   ```bash
   cd /www/wwwroot/admin/zca-bridge && docker compose up -d zca-bridge-db
   ```
3. Khôi phục dữ liệu từ bản SQL đã sao lưu:
   ```bash
   docker exec -i zca-bridge-db psql -U postgres -d zca_bridge < /backups/zca-bridge/zca_bridge_TIMESTAMP.sql
   ```
4. Khởi động container ZCA-Bridge:
   ```bash
   docker compose up -d zca-bridge
   ```
   *Toàn bộ tài khoản, cấu hình và phiên đăng nhập Zalo sẽ tự động phục hồi mà không cần quét lại QR.*

---

### 8.7 Bảng Tra cứu Lỗi Phổ biến & Biện pháp Khắc phục Tức thì (Cheat Sheet)

| Hiện Tượng / Thông Báo Lỗi | Nguyên Nhân Gốc Rễ | Biện Pháp Khắc Phục Tức Thì |
|---|---|---|
| **Lỗi `502 Bad Gateway` khi mở `/admin/api/chatwoot/accounts`** | URL `chatwoot_base_url` trong Database hoặc `.env` trỏ sai (ví dụ `127.0.0.1:3200` thay vì nội bộ Docker). | Cập nhật `chatwoot_base_url` thành `http://chatwoot_rails:3000` trong Tab Cấu hình hoặc qua SQL. |
| **Không thể truy cập `https://zca.erp365.vn/admin/`** | Nginx chưa nạp vhost hoặc máy tính chưa phân giải được tên miền. | Kiểm tra file `/www/server/panel/vhost/nginx/zca.conf`, chạy `sudo nginx -t && sudo nginx -s reload`. Thêm DNS vào file hosts. |
| **Không tải được mã QR khi bấm `[Quét QR]`** | Thư viện `zca-js` gặp sự cố mạng ra ngoài hoặc tài khoản Zalo bị chặn IP tạm thời. | Kiểm tra log `docker logs zca-bridge --tail 50`. Cấu hình thêm Proxy trong Tab Proxy nếu bị chặn IP. |
| **Zalo OA trả về mã lỗi `-14005` khi cấp quyền OAuth** | Mã xác thực Authorization Code đã hết hạn (chỉ có hiệu lực 1 lần trong vài chục giây) hoặc `redirect_uri` không trùng khớp. | Thực hiện lại quy trình: Bấm `[Kết nối OA]` từ đầu, kiểm tra `redirect_uri` trên Zalo Developer phải trùng khớp `http://123.24.6.74:4000/oa/oauth/callback`. |
| **Khách hàng nhận được tin nhắn từ Chatwoot nhưng rất chậm (>10s)** | Hàng đợi Sidekiq bị ùn ứ hoặc máy chủ nghẽn tài nguyên CPU. | Kiểm tra danh sách hàng đợi Chatwoot qua `docker exec chatwoot_sidekiq bundle exec sidekiqmon`. Khởi động lại worker Sidekiq nếu cần. |
| **Tài khoản cá nhân chuyển sang `expired` sau vài ngày** | Người dùng đã đăng nhập tài khoản Zalo trên một thiết bị máy tính khác (Zalo PC chỉ cho phép 1 phiên máy tính hoạt động cùng thời điểm). | Khuyến cáo khách hàng không mở Zalo PC trên máy tính bàn cùng lúc với số Hotline, hoặc bấm `[Quét QR]` để đăng nhập lại trên Bridge. |

---

## 9. THÔNG TIN LIÊN HỆ BÀN GIAO & HỖ TRỢ KỸ THUẬT

- **Đơn vị quản lý dự án**: Đội ngũ Quản trị Kỹ thuật Hạ tầng Cloud ERP-365
- **Địa chỉ hạ tầng**: `erp365.vn` · Trung tâm dữ liệu Thế Giới Số 365
- **Hỗ trợ khẩn cấp**: `tgs365vn@gmail.com`
- **Mã nguồn cấu hình**: `/www/wwwroot/admin/zca-bridge`

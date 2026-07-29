# Hướng dẫn cấu hình Supabase cho dự án Diary

Thời gian: ~20 phút. Làm xong bước nào tick bước đó. Kết quả cuối cùng là bảng
"Thông tin cần thu thập" ở cuối file.

---

## Bước 1 — Tạo project Supabase

1. Vào https://supabase.com → đăng nhập (dùng GitHub cho nhanh).
2. **New project**:
   - Organization: cá nhân của bạn.
   - Name: `diary`
   - Database Password: bấm Generate, **lưu vào password manager** (hiếm khi
     cần lại, nhưng mất là phiền).
   - Region: **Southeast Asia (Singapore)** — gần Việt Nam nhất, độ trễ thấp.
3. Chờ ~2 phút để project khởi tạo.

## Bước 2 — Lấy API credentials

1. Vào **Project Settings** (icon bánh răng) → **API** (hoặc mục **API Keys**
   tùy phiên bản dashboard).
2. Ghi lại 2 giá trị:
   - **Project URL** → sẽ là `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public key** → sẽ là `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. ⚠️ Trong trang này còn có **service_role key** (secret). Dự án này KHÔNG cần
   dùng nó — đừng copy ra đâu cả, và tuyệt đối không đưa vào `.env.local` hay
   chat với bất kỳ AI nào. Anon key để lộ thì không sao (nó được RLS bảo vệ),
   service_role để lộ là mất toàn bộ database.

## Bước 3 — Tạo Google OAuth credentials (phía Google)

1. Vào https://console.cloud.google.com → tạo project mới tên `diary` (menu
   chọn project ở góc trên trái → New Project).
2. Menu ☰ → **APIs & Services → OAuth consent screen**:
   - User Type: **External** → Create.
   - App name: `Diary`, support email: Gmail của bạn. Các mục còn lại để trống
     được → Save.
   - Ở trạng thái **Testing**, chỉ tài khoản trong danh sách Test users đăng
     nhập được → vào mục **Audience / Test users**, thêm Gmail của bạn (và vài
     người bạn muốn cho dùng thử). Khi nào mở cho public thật thì mới cần bấm
     Publish app.
3. **APIs & Services → Credentials → + Create Credentials → OAuth client ID**:
   - Application type: **Web application**, name: `diary-web`.
   - **Authorized redirect URIs** → Add URI, dán đúng 1 dòng:
     ```
     https://<PROJECT_REF>.supabase.co/auth/v1/callback
     ```
     trong đó `<PROJECT_REF>` là phần đầu của Project URL ở Bước 2
     (ví dụ URL là `https://abcd1234.supabase.co` thì REF là `abcd1234`).
   - Create → copy **Client ID** và **Client Secret**.

## Bước 4 — Bật Google provider (phía Supabase)

1. Dashboard Supabase → **Authentication → Sign In / Providers → Google**.
2. Bật **Enable**, dán Client ID + Client Secret từ Bước 3 → Save.

## Bước 5 — Cấu hình Redirect URLs

1. **Authentication → URL Configuration**:
   - **Site URL**: `http://localhost:3000` (sau khi deploy Vercel sẽ đổi thành
     domain thật, ví dụ `https://diary-xxx.vercel.app`).
   - **Redirect URLs** → thêm:
     ```
     http://localhost:3000/**
     ```
     (khi deploy sẽ thêm dòng `https://<domain-vercel>/**` — ghi chú lại để làm
     ở Phase 6).

## Bước 6 — Chạy migration SQL (làm khi Claude Code yêu cầu)

Claude Code sẽ tạo các file `supabase/migrations/000X_*.sql` trong repo. Cách
chạy: Dashboard → **SQL Editor** → New query → dán toàn bộ nội dung file → Run.
Chạy theo đúng thứ tự số file. Sau khi chạy, kiểm tra **Table Editor** thấy
bảng mới là được. (Không cần cài Supabase CLI — tránh rắc rối proxy công ty.)

## Bước 7 — (Để dành cho Phase 5) Lấy Groq API key

Khi bắt đầu Phase 5 (AI Suggest): vào https://console.groq.com → API Keys →
Create key → lưu thành `GROQ_API_KEY`. Free tier của Groq đủ cho giai đoạn đầu.

---

## Thông tin cần thu thập — checklist

| Biến | Lấy ở đâu | Đưa cho ai |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Bước 2 | Điền vào `.env.local` trong repo |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Bước 2 | Điền vào `.env.local` trong repo |
| Google Client ID + Secret | Bước 3 | CHỈ dán vào Supabase (Bước 4), không đưa vào repo |
| Database password | Bước 1 | Chỉ lưu password manager |
| `GROQ_API_KEY` | Bước 7 (Phase 5 mới cần) | `.env.local` + Vercel env |

Với Claude Code, bạn không dán key vào chat — chỉ cần nói: *"`.env.local` đã có
đủ `NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_ANON_KEY`"*.

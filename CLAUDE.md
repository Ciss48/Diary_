# CLAUDE.md

## Dự án này là gì
Diary — web app giúp người Việt học tiếng Anh bằng cách viết nhật ký hằng ngày:
calendar heatmap theo dõi kỷ luật (kiểu GitHub), trang viết như sổ tay, và nút
AI "Suggest better English" trả về bản sửa + nhận xét. Chi tiết: `docs/plan.md`.

## Bootstrap bắt buộc đầu MỖI session
1. Đọc `memory/STATE.md` để biết đang ở đâu.
2. Đọc task file của phase hiện tại trong `tasks/`.
3. Nếu STATE.md ghi có discovery MAJOR chưa được user xử lý → hỏi user trước,
   không tự đoán, không tự tiếp tục.

## Luật bất biến của dự án

**Supabase — KHÔNG có kênh truy cập tự động.**
MCP không kết nối được tới project. Bạn KHÔNG chạy migration, KHÔNG query,
KHÔNG đọc/sửa dữ liệu, KHÔNG kiểm tra schema bằng bất kỳ tool nào. Mọi việc
đụng tới Supabase phải đóng gói thành **SQL hoàn chỉnh hoặc các bước bấm cụ
thể trên dashboard**, đưa cho user, rồi **DỪNG chờ user báo kết quả**. Không
bao giờ giả định một thao tác DB đã chạy thành công. Nếu cần biết trạng thái
schema, hãy hỏi user bằng một câu query sẵn để họ copy-paste.

**Stack khóa cứng:** Next.js 16 (App Router) + TypeScript + Tailwind CSS +
`@supabase/ssr`. Giữ `middleware.ts` (Edge runtime), KHÔNG chuyển sang
`proxy.ts`. Không thêm state-management lib, ORM, date lib, UI kit nào ngoài
chỉ định trong task file.

**Timezone:** mọi logic "hôm nay" tính theo `profiles.timezone` (mặc định
`Asia/Ho_Chi_Minh`) qua helper trong `src/lib/dates.ts`. KHÔNG BAO GIỜ dùng
`new Date().toISOString().slice(0,10)` hay UTC trực tiếp cho ngày nhật ký.

**RLS bắt buộc:** mọi bảng mới phải bật Row Level Security và có policy đầy đủ
NGAY trong cùng file migration tạo bảng. User chỉ đọc/ghi được dữ liệu của
chính mình.

**Bản gốc bất khả xâm phạm:** `entries.content` không bao giờ bị ghi đè bởi bản
AI sửa. Bản AI lưu ở bảng riêng.

**`is_backfill` set một lần duy nhất** lúc INSERT, không đổi khi UPDATE. Không
dùng upsert mù cho việc lưu entry.

**Secrets:** chỉ tồn tại trong `.env.local` (đã có sẵn, không hỏi giá trị,
không in ra). API key AI chỉ dùng phía server — không bao giờ có prefix
`NEXT_PUBLIC_`. Quy tắc chung theo skill `coding-standards`.

**Logic thuần phải có test:** mọi hàm tính toán (ngày tháng, streak, thống kê)
viết dưới dạng pure function trong `src/lib/`, kèm script kiểm chứng chạy được
bằng `node scripts/test_*.mjs`. Không đánh dấu phase xong khi test chưa pass.

**Design tham chiếu:** nếu `docs/design/` tồn tại, UI bám theo đó. Nếu chưa có,
làm UI sạch sẽ tối giản, KHÔNG tự sáng tạo hệ thống design — polish ở Phase 6.

**Không tự thêm feature** ngoài task file. Non-goals trong task file là luật.

## Protocol cho phát hiện ngoài kế hoạch
- **Minor** (chi tiết cục bộ): tự xử lý, ghi vào phase report.
- **Moderate** (giả định sai nhưng có hướng sửa rõ, không đổi kiến trúc): tự xử
  lý, ghi lý do vào `memory/discoveries.md`.
- **Major** (ảnh hưởng kiến trúc / contract phase sau / phá giả định nền tảng):
  DỪNG. Không tự quyết, không sửa plan.md. Viết đề xuất vào
  `memory/discoveries.md`, kết thúc phase sớm, báo user.

Khi ghi discoveries: nếu phát hiện một entry CŨ trong `discoveries.md` là sai,
đừng xóa nó — thêm entry mới đính chính và ghi rõ nó thay thế entry nào.

`docs/plan.md` chỉ được sửa bởi user + model kiến trúc sư — session thực thi
không bao giờ sửa nó.

## Khi kết thúc một phase (bắt buộc, không bỏ qua)
1. Viết `memory/phase_<N>_report.md`.
2. Ghi đè toàn bộ `memory/STATE.md` (thay thế, không append).
3. Cập nhật `memory/discoveries.md` nếu có phát hiện Moderate/Major.
4. Trong report, liệt kê **từng mục** Definition of Done kèm trạng thái thật
   (đã verify / chưa verify / không verify được vì lý do gì). Không tick mục
   chưa thực sự kiểm tra.

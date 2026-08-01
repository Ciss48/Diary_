# UI Invariants — bắt buộc kiểm sau MỌI thay đổi giao diện

Đây là những luật ngầm tích lũy qua 6 phase. Chúng KHÔNG nhìn thấy được từ ảnh
design, nên rất dễ bị xóa mất khi viết lại UI. Mỗi phiên redesign phải tự kiểm
từng mục và báo cáo trạng thái thật.

## Dữ liệu — vi phạm là mất dữ liệu người dùng

- [ ] Không có đường code nào ghi `corrected_version` vào `entries.content`.
      Chỉ có nút **Copy** (clipboard). Không "Use this version", không "Apply".
- [ ] `is_backfill` chỉ set một lần lúc INSERT, không bao giờ đổi khi UPDATE.
      Không dùng upsert mù để lưu entry.
- [ ] Mọi tính toán "hôm nay" đi qua `profiles.timezone`, không dùng
      `new Date().toISOString()` để suy ra ngày nhật ký.
- [ ] Không có biến môi trường nào của AI mang tiền tố `NEXT_PUBLIC_`.
- [ ] Không dùng `dangerouslySetInnerHTML` ở bất kỳ đâu.

## Ý nghĩa hiển thị — vi phạm là số liệu nói dối

- [ ] Bốn trạng thái ô phân biệt được bằng mắt: no entry / written on time /
      backfilled / future. **Backfilled phải khác rõ on-time** — streak chỉ
      tính ngày on-time.
- [ ] Ô hôm nay có dấu hiệu riêng.
- [ ] Chấm mood (happy/sad) vẫn còn trên ô lịch tháng, và không đè mất tín hiệu
      trạng thái ô. Normal và null = không có chấm.
- [ ] Số từ hiển thị dạng **chữ**, không mã hóa thành độ đậm màu. Xanh đậm luôn
      nghĩa là "viết đúng hạn", không bao giờ nghĩa là "viết nhiều".
- [ ] Ngày chỉ có ảnh mà chưa viết chữ → ô KHÔNG sáng, không tính vào streak,
      không tăng total entries.
- [ ] Tuần bắt đầu thứ Hai (nhãn MON–SUN) ở cả heatmap lẫn lịch tháng.

## Hành vi — vi phạm là app khó dùng

- [ ] Autosave debounce 1500ms + lưu khi blur. Có chỉ báo trạng thái lưu,
      không có nút Save.
- [ ] Word count cập nhật realtime khi gõ.
- [ ] Hai pane so sánh cùng chiều cao cố định, cuộn độc lập, có `min-h-0` trên
      mọi flex/grid child trong chuỗi (nếu thiếu sẽ tràn đè lên khối bên dưới).
- [ ] Góc nghiêng ảnh suy ra tất định từ `photo.id`. **Không `Math.random()`** —
      ảnh sẽ giật mỗi lần gõ phím.
- [ ] Không có animation chạy liên tục trên màn hình viết.
- [ ] Click highlight → chọn đúng item trong danh sách changes.
- [ ] Lightbox đóng được bằng cả ba cách: click nền, nút ×, phím Escape.
- [ ] Ngày tương lai không click được.
- [ ] Đếm ngược "N suggestions left today" và nút bị disable đúng lúc.

## Kiểm tra tự động

- [ ] Toàn bộ test script pass nguyên trạng (không sửa fixture cho vừa code mới).
- [ ] `npm run build` sạch.
- [ ] Không file nào trong `src/lib/` bị sửa. Redesign chỉ đụng tầng hiển thị.

## Kiểm tra thủ công

- [ ] Kéo cửa sổ liên tục từ 1920px xuống 360px: không có phần tử nào bị cắt
      bởi mép màn hình, không có gì đè lên chữ ở bất kỳ bề rộng nào.
- [ ] Mở trên điện thoại thật.
- [ ] `prefers-reduced-motion` được tôn trọng.

/**
 * Trả về 'YYYY-MM-DD' của "hôm nay" theo timezone cho trước.
 * Dùng 'en-CA' locale vì nó cho sẵn định dạng YYYY-MM-DD.
 */
export function getTodayInTimezone(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
}

/**
 * dateStr ('YYYY-MM-DD') có phải ngày tương lai so với hôm nay theo tz?
 */
export function isFutureDate(dateStr: string, tz: string): boolean {
  return dateStr > getTodayInTimezone(tz)
}

/**
 * dateStr có đúng định dạng YYYY-MM-DD và là ngày hợp lệ trên lịch?
 */
export function isValidDateString(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false
  const d = new Date(dateStr + 'T00:00:00Z')
  if (isNaN(d.getTime())) return false
  // Kiểm tra ngày không bị tràn (vd 2026-02-30 → JS tự thành 2026-03-02)
  return d.toISOString().slice(0, 10) === dateStr
}

/**
 * Đếm từ. Chuỗi rỗng hoặc chỉ whitespace → 0.
 */
export function countWords(content: string): number {
  return content.trim().split(/\s+/).filter(Boolean).length
}

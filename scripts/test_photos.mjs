/**
 * Tests for pure functions in src/lib/photos.ts
 * (computeTargetSize, validatePhotoFile, buildStoragePath)
 * Run: node scripts/test_photos.mjs
 */
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Inline pure functions — no build dependency. Keep in sync with photos.ts.
// ---------------------------------------------------------------------------

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// photoAngle — djb2 hash, range [-5,5], never 0
function photoAngle(photoId) {
  let h = 5381;
  for (let i = 0; i < photoId.length; i++) {
    h = (((h << 5) + h) + photoId.charCodeAt(i)) >>> 0;
  }
  const raw = (h % 101) / 10 - 5;
  const angle = Math.round(raw * 10) / 10;
  return angle === 0 ? 0.3 : angle;
}

// photoSlot — even index → left, odd → right; row = Math.floor(index/2)
function photoSlot(index) {
  return {
    side: index % 2 === 0 ? 'left' : 'right',
    row: Math.floor(index / 2),
  };
}

// deriveTakenAt — Intl-based, tz-aware
function deriveTakenAt(lastModified, entryDate, tz) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(lastModified));
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
  const localDate = `${get('year')}-${get('month')}-${get('day')}`;
  if (localDate !== entryDate) return null;
  const rawHour = get('hour');
  const hour = rawHour === '24' ? '00' : rawHour;
  const minute = get('minute');
  return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
}

function computeTargetSize(width, height, maxEdge) {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function validatePhotoFile(file) {
  if (file.size === 0) return 'That file appears to be empty.';
  if (!ALLOWED_TYPES.includes(file.type)) return 'Only JPEG, PNG and WebP images are supported.';
  if (file.size > MAX_UPLOAD_BYTES) return 'That image is too large (max 15 MB).';
  return null;
}

function buildStoragePath(userId, entryDate, uuid) {
  return `${userId}/${entryDate}/${uuid}.jpg`;
}

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

let pass = 0;
let fail = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    pass++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    fail++;
  }
}

// ===========================================================================
// computeTargetSize
// ===========================================================================
console.log('\ncomputeTargetSize');

const cases = [
  { w: 800,  h: 600,  ew: 800,  eh: 600,  label: 'smaller than threshold → no upscale' },
  { w: 1600, h: 1200, ew: 1600, eh: 1200, label: 'exactly at threshold' },
  { w: 3200, h: 2400, ew: 1600, eh: 1200, label: 'landscape: width is long side' },
  { w: 2400, h: 3200, ew: 1200, eh: 1600, label: 'portrait: height is long side' },
  { w: 3000, h: 1000, ew: 1600, eh: 533,  label: 'odd ratio → rounded correctly' },
  { w: 1,    h: 1,    ew: 1,    eh: 1,    label: 'tiny 1×1 image' },
  { w: 5000, h: 3,    ew: 1600, eh: 1,    label: 'extreme ratio: result < 1 clamped to 1' },
];

for (const { w, h, ew, eh, label } of cases) {
  test(`(${w}, ${h}) → (${ew}, ${eh}) — ${label}`, () => {
    const result = computeTargetSize(w, h, 1600);
    assert.equal(result.width, ew, `width mismatch: got ${result.width}, want ${ew}`);
    assert.equal(result.height, eh, `height mismatch: got ${result.height}, want ${eh}`);
  });
}

// Integer-and-minimum invariant across all cases
test('ALL cases: both dimensions are integers >= 1', () => {
  for (const { w, h } of cases) {
    const result = computeTargetSize(w, h, 1600);
    assert.ok(Number.isInteger(result.width),  `width not integer for (${w},${h})`);
    assert.ok(Number.isInteger(result.height), `height not integer for (${w},${h})`);
    assert.ok(result.width  >= 1, `width < 1 for (${w},${h})`);
    assert.ok(result.height >= 1, `height < 1 for (${w},${h})`);
  }
});

// ===========================================================================
// validatePhotoFile
// ===========================================================================
console.log('\nvalidatePhotoFile');

test('jpeg 1000 bytes → null (valid)', () => {
  assert.equal(validatePhotoFile({ type: 'image/jpeg', size: 1000 }), null);
});
test('png 1000 bytes → null (valid)', () => {
  assert.equal(validatePhotoFile({ type: 'image/png', size: 1000 }), null);
});
test('webp 1000 bytes → null (valid)', () => {
  assert.equal(validatePhotoFile({ type: 'image/webp', size: 1000 }), null);
});
test('gif → error string (not null)', () => {
  const result = validatePhotoFile({ type: 'image/gif', size: 1000 });
  assert.ok(result !== null, 'expected error string, got null');
  assert.equal(typeof result, 'string');
});
test('application/pdf → error string (not null)', () => {
  const result = validatePhotoFile({ type: 'application/pdf', size: 1000 });
  assert.ok(result !== null, 'expected error string, got null');
  assert.equal(typeof result, 'string');
});
test('jpeg 20 MB → error string (too large)', () => {
  const result = validatePhotoFile({ type: 'image/jpeg', size: 20 * 1024 * 1024 });
  assert.ok(result !== null, 'expected error string, got null');
  assert.equal(typeof result, 'string');
});
test('jpeg size 0 → error string (empty file)', () => {
  const result = validatePhotoFile({ type: 'image/jpeg', size: 0 });
  assert.ok(result !== null, 'expected error string, got null');
  assert.equal(typeof result, 'string');
});

// ===========================================================================
// buildStoragePath
// ===========================================================================
console.log('\nbuildStoragePath');

test("('u1','2026-07-29','abc') → 'u1/2026-07-29/abc.jpg'", () => {
  const path = buildStoragePath('u1', '2026-07-29', 'abc');
  assert.equal(path, 'u1/2026-07-29/abc.jpg');
});
test('path has exactly 3 segments', () => {
  const path = buildStoragePath('u1', '2026-07-29', 'abc');
  assert.equal(path.split('/').length, 3, `expected 3 segments, got: ${path}`);
});
test('first segment equals userId (RLS anchor)', () => {
  const userId = 'some-user-uuid';
  const path = buildStoragePath(userId, '2026-07-29', 'abc');
  assert.equal(path.split('/')[0], userId);
});

// ===========================================================================
// photoAngle
// ===========================================================================
console.log('\nphotoAngle');

test('same id → same angle (deterministic)', () => {
  const a1 = photoAngle('test-id-abc');
  const a2 = photoAngle('test-id-abc');
  assert.equal(a1, a2);
});

const tenIds = ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'h8', 'i9', 'j10'];
const tenAngles = tenIds.map(photoAngle);

test('all 10 angles in [-5, 5]', () => {
  for (const a of tenAngles) {
    assert.ok(a >= -5 && a <= 5, `angle out of range: ${a}`);
  }
});

test('at least 4 distinct values across 10 ids (hash distributes)', () => {
  const distinct = new Set(tenAngles);
  assert.ok(distinct.size >= 4, `only ${distinct.size} distinct values: ${[...distinct]}`);
});

test('no angle is exactly 0', () => {
  for (const a of tenAngles) {
    assert.ok(a !== 0, `got 0 for one of the test ids`);
  }
  assert.ok(photoAngle('test-id-abc') !== 0);
});

// ===========================================================================
// photoSlot
// ===========================================================================
console.log('\nphotoSlot');

test('index 0 → left, row 0', () => {
  const s = photoSlot(0);
  assert.equal(s.side, 'left');
  assert.equal(s.row, 0);
});

test('index 1 → right, row 0', () => {
  const s = photoSlot(1);
  assert.equal(s.side, 'right');
  assert.equal(s.row, 0);
});

test('index 2 → left, row 1', () => {
  const s = photoSlot(2);
  assert.equal(s.side, 'left');
  assert.equal(s.row, 1);
});

test('index 3 → right, row 1', () => {
  const s = photoSlot(3);
  assert.equal(s.side, 'right');
  assert.equal(s.row, 1);
});

// ===========================================================================
// deriveTakenAt  (tz: Asia/Ho_Chi_Minh = UTC+7 year-round)
// ===========================================================================
console.log('\nderiveTakenAt');

const TZ = 'Asia/Ho_Chi_Minh';

test('UTC 03:15 on 2026-07-29 → 10:15 VN time, matches entryDate', () => {
  const result = deriveTakenAt(Date.UTC(2026, 6, 29, 3, 15), '2026-07-29', TZ);
  assert.equal(result, '10:15');
});

test('UTC 03:15 on 2026-07-29 but entryDate is 2026-07-28 → null', () => {
  const result = deriveTakenAt(Date.UTC(2026, 6, 29, 3, 15), '2026-07-28', TZ);
  assert.equal(result, null);
});

test('UTC 18:30 on 2026-07-28 → 01:30 VN (crossed midnight), matches 2026-07-29', () => {
  const result = deriveTakenAt(Date.UTC(2026, 6, 28, 18, 30), '2026-07-29', TZ);
  assert.equal(result, '01:30');
});

test('UTC 00:05 on 2026-07-29 → 07:05 VN (leading zero preserved)', () => {
  const result = deriveTakenAt(Date.UTC(2026, 6, 29, 0, 5), '2026-07-29', TZ);
  assert.equal(result, '07:05');
});

// ===========================================================================
// Summary
// ===========================================================================
console.log(`\n${pass + fail} tests: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

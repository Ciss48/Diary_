import { createClient } from '@/lib/supabase/client'

export const MAX_PHOTOS_PER_ENTRY = 4
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024  // before compression
export const MAX_STORED_BYTES = 5 * 1024 * 1024   // after compression, matches bucket limit
export const MAX_EDGE = 1600                       // longest edge after compression
export const JPEG_QUALITY = 0.82
export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export type PhotoRow = {
  id: string
  storage_path: string
  width: number | null
  height: number | null
  size_bytes: number
  created_at: string
  caption: string | null
  taken_at: string | null
}

// ── Pure functions (testable by Node) ────────────────────────────────────────

/**
 * Deterministic tilt angle for a photo card, in degrees, rounded to 1 decimal.
 * Same photoId → same angle on every render and every page load.
 * Never returns exactly 0. Range: [-5, 5].
 * Algorithm: djb2 hash over the id string, mapped to 101 buckets → [-5, +5].
 */
export function photoAngle(photoId: string): number {
  let h = 5381
  for (let i = 0; i < photoId.length; i++) {
    h = (((h << 5) + h) + photoId.charCodeAt(i)) >>> 0  // djb2, keep 32-bit unsigned
  }
  const raw = (h % 101) / 10 - 5  // -5.0 … +5.0 in steps of 0.1
  const angle = Math.round(raw * 10) / 10
  return angle === 0 ? 0.3 : angle
}

/** Layout slot for a photo at the given (0-based) index.
 *  index 0 → left  row 0
 *  index 1 → right row 0
 *  index 2 → left  row 1
 *  index 3 → right row 1
 */
export type PhotoSlot = { side: 'left' | 'right'; row: number }
export function photoSlot(index: number): PhotoSlot {
  return {
    side: index % 2 === 0 ? 'left' : 'right',
    row: Math.floor(index / 2),
  }
}

/**
 * Derive a suggested taken_at time from a file's lastModified timestamp.
 * Converts the timestamp to the given timezone. Returns 'HH:MM' if the
 * local date matches entryDate, otherwise null.
 * Uses Intl.DateTimeFormat — never getHours() of the local machine.
 */
export function deriveTakenAt(
  lastModified: number,
  entryDate: string,
  tz: string,
): string | null {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = fmt.formatToParts(new Date(lastModified))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const localDate = `${get('year')}-${get('month')}-${get('day')}`
  if (localDate !== entryDate) return null
  const rawHour = get('hour')
  const hour = rawHour === '24' ? '00' : rawHour  // some ICU versions emit '24' for midnight
  const minute = get('minute')
  return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
}

/**
 * Compute target dimensions preserving aspect ratio.
 * Never upscales: if longest edge <= maxEdge, returns original dimensions.
 * Both values are always integers >= 1.
 */
export function computeTargetSize(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= maxEdge) return { width, height }
  const scale = maxEdge / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/**
 * Validate a file before compression.
 * Returns null if valid, or a user-friendly error string.
 */
export function validatePhotoFile(
  file: { type: string; size: number },
): string | null {
  if (file.size === 0) return 'That file appears to be empty.'
  if (!ALLOWED_TYPES.includes(file.type)) return 'Only JPEG, PNG and WebP images are supported.'
  if (file.size > MAX_UPLOAD_BYTES) return 'That image is too large (max 15 MB).'
  return null
}

/**
 * Build the storage path for a photo.
 * Convention: {userId}/{entryDate}/{uuid}.jpg
 * The first segment MUST equal auth.uid() — storage RLS checks (storage.foldername(name))[1].
 */
export function buildStoragePath(
  userId: string,
  entryDate: string,
  uuid: string,
): string {
  return `${userId}/${entryDate}/${uuid}.jpg`
}

// ── Browser-only functions (Canvas API + Supabase) ───────────────────────────

/**
 * Compress a file using the Canvas API.
 *   1. createImageBitmap(file) to get real dimensions.
 *   2. computeTargetSize → draw onto canvas (OffscreenCanvas if available).
 *   3. canvas.toBlob / convertToBlob at JPEG_QUALITY.
 *   4. If resulting blob is larger than the original (already well-compressed),
 *      return the original file as the blob but still report real dimensions.
 *   5. bitmap.close() to free memory.
 * Throws a user-friendly Error if the file cannot be decoded.
 */
export async function compressImage(
  file: File,
): Promise<{ blob: Blob; width: number; height: number }> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('That image could not be decoded. The file may be corrupted.')
  }

  const originalWidth = bitmap.width
  const originalHeight = bitmap.height
  const { width, height } = computeTargetSize(originalWidth, originalHeight, MAX_EDGE)

  let blob: Blob
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY })
  } else {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob returned null'))),
        'image/jpeg',
        JPEG_QUALITY,
      )
    })
  }

  // If compressed result is larger than original, keep original bytes
  if (blob.size > file.size) {
    return { blob: file, width: originalWidth, height: originalHeight }
  }

  return { blob, width, height }
}

/**
 * Fetch all photos for an entry, ordered by created_at ascending.
 */
export async function fetchPhotos(entryId: string): Promise<PhotoRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('entry_photos')
    .select('id, storage_path, width, height, size_bytes, created_at, caption, taken_at')
    .eq('entry_id', entryId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

/**
 * Create signed URLs for a list of storage paths (expires in 1 hour).
 * Returns a map of path → signed URL.
 */
export async function signPhotoUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {}
  const supabase = createClient()
  const { data, error } = await supabase.storage
    .from('diary-photos')
    .createSignedUrls(paths, 3600)
  if (error) throw error
  const map: Record<string, string> = {}
  for (const item of data ?? []) {
    if (item.signedUrl && item.path) map[item.path] = item.signedUrl
  }
  return map
}

/**
 * Upload a photo: compress → upload storage → INSERT row.
 * Upload order is intentional: storage first so we can clean up on INSERT failure.
 * Throws if the compressed blob still exceeds MAX_STORED_BYTES.
 * `timezone` is used to derive taken_at from file.lastModified.
 */
export async function uploadPhoto(
  entryId: string,
  entryDate: string,
  file: File,
  timezone: string,
): Promise<PhotoRow> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { blob, width, height } = await compressImage(file)

  if (blob.size > MAX_STORED_BYTES) {
    throw new Error('That image is still too large after compression (max 5 MB).')
  }

  const uuid = crypto.randomUUID()
  const storagePath = buildStoragePath(user.id, entryDate, uuid)

  const { error: uploadError } = await supabase.storage
    .from('diary-photos')
    .upload(storagePath, blob, { contentType: 'image/jpeg' })
  if (uploadError) throw uploadError

  const takenAt = deriveTakenAt(file.lastModified, entryDate, timezone)

  const { data, error: insertError } = await supabase
    .from('entry_photos')
    .insert({
      user_id: user.id,
      entry_id: entryId,
      storage_path: storagePath,
      width,
      height,
      size_bytes: blob.size,
      taken_at: takenAt,
      caption: null,
    })
    .select('id, storage_path, width, height, size_bytes, created_at, caption, taken_at')
    .single()

  if (insertError) {
    // Clean up the orphaned file rather than leaving it to eat quota silently
    await supabase.storage.from('diary-photos').remove([storagePath])
    throw insertError
  }

  return data
}

/**
 * Update caption and/or taken_at for a photo.
 * Trims caption; empty string → null. takenAt null → clears the column.
 */
export async function updatePhotoMeta(
  photoId: string,
  meta: { caption?: string | null; takenAt?: string | null },
): Promise<void> {
  const supabase = createClient()
  const update: Record<string, string | null> = {}
  if ('caption' in meta) {
    const trimmed = (meta.caption ?? '').trim()
    update.caption = trimmed.length > 0 ? trimmed.slice(0, 80) : null
  }
  if ('takenAt' in meta) {
    update.taken_at = meta.takenAt ?? null
  }
  const { error } = await supabase
    .from('entry_photos')
    .update(update)
    .eq('id', photoId)
  if (error) throw error
}

/**
 * Delete a photo: storage first, then DB row.
 * Reason for order: a DB row pointing to a missing file shows a broken thumbnail
 * that the user can still delete. An orphaned storage file is invisible and
 * consumes quota permanently.
 */
export async function deletePhoto(photoId: string, storagePath: string): Promise<void> {
  const supabase = createClient()

  const { error: storageError } = await supabase.storage
    .from('diary-photos')
    .remove([storagePath])
  if (storageError) throw storageError

  const { error: dbError } = await supabase
    .from('entry_photos')
    .delete()
    .eq('id', photoId)
  if (dbError) throw dbError
}

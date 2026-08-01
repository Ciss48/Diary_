'use client'

import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react'
import { fetchEntry, ensureEntry } from '@/lib/entries'
import {
  MAX_PHOTOS_PER_ENTRY,
  validatePhotoFile,
  fetchPhotos,
  signPhotoUrls,
  uploadPhoto,
  deletePhoto,
  updatePhotoMeta,
  photoAngle,
  photoSlot,
  type PhotoRow,
} from '@/lib/photos'

interface Props {
  entryDate: string
  timezone: string
  onPhotoCountChange?: (n: number) => void
  children: ReactNode
}

export default function PhotoStrip({ entryDate, timezone, onPhotoCountChange, children }: Props) {
  const [loadState, setLoadState] = useState<'loading' | 'ready'>('loading')
  const [entryId, setEntryId] = useState<string | null>(null)
  const [photos, setPhotos] = useState<PhotoRow[]>([])
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})

  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const [batchErrors, setBatchErrors] = useState<string[]>([])
  const [slotWarning, setSlotWarning] = useState<string | null>(null)

  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null)
  const [dragOverStrip, setDragOverStrip] = useState(false)

  const [lightboxPhoto, setLightboxPhoto] = useState<PhotoRow | null>(null)
  const [captionVal, setCaptionVal] = useState('')
  const [takenAtVal, setTakenAtVal] = useState('')
  const [metaSaveStatus, setMetaSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Notify parent of photo count ────────────────────────────────────────────
  useEffect(() => {
    onPhotoCountChange?.(photos.length)
  }, [photos.length, onPhotoCountChange])

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    fetchEntry(entryDate)
      .then(async (entry) => {
        if (cancelled) return
        if (!entry) {
          setLoadState('ready')
          return
        }
        setEntryId(entry.id)
        const rows = await fetchPhotos(entry.id)
        if (cancelled) return
        setPhotos(rows)
        if (rows.length > 0) {
          const urls = await signPhotoUrls(rows.map((r) => r.storage_path))
          if (!cancelled) setSignedUrls(urls)
        }
        setLoadState('ready')
      })
      .catch(() => { if (!cancelled) setLoadState('ready') })
    return () => { cancelled = true }
  }, [entryDate])

  // ── Escape closes lightbox ──────────────────────────────────────────────────
  useEffect(() => {
    if (!lightboxPhoto) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxPhoto(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [lightboxPhoto])

  // ── Sync lightbox state when photo data changes ─────────────────────────────
  useEffect(() => {
    if (!lightboxPhoto) return
    const fresh = photos.find((p) => p.id === lightboxPhoto.id)
    if (fresh) {
      setCaptionVal(fresh.caption ?? '')
      setTakenAtVal(fresh.taken_at ?? '')
    }
  }, [lightboxPhoto?.id, photos]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Single-file upload ──────────────────────────────────────────────────────
  const slotsRemaining = MAX_PHOTOS_PER_ENTRY - photos.length

  const processSingleFile = useCallback(async (file: File) => {
    if (photos.length >= MAX_PHOTOS_PER_ENTRY) {
      setBatchErrors([`Maximum ${MAX_PHOTOS_PER_ENTRY} photos per entry.`])
      return
    }
    setBatchErrors([])
    setSlotWarning(null)
    const validErr = validatePhotoFile(file)
    if (validErr) { setBatchErrors([validErr]); return }
    setUploadProgress('Uploading…')
    try {
      let eid = entryId
      if (!eid) {
        const entry = await ensureEntry(entryDate, timezone)
        eid = entry.id
        setEntryId(eid)
      }
      const row = await uploadPhoto(eid, entryDate, file, timezone)
      const newUrls = await signPhotoUrls([row.storage_path])
      setPhotos((prev) => [...prev, row])
      setSignedUrls((prev) => ({ ...prev, ...newUrls }))
    } catch (err) {
      setBatchErrors([err instanceof Error ? err.message : 'Upload failed.'])
    } finally {
      setUploadProgress(null)
    }
  }, [entryId, entryDate, photos.length, timezone])

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = Array.from(e.target.files ?? [])
      e.target.value = ''
      if (selected.length === 0) return

      setBatchErrors([])
      setSlotWarning(null)

      let toProcess = selected
      if (selected.length > slotsRemaining) {
        setSlotWarning(
          `Only ${slotsRemaining} more photo${slotsRemaining === 1 ? '' : 's'} can be added.`
        )
        toProcess = selected.slice(0, slotsRemaining)
      }

      let eid = entryId
      if (!eid) {
        try {
          const entry = await ensureEntry(entryDate, timezone)
          eid = entry.id
          setEntryId(eid)
        } catch (err) {
          setBatchErrors([err instanceof Error ? err.message : 'Failed to create entry.'])
          return
        }
      }

      const errors: string[] = []
      for (let i = 0; i < toProcess.length; i++) {
        const file = toProcess[i]
        setUploadProgress(
          toProcess.length === 1
            ? 'Uploading…'
            : `Uploading ${i + 1} of ${toProcess.length}…`
        )
        const validErr = validatePhotoFile(file)
        if (validErr) { errors.push(`${file.name}: ${validErr}`); continue }
        try {
          const row = await uploadPhoto(eid, entryDate, file, timezone)
          const newUrls = await signPhotoUrls([row.storage_path])
          setPhotos((prev) => [...prev, row])
          setSignedUrls((prev) => ({ ...prev, ...newUrls }))
        } catch (err) {
          errors.push(`${file.name}: ${err instanceof Error ? err.message : 'Upload failed.'}`)
        }
      }
      setUploadProgress(null)
      if (errors.length > 0) setBatchErrors(errors)
    },
    [entryId, entryDate, slotsRemaining, timezone]
  )

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (photo: PhotoRow) => {
    if (!window.confirm('Delete this photo?')) return
    setDeletingId(photo.id)
    try {
      await deletePhoto(photo.id, photo.storage_path)
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id))
      setSignedUrls((prev) => { const n = { ...prev }; delete n[photo.storage_path]; return n })
      if (lightboxPhoto?.id === photo.id) setLightboxPhoto(null)
    } catch { /* keep in list — user can retry */ }
    finally { setDeletingId(null) }
  }, [lightboxPhoto])

  // ── Lightbox metadata save ──────────────────────────────────────────────────
  const handleMetaSave = useCallback(async () => {
    if (!lightboxPhoto || metaSaveStatus === 'saving') return
    setMetaSaveStatus('saving')
    try {
      const caption = captionVal.trim() || null
      const takenAt = takenAtVal || null
      await updatePhotoMeta(lightboxPhoto.id, { caption, takenAt })
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === lightboxPhoto.id ? { ...p, caption, taken_at: takenAt } : p
        )
      )
      setLightboxPhoto((prev) => prev ? { ...prev, caption, taken_at: takenAt } : null)
      setMetaSaveStatus('saved')
      setTimeout(() => setMetaSaveStatus('idle'), 2000)
    } catch {
      setMetaSaveStatus('idle')
    }
  }, [lightboxPhoto, captionVal, takenAtVal, metaSaveStatus])

  const handleMetaKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); void handleMetaSave() }
  }

  // ── Drag handlers for desktop empty slots ───────────────────────────────────
  const makeSlotDragHandlers = (slotIndex: number) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setDragOverSlot(slotIndex)
    },
    onDragLeave: () => setDragOverSlot(null),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      setDragOverSlot(null)
      const file = e.dataTransfer.files[0]
      if (file) void processSingleFile(file)
    },
  })

  // ── Filled photo card ───────────────────────────────────────────────────────
  const renderFilledCard = (photo: PhotoRow, index: number, extraClass = '', clampH = false) => {
    const url = signedUrls[photo.storage_path] ?? ''
    const angle = photoAngle(photo.id)
    return (
      <div
        key={photo.id}
        className={`hv-photo relative bg-card rounded-[3px] p-2.5 shadow-[var(--shadow-2)] cursor-pointer select-none group ${extraClass}`}
        style={{ transform: `rotate(${angle}deg)` }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = 'rotate(0deg) scale(1.05)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = `rotate(${angle}deg)` }}
        onClick={() => {
          setLightboxPhoto(photo)
          setCaptionVal(photo.caption ?? '')
          setTakenAtVal(photo.taken_at ?? '')
          setMetaSaveStatus('idle')
        }}
      >
        <div className={`overflow-hidden rounded-[2px] bg-paper-2${clampH ? ' max-h-[calc(45vh-5.25rem)]' : ''}`}
          style={{ aspectRatio: '4/5' }}>
          {url ? (
            <img
              src={url}
              alt={photo.caption ?? ''}
              width={photo.width ?? undefined}
              height={photo.height ?? undefined}
              className="w-full h-full object-cover block"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-ink-3">
              <CameraIcon />
            </div>
          )}
        </div>
        <div className="flex items-start justify-between mt-1.5 px-0.5 min-h-[1.25rem]">
          {photo.caption ? (
            <span className="font-serif text-[13px] text-ink-3 truncate">{photo.caption}</span>
          ) : (
            <span />
          )}
          {photo.taken_at ? (
            <span className="font-mono text-[13px] text-ink-3 ml-2 shrink-0">{photo.taken_at}</span>
          ) : null}
        </div>
        {/* Delete button */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); void handleDelete(photo) }}
          disabled={deletingId === photo.id}
          aria-label="Delete photo"
          className={[
            'absolute top-1 right-1 w-5 h-5 rounded-full',
            'bg-black/60 text-white text-xs leading-none',
            'flex items-center justify-center',
            'opacity-0 group-hover:opacity-100 transition-opacity',
            'cursor-pointer border-0',
            deletingId === photo.id ? 'cursor-wait' : '',
          ].join(' ')}
        >
          ×
        </button>
      </div>
    )
  }

  // ── Empty slot card ─────────────────────────────────────────────────────────
  const renderEmptySlot = (slotIndex: number, key: string, extraClass = '', clampH = false) => {
    const angle = photoAngle(`${entryDate}-slot-${slotIndex}`)
    const isDragOver = dragOverSlot === slotIndex
    const dragHandlers = makeSlotDragHandlers(slotIndex)
    return (
      <div
        key={key}
        className={[
          'relative bg-card rounded-[3px] p-2.5 select-none cursor-pointer',
          'border border-dashed transition-all duration-300',
          isDragOver ? 'border-ink bg-paper-2' : 'border-line-2 hover:border-ink-3',
          extraClass,
        ].join(' ')}
        style={{ transform: `rotate(${angle}deg)` }}
        onClick={() => { if (slotsRemaining > 0 && uploadProgress === null) fileInputRef.current?.click() }}
        {...dragHandlers}
      >
        <div
          className={`flex flex-col items-center justify-center gap-2 bg-paper-2 rounded-[2px]${clampH ? ' max-h-[calc(45vh-5.25rem)]' : ''}`}
          style={{ aspectRatio: '4/5' }}
        >
          <span className="font-serif italic text-[15px] text-ink-3">Drop a photo</span>
          <span className="text-[11.5px] text-ink-3">
            or <a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); fileInputRef.current?.click() }}>browse files</a>
          </span>
        </div>
        <div className="font-serif text-[13px] text-ink-3 pt-[9px] px-0.5 pb-[3px]">
          Slot {slotIndex + 1} of {MAX_PHOTOS_PER_ENTRY}
        </div>
      </div>
    )
  }

  // ── Compute left/right gutter contents ──────────────────────────────────────
  const leftGutter: ReactNode[] = []
  const rightGutter: ReactNode[] = []

  for (let i = 0; i < MAX_PHOTOS_PER_ENTRY; i++) {
    const slot = photoSlot(i)
    const photo = photos[i]
    const node = photo
      ? renderFilledCard(photo, i, 'max-w-[300px] w-full', true)
      : (slotsRemaining > 0 ? renderEmptySlot(i, `empty-${i}`, 'max-w-[300px] w-full', true) : null)
    if (node === null) continue
    if (slot.side === 'left') leftGutter.push(node)
    else rightGutter.push(node)
  }

  // ── Mobile strip cards ──────────────────────────────────────────────────────
  const mobileCards: ReactNode[] = photos.map((photo, i) =>
    <div key={photo.id} className="snap-start shrink-0 w-[65vw] max-w-[360px]">
      {renderFilledCard(photo, i, 'w-full')}
    </div>
  )
  if (slotsRemaining > 0) {
    const nextSlotIndex = photos.length
    mobileCards.push(
      <div
        key="mobile-add"
        className="snap-start shrink-0 w-[65vw] max-w-[360px]"
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDragOverStrip(true) }}
        onDragLeave={() => setDragOverStrip(false)}
        onDrop={(e) => { e.preventDefault(); setDragOverStrip(false); const f = e.dataTransfer.files[0]; if (f) void processSingleFile(f) }}
      >
        {renderEmptySlot(nextSlotIndex, `mobile-empty-${nextSlotIndex}`, 'w-full')}
      </div>
    )
  }

  // ── Status messages ─────────────────────────────────────────────────────────
  const statusMessages = (
    <>
      {uploadProgress && (
        <p className="mt-2 text-[12px] text-ink-3">{uploadProgress}</p>
      )}
      {slotWarning && (
        <p className="mt-2 text-[12px] text-brass">{slotWarning}</p>
      )}
      {batchErrors.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {batchErrors.map((err, i) => (
            <li key={i} className="text-[12px] text-wax">{err}</li>
          ))}
        </ul>
      )}
    </>
  )

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Mobile / tablet: horizontal scroll strip */}
      {loadState === 'ready' && (
        <div className="min-[1704px]:hidden mb-4">
          {mobileCards.length > 0 ? (
            <div
              className={[
                'flex gap-4 overflow-x-auto snap-x scroll-smooth',
                'px-4 -mx-4 pb-4',
                '[overflow-clip-margin:0]',
                dragOverStrip ? 'bg-paper-2 rounded-lg' : '',
              ].join(' ')}
            >
              {mobileCards}
            </div>
          ) : null}
          {statusMessages}
        </div>
      )}

      {/* Desktop: 3-column grid (≥1704px) */}
      <div className={[
        'min-[1704px]:grid',
        'min-[1704px]:grid-cols-[minmax(0,300px)_minmax(0,64rem)_minmax(0,300px)]',
        'min-[1704px]:gap-6',
        'min-[1704px]:max-w-[1704px]',
        'min-[1704px]:mx-auto',
        'min-[1704px]:px-4',
      ].join(' ')}>

        {/* Left gutter */}
        <div className="hidden min-[1704px]:flex flex-col gap-4 items-end pt-1">
          {loadState === 'ready' ? leftGutter : null}
        </div>

        {/* Center column */}
        <div className="min-w-0">
          {children}
          <div className="hidden min-[1704px]:block">
            {loadState === 'ready' && statusMessages}
          </div>
        </div>

        {/* Right gutter */}
        <div className="hidden min-[1704px]:flex flex-col gap-4 pt-1">
          {loadState === 'ready' ? rightGutter : null}
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {/* ── Lightbox ─────────────────────────────────────────────────────────── */}
      {lightboxPhoto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Photo viewer"
          className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center gap-4 p-4"
          onClick={() => setLightboxPhoto(null)}
        >
          {/* Close button */}
          <button
            type="button"
            onClick={() => setLightboxPhoto(null)}
            aria-label="Close photo viewer"
            className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full
              bg-black/50 text-white text-xl hover:bg-black/70 cursor-pointer border-0"
          >
            ×
          </button>

          {/* Image */}
          <img
            src={signedUrls[lightboxPhoto.storage_path] ?? ''}
            alt={lightboxPhoto.caption ?? ''}
            width={lightboxPhoto.width ?? undefined}
            height={lightboxPhoto.height ?? undefined}
            className="max-h-[70vh] max-w-[90vw] object-contain rounded-lg shadow-[var(--shadow-3)]"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Metadata editing */}
          <div
            className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="text"
              value={captionVal}
              maxLength={80}
              placeholder="Add a caption…"
              onChange={(e) => setCaptionVal(e.target.value)}
              onBlur={() => void handleMetaSave()}
              onKeyDown={handleMetaKeyDown}
              className="flex-1 rounded-lg border border-ink-3/40 bg-black/40 text-white placeholder:text-ink-3
                px-3 py-2 text-sm font-serif focus:outline-none focus:ring-1 focus:ring-brass"
            />
            <input
              type="time"
              value={takenAtVal}
              onChange={(e) => setTakenAtVal(e.target.value)}
              onBlur={() => void handleMetaSave()}
              onKeyDown={handleMetaKeyDown}
              className="rounded-lg border border-ink-3/40 bg-black/40 text-white font-mono
                px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brass w-full sm:w-auto"
            />
            <span className="text-[12px] text-ink-3 shrink-0 self-center">
              {metaSaveStatus === 'saving' ? 'Saving…' : metaSaveStatus === 'saved' ? 'Saved ✓' : ''}
            </span>
          </div>

          {/* Delete link */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); void handleDelete(lightboxPhoto) }}
            disabled={deletingId === lightboxPhoto.id}
            className="text-[12px] text-ink-3 hover:text-wax transition-colors cursor-pointer bg-transparent border-0"
          >
            {deletingId === lightboxPhoto.id ? 'Deleting…' : 'Delete photo'}
          </button>
        </div>
      )}
    </>
  )
}

function CameraIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  )
}

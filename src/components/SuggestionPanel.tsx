'use client'

interface Props {
  loadingStage: 1 | 2 | null
  error: string | null
  remaining: number
  canRequestStage1: boolean
  canRequestStage2: boolean
  hasStage1: boolean
  stage1Drifted: boolean
  onRequestStage1: () => void
  onRequestStage2: () => void
}

export default function SuggestionPanel({
  loadingStage,
  error,
  remaining,
  canRequestStage1,
  canRequestStage2,
  hasStage1,
  stage1Drifted,
  onRequestStage1,
  onRequestStage2,
}: Props) {
  const loading = loadingStage !== null

  return (
    <div className="mt-[14px]">
      <div className="flex items-center gap-[14px] flex-wrap">
        {/* Stage 1 — always visible */}
        <button
          onClick={onRequestStage1}
          disabled={!canRequestStage1}
          className="hv-lift border-0 cursor-pointer bg-ink text-paper font-sans text-[14px] font-medium
            px-[22px] py-[13px] rounded-[10px] shadow-[var(--shadow-1)]
            disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loadingStage === 1 ? 'Reviewing…' : 'Fix my English'}
        </button>

        {/* Stage 2 — only after stage 1 exists and entry hasn't drifted */}
        {hasStage1 && !stage1Drifted && (
          <button
            onClick={onRequestStage2}
            disabled={!canRequestStage2}
            className="hv-lift border-0 cursor-pointer bg-leaf text-white font-sans text-[14px] font-medium
              px-[22px] py-[13px] rounded-[10px] shadow-[var(--shadow-1)]
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loadingStage === 2 ? 'Improving…' : 'Write It Like a Native'}
          </button>
        )}

        <span className="text-[12.5px] text-ink-3">
          {remaining} suggestion{remaining !== 1 ? 's' : ''} left today
        </span>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="mt-4 flex flex-col gap-4 pl-1">
          <div className="flex items-center gap-2.5">
            <span className="an-pulse w-2 h-2 rounded-full bg-leaf" />
            <span className="font-serif italic text-[15px] text-ink-2">
              {loadingStage === 1 ? 'Reading your entry…' : 'Polishing the style…'}
            </span>
          </div>
          <div className="flex flex-col gap-2.5 max-w-md">
            {['96%', '88%', '74%', '92%', '60%', '84%', '90%', '70%', '46%'].map((w, i) => (
              <div
                key={i}
                className="relative h-[13px] rounded-[3px] bg-paper-2 overflow-hidden"
                style={{ width: w }}
              >
                <div
                  className="an-sweep absolute inset-0 w-[34%]"
                  style={{
                    background: 'linear-gradient(90deg, transparent, var(--leaf-soft), transparent)',
                    animationDelay: `${(i * 0.12).toFixed(2)}s`,
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="mt-4 flex flex-col items-start gap-[14px]">
          <div className="flex flex-col gap-2">
            <span className="font-serif text-[19px] text-wax">The note came back blank.</span>
            <span className="text-[13.5px] text-ink-3 max-w-[34ch] leading-[1.6]" style={{ textWrap: 'pretty' as string }}>
              {error === 'Could not reach the server.'
                ? error
                : 'Something went wrong on our side. Your entry is safe and unchanged.'}
            </span>
          </div>
          <button
            onClick={onRequestStage1}
            disabled={!canRequestStage1}
            className="border border-wax bg-transparent text-wax cursor-pointer font-sans text-[13.5px]
              font-medium px-[18px] py-[10px] rounded-[9px]
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  )
}

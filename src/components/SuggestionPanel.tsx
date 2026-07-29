'use client'

interface Props {
  loading: boolean
  error: string | null
  remaining: number
  canRequest: boolean
  onRequest: () => void
}

export default function SuggestionPanel({
  loading,
  error,
  remaining,
  canRequest,
  onRequest,
}: Props) {
  return (
    <div className="mt-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={onRequest}
          disabled={!canRequest}
          className="px-4 py-2 rounded-lg bg-gray-800 text-white text-sm font-medium
                     hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed
                     transition-colors"
        >
          {loading ? 'Reviewing…' : 'Suggest better English'}
        </button>
        <span className="text-xs text-gray-400">
          {remaining} suggestion{remaining !== 1 ? 's' : ''} left today
        </span>
      </div>

      {loading && (
        <p className="mt-3 text-sm text-gray-400">Reviewing your entry…</p>
      )}

      {!loading && error && (
        <div className="mt-3 flex items-center gap-3">
          <p className="text-sm text-red-500">{error}</p>
          <button
            onClick={onRequest}
            disabled={!canRequest}
            className="text-sm text-gray-600 underline hover:text-gray-900
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  )
}

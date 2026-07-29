'use client'

import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const handleGoogleSignIn = async () => {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${location.origin}/auth/callback`,
      },
    })
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200 w-full max-w-sm text-center">
        <h1 className="text-2xl font-semibold mb-2 text-gray-900">Diary</h1>
        <p className="text-gray-500 text-sm mb-8">Learn English by writing every day</p>
        <button
          onClick={handleGoogleSignIn}
          className="w-full flex items-center justify-center gap-3 border border-gray-300 rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.84-1.6 2.4v2h2.6c1.52-1.4 2.4-3.47 2.4-5.93 0-.55-.05-1.08-.17-1.47z"
            />
            <path
              fill="#34A853"
              d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2c-.72.48-1.63.76-2.7.76-2.08 0-3.84-1.4-4.47-3.29H1.87v2.07A8 8 0 0 0 8.98 17z"
            />
            <path
              fill="#FBBC05"
              d="M4.51 10.53A4.8 4.8 0 0 1 4.26 9c0-.53.09-1.05.25-1.53V5.4H1.87A8 8 0 0 0 .98 9c0 1.29.31 2.51.89 3.6l2.64-2.07z"
            />
            <path
              fill="#EA4335"
              d="M8.98 3.58c1.17 0 2.22.4 3.04 1.2l2.28-2.28C12.95 1.19 11.14.38 8.98.38A8 8 0 0 0 1.87 5.4l2.64 2.07c.63-1.89 2.39-3.29 4.47-3.29z"
            />
          </svg>
          Continue with Google
        </button>
      </div>
    </main>
  )
}

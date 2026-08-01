'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function SignOutButton() {
  const router = useRouter()

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <button
      onClick={handleSignOut}
      className="text-[13px] text-ink-3 hover:text-ink cursor-pointer bg-transparent border-0 underline underline-offset-2 transition-colors"
    >
      Sign out
    </button>
  )
}

'use client'

import { AdminConsole } from '@/screens/admin/AdminConsole'

export default function AdminPage() {
  return (
    <main id="main-content" style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px 64px' }}>
      <AdminConsole />
    </main>
  )
}

'use client'

import { User } from '@prisma/client'

interface UserSelectProps {
  users: User[]
  value?: string | null
  onChange: (value: string | null) => void
  label?: string
  required?: boolean
}

export function UserSelect({ users, value, onChange, label = 'Assegnato a', required = false }: UserSelectProps) {
  // Protezione contro users undefined
  const safeUsers = users || []
  
  return (
    <div>
      <label className="block text-sm font-medium text-white mb-1">
        {label} {required && '*'}
      </label>
      <select
        required={required}
        value={value || ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-accent"
      >
        <option value="">Nessuno</option>
        {safeUsers.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name}
          </option>
        ))}
      </select>
    </div>
  )
}


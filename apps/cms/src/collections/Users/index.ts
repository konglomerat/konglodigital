import type { CollectionConfig } from 'payload'

import { authenticated } from '../../access/authenticated'
import { ssoEnabled } from '../../auth/supabase/core'
import { supabaseMe, supabaseRefresh, supabaseStrategy } from '../../auth/supabase/strategy'

const useSupabase = ssoEnabled()

export const Users: CollectionConfig = {
  slug: 'users',
  access: {
    admin: authenticated,
    create: authenticated,
    delete: authenticated,
    read: authenticated,
    update: authenticated,
  },
  admin: {
    defaultColumns: ['name', 'email'],
    useAsTitle: 'name',
  },
  auth: useSupabase
    ? {
        disableLocalStrategy: { enableFields: true, optionalPassword: true },
        useSessions: false,
        strategies: [supabaseStrategy],
        removeTokenFromResponses: true,
        cookies: {
          sameSite: 'Lax',
          secure: process.env.NEXT_PUBLIC_SERVER_URL?.startsWith('https:') ?? false,
        },
      }
    : true,
  hooks: useSupabase ? { me: [supabaseMe], refresh: [supabaseRefresh] } : {},
  fields: [
    {
      name: 'name',
      type: 'text',
    },
    {
      name: 'supabaseId',
      type: 'text',
      unique: true,
      index: true,
      admin: { readOnly: true, description: 'Wird beim Supabase-Login automatisch zugeordnet.' },
      access: { create: () => false, update: () => false },
    },
  ],
  timestamps: true,
}

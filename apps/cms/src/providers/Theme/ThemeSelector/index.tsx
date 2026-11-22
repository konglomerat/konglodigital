'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import React, { useSyncExternalStore } from 'react'

import { themeIsValid } from '../types'

import { useTheme } from '..'
import { getServerThemePreference, getThemePreference, subscribeToTheme } from '../store'

export const ThemeSelector: React.FC = () => {
  const { setTheme } = useTheme()
  const value = useSyncExternalStore(subscribeToTheme, getThemePreference, getServerThemePreference)

  const onThemeChange = (value: string) => {
    if (value === 'auto') setTheme(null)
    else if (themeIsValid(value)) setTheme(value)
  }

  return (
    <Select onValueChange={onThemeChange} value={value}>
      <SelectTrigger
        aria-label="Select a theme"
        className="w-auto bg-transparent gap-2 pl-0 md:pl-3 border-none"
      >
        <SelectValue placeholder="Theme" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="auto">Auto</SelectItem>
        <SelectItem value="light">Light</SelectItem>
        <SelectItem value="dark">Dark</SelectItem>
      </SelectContent>
    </Select>
  )
}

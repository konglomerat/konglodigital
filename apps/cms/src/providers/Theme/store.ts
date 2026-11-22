import { defaultTheme, getImplicitPreference, themeLocalStorageKey } from './shared'
import { themeIsValid, type Theme } from './types'

const themeChangeEvent = 'payload-theme-change'

export function getThemePreference(): Theme | 'auto' {
  const value = window.localStorage.getItem(themeLocalStorageKey)
  return themeIsValid(value) ? value : 'auto'
}

export function getThemeSnapshot(): Theme {
  const preference = getThemePreference()
  return preference === 'auto' ? getImplicitPreference() || defaultTheme : preference
}

// The server and the initial hydration render must agree before reading browser state.
export const getServerThemeSnapshot = (): undefined => undefined
export const getServerThemePreference = (): 'auto' => 'auto'

export function setThemePreference(theme: Theme | null) {
  if (theme === null) window.localStorage.removeItem(themeLocalStorageKey)
  else window.localStorage.setItem(themeLocalStorageKey, theme)
  window.dispatchEvent(new Event(themeChangeEvent))
}

export function subscribeToTheme(onChange: () => void) {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const onStorage = (event: StorageEvent) => {
    if (event.key === themeLocalStorageKey || event.key === null) onChange()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(themeChangeEvent, onChange)
  media.addEventListener('change', onChange)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(themeChangeEvent, onChange)
    media.removeEventListener('change', onChange)
  }
}

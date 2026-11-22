import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import React from 'react'
import { renderToString } from 'react-dom/server'

function compile(file, mocks, globals = {}) {
  const exports = {}
  const source = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText
  runInNewContext(source, {
    exports,
    Event,
    ...globals,
    require: (name) => {
      assert.ok(Object.hasOwn(mocks, name), `Unexpected import: ${name}`)
      return mocks[name]
    },
  })
  return exports
}

function setup() {
  const window = new EventTarget()
  const media = new EventTarget()
  media.matches = false
  const values = new Map()
  window.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }
  window.matchMedia = () => media
  const types = compile('src/providers/Theme/types.ts', {})
  const shared = compile('src/providers/Theme/shared.ts', {}, { window })
  const store = compile(
    'src/providers/Theme/store.ts',
    { './shared': shared, './types': types },
    { window },
  )
  const storageEvent = (key) => {
    const event = new Event('storage')
    Object.defineProperty(event, 'key', { value: key })
    window.dispatchEvent(event)
  }
  return { window, media, store, storageEvent }
}

test('auto follows system preference; explicit choice overrides it and can be cleared', () => {
  const { media, store, window } = setup()
  assert.equal(store.getThemePreference(), 'auto')
  assert.equal(store.getThemeSnapshot(), 'light')
  media.matches = true
  assert.equal(store.getThemeSnapshot(), 'dark')
  store.setThemePreference('light')
  assert.equal(store.getThemeSnapshot(), 'light')
  assert.equal(window.localStorage.getItem('payload-theme'), 'light')
  store.setThemePreference(null)
  assert.equal(store.getThemePreference(), 'auto')
  assert.equal(store.getThemeSnapshot(), 'dark')
  window.localStorage.setItem('payload-theme', 'invalid')
  assert.equal(store.getThemeSnapshot(), 'dark')
})

test('theme subscriptions notify local, other-tab and system changes, and clean up', () => {
  const { media, store, window, storageEvent } = setup()
  let notifications = 0
  const unsubscribe = store.subscribeToTheme(() => notifications++)
  store.setThemePreference('dark')
  assert.equal(notifications, 1)
  window.localStorage.setItem('payload-theme', 'light')
  storageEvent('payload-theme')
  assert.equal(notifications, 2)
  assert.equal(store.getThemeSnapshot(), 'light')
  storageEvent('unrelated-key')
  assert.equal(notifications, 2)
  storageEvent(null)
  media.dispatchEvent(new Event('change'))
  assert.equal(notifications, 4)
  unsubscribe()
  store.setThemePreference(null)
  storageEvent('payload-theme')
  media.dispatchEvent(new Event('change'))
  assert.equal(notifications, 4)
})

test('server rendering is stable with or without a saved browser theme', () => {
  const { store } = setup()
  const provider = compile('src/providers/Theme/index.tsx', {
    react: React,
    'react/jsx-runtime': { jsx: React.createElement },
    './store': store,
  })
  function Consumer() {
    return React.createElement('span', null, provider.useTheme().theme ?? 'pending')
  }
  const render = () =>
    renderToString(React.createElement(provider.ThemeProvider, null, React.createElement(Consumer)))
  assert.equal(render(), '<span>pending</span>')
  store.setThemePreference('dark')
  assert.equal(render(), '<span>pending</span>')
  assert.equal(store.getServerThemeSnapshot(), undefined)
  assert.equal(store.getServerThemePreference(), 'auto')
})

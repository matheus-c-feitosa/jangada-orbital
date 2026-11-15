import { describe, expect, test } from 'vitest'
import { DICTIONARY, makeI18n } from '../src/i18n'
import { fold } from '../src/AreaPanel'

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('English and Portuguese', () => {
  test('every string exists in both languages, with the same placeholders', () => {
    for (const [key, [en, pt]] of Object.entries(DICTIONARY)) {
      expect(en.trim(), key).not.toBe('')
      expect(pt.trim(), key).not.toBe('')
      expect(placeholders(pt), key).toEqual(placeholders(en))
    }
  })

  test('formatters are built once per language and follow the locale', () => {
    expect(makeI18n('pt')).toBe(makeI18n('pt'))
    expect(makeI18n('en').int(14_100)).toBe('14,100')
    expect(makeI18n('pt').int(14_100)).toBe('14.100')
    expect(makeI18n('pt').k(141_000)).toBe('141 mil')
  })

  test('municipality search ignores accents and case', () => {
    expect(fold('São Paulo, SP')).toBe(fold('sao paulo, sp'))
    expect(fold('Crato, CE').includes(fold('crato'))).toBe(true)
  })
})

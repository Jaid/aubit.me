import {expect, test} from 'bun:test'

const {default: aubitMe} = await import('#src/main.ts')
test('should run', () => {
  const result = aubitMe()
  expect(result).toBe('aubit.me') // TODO Test actual functionality
})

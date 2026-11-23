export const formatCount = (value: number) => {
  if (Math.abs(value) < 10_000) {
    return String(value)
  }
  return value.toLocaleString('en-US').replaceAll(',', '\u{202F}')
}
export const pluralize = (count: number, singular: string, plural = `${singular}s`) => `${formatCount(count)} ${count === 1 ? singular : plural}`
export const joinList = (items: ReadonlyArray<string>) => {
  if (items.length <= 1) {
    return items.join('')
  }
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}

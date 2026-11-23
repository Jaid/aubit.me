export function getNavigationIndex(key: string, current: number, length: number, vertical = false) {
  if (key === 'ArrowLeft' || vertical && key === 'ArrowUp') {
    return (current + length - 1) % length
  }
  if (key === 'ArrowRight' || vertical && key === 'ArrowDown') {
    return (current + 1) % length
  }
  if (key === 'Home') {
    return 0
  }
  if (key === 'End') {
    return length - 1
  }
}

/** Download exact UTF-8 bytes; retain the object URL long enough for the browser to consume it. */
export function downloadText(text: string, filename: string, mime = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], {type: `${mime};charset=utf-8`}))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    throw new Error('Clipboard access is unavailable. Use the download button instead. Clipboard access requires HTTPS or localhost.')
  }
}

import ViteSession from 'vite-session'

/** serves a build output folder as-is and a source folder (one with a package.json) through the dev server */
export const createViteSession = async (root: string) => {
  const isSourceFolder = await Bun.file(`${root}/package.json`).exists()
  const session = new ViteSession({
    root,
    preview: !isSourceFolder,
  })
  await session.init()
  return session
}

import Monacozen from 'monacozen'

import EditorBoundary from '#component/EditorBoundary'
import {useTheme} from '#src/hooks/useTheme.ts'

import css from './style.module.sass'

type Props = {
  label: string
  language: string
  path: string
  value: string
}
/** read-only Monaco view for generated output */
export default ({value, language, path, label}: Props) => {
  const theme = useTheme()
  return <div className={css.container}>
    <EditorBoundary fallback={<pre className={css.fallback} aria-label={label}>{value}</pre>}>
      <Monacozen
        aria-label={label} dark={theme === 'dark'} language={language} loading={<div className={css.loading} />} monaco={{
          padding: {
            top: 10,
            bottom: 10,
          },
          renderWhitespace: 'none',
          domReadOnly: true,
        }} path={path} readOnly value={value}
      />
    </EditorBoundary>
  </div>
}

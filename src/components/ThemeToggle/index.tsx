import {setTheme, useThemePreference} from '#src/hooks/useTheme.ts'

import css from './style.module.sass'

export default function ThemeToggle() {
  const preference = useThemePreference()
  const next = preference === 'system' ? 'dark' : (preference === 'dark' ? 'light' : 'system')
  return <button className={css.button} aria-label={`Theme: ${preference}`} title={`Theme: ${preference}. Switch to ${next}.`} type='button' onClick={() => setTheme(next)}>
    <svg aria-hidden fill='none' height='16' stroke='currentColor' strokeLinecap='round' strokeWidth='1.8' viewBox='0 0 24 24' width='16'>
      {preference === 'system' ? <path d='M3 4h18v13H3zM8 21h8M12 17v4' /> : (preference === 'dark' ? <path d='M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z'/> : <><circle cx='12' cy='12' r='4'/><path d='M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'/></>)}
    </svg>
  </button>
}

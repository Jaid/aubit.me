import css from './style.module.sass'

type Props = {
  disabled: boolean
  enabled: boolean
  id: string
  onToggle: () => void
  pending: boolean
  title?: string
}

export default function EntrySwitch({id, enabled, disabled, pending, onToggle, title}: Props) {
  return <button className={css.switch} aria-checked={enabled} aria-disabled={pending || disabled} aria-label={`Include ${id} in report`} disabled={disabled} role='switch' title={title ?? (enabled ? 'Included in report' : 'Excluded from report')} type='button' onClick={pending ? undefined : onToggle} />
}

import type {SuggestedChange} from '#src/lib/report/index.ts'

import EditView from '#component/EditView'

import css from './style.module.sass'

type Props = {
  change: SuggestedChange
}
/** all edits for one file */
export default ({change}: Props) => {
  return <section className={css.change}>
    <header className={css.file} title={change.file}>
      <span className={css.icon} aria-hidden>❯</span>
      <span className={css.path}>
        <span className={css.folder}>{change.folder}</span>
        <span className={css.name}>{change.fileName}</span>
      </span>
      {change.language && <span className={css.language}>{change.language}</span>}
    </header>
    <div className={css.edits}>
      {change.edits.map((edit, index) => <EditView key={index} change={change} edit={edit} />)}
    </div>
  </section>
}

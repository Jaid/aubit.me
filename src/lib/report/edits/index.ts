import type {EditData} from '#src/lib/aubitSchema.ts'
import type {Edit} from './base/Edit.ts'

import {createNeedle} from '../needles/index.ts'
import {AppendEdit, OverwriteEdit, PrependEdit} from './ContentEdit.ts'
import {DeleteEdit, EmptyEdit, EnsureEdit} from './FileStateEdit.ts'
import {EraseEdit, InsertEdit, ReplaceEdit} from './NeedleEdit.ts'
import {MoveEdit, RenameEdit} from './PathEdit.ts'

export const createEdit = (data: EditData): Edit => {
  switch (data.action) {
    case 'delete': { return new DeleteEdit }
    case 'ensure': { return new EnsureEdit }
    case 'empty': { return new EmptyEdit }
    case 'rename': { return new RenameEdit(data.to) }
    case 'move': { return new MoveEdit(data.to) }
    case 'overwrite': { return new OverwriteEdit(data.content) }
    case 'append': { return new AppendEdit(data.content) }
    case 'prepend': { return new PrependEdit(data.content) }
    case 'edit': { return new ReplaceEdit(createNeedle(data.needle), data.replacement) }
    case 'insert_before':
    case 'insert_after': { return new InsertEdit(data.action, createNeedle(data.needle), data.content) }
    case 'erase': { return new EraseEdit(createNeedle(data.needle)) }
  }
}
export type {EditContext, EditTone} from './base/Edit.ts'
export {Edit} from './base/Edit.ts'
export {AppendEdit, ContentEdit, OverwriteEdit, PrependEdit} from './ContentEdit.ts'
export {DeleteEdit, EmptyEdit, EnsureEdit} from './FileStateEdit.ts'
export {EraseEdit, InsertEdit, NeedleEdit, ReplaceEdit} from './NeedleEdit.ts'
export {MoveEdit, PathEdit, RenameEdit} from './PathEdit.ts'

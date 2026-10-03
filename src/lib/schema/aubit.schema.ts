import zod from 'zod'
import arrayable from 'zod-arrayable'

// eslint-disable-next-line zod/prefer-enum-over-literal-union
const categorySchema = zod.union([zod.literal('correctness'), zod.literal('consistency'), zod.literal('consistency.patterns').describe('unnecessarily mixed approaches in a single architectural context'), zod.literal('consistency.naming'), zod.literal('consistency.behavior'), zod.literal('consistency.style'), zod.literal('security'), zod.literal('security.leak').describe('sensitive data exposed in non-gitignored places'), zod.literal('resilience'), zod.literal('hygiene'), zod.literal('performance'), zod.literal('accessibility'), zod.literal('language').describe('issues regarding human language'), zod.literal('language.spelling').describe('spelling mistakes / typos'), zod.literal('language.formatting'), zod.literal('language.dialect').describe('issues like British wording in a mostly American codebase'), zod.literal('language.grammar').describe('grammatical issues'), zod.literal('language.style'), zod.literal('documentation'), zod.literal('documentation.mismatch').describe('described behavior is out of sync with actual behavior'), zod.literal('misc')])
// eslint-disable-next-line zod/prefer-enum-over-literal-union
const prioritySchema = zod.union([zod.literal(0).describe('P0 – critical'), zod.literal(1).describe('P1 – high'), zod.literal(2).describe('P2 – moderate'), zod.literal(3).describe('P3 – low'), zod.literal(4).describe('P4 – trivial')])
// eslint-disable-next-line zod/prefer-enum-over-literal-union
const regexpFlagsSchema = zod.union([zod.literal('v').describe('enhanced Unicode support'), zod.literal('i').describe('case-insensitive'), zod.literal('m').describe('multiline'), zod.literal('s').describe('dotAll')]).describe('ECMAScript RegExp flags')
const patternSchema = zod.strictObject({
  regex: zod.string(),
  flags: arrayable(regexpFlagsSchema).default('v'),
})
const needleSchema = zod.union([zod.string(), patternSchema, zod.strictObject({line: zod.int().min(1).describe('1-indexed line number')})])
const editSchema = zod.discriminatedUnion('action', [zod.strictObject({action: zod.literal('delete')}), zod.strictObject({action: zod.literal('ensure')}), zod.strictObject({action: zod.literal('empty')}), zod.strictObject({
  action: zod.literal('rename'),
  to: zod.string().describe('new name of the file or folder'),
}), zod.strictObject({
  action: zod.literal('move'),
  to: zod.string().describe('new path of the file or folder'),
}), zod.strictObject({
  action: zod.literal('overwrite'),
  content: zod.string(),
}), zod.strictObject({
  action: zod.literal('append'),
  content: zod.string(),
}), zod.strictObject({
  action: zod.literal('prepend'),
  content: zod.string(),
}), zod.strictObject({
  action: zod.literal('edit'),
  needle: needleSchema,
  replacement: zod.string(),
}), zod.strictObject({
  action: zod.literal('insert_before'),
  needle: needleSchema,
  content: zod.string(),
}), zod.strictObject({
  action: zod.literal('insert_after'),
  needle: needleSchema,
  content: zod.string(),
}), zod.strictObject({
  action: zod.literal('erase'),
  needle: needleSchema,
})])
const idSchema = zod.string().min(1).max(31).regex(/^[0-9a-z](?:[0-9a-z_]*[0-9a-z])?$/i)
const itemSchema = zod.strictObject({
  title: zod.string().min(8).max(127).regex(/^[^\t\n\r\u{2028}\u{2029}]*$/u),
  description: zod.string().optional(),
  priority: prioritySchema.default(3),
  category: arrayable(categorySchema),
  suggestedChanges: zod.array(zod.strictObject({
    file: zod.string().nonempty(),
    edit: arrayable(editSchema),
  })).optional(),
})
const schema = zod.strictObject({entries: zod.record(idSchema, itemSchema)})
export const jsonSchema = zod.toJSONSchema(schema, {
  io: 'input',
  reused: 'ref',
})
export default schema
export {categorySchema, editSchema, needleSchema, prioritySchema}
export type AubitInput = zod.input<typeof schema>
export type AubitData = zod.output<typeof schema>
export type AubitItem = AubitData['entries'][string]
export type CategoryId = zod.output<typeof categorySchema>
export type PriorityLevel = zod.output<typeof prioritySchema>
export type EditData = zod.output<typeof editSchema>
export type EditAction = EditData['action']
export type NeedleData = zod.output<typeof needleSchema>

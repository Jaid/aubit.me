import zod from 'zod'

export type Arrayable<Value> = NonEmptyArray<Value> | Value
type NonEmptyArray<Value> = [Value, ...Array<Value>]
const arrayable = <Schema extends zod.ZodType>(schema: Schema) => {
  return zod.union([schema, zod.array(schema).nonempty()])
}
const coerce = <Schema extends zod.ZodType>(schema: Schema) => {
  return arrayable(schema).transform(value => (Array.isArray(value) ? value : [value]))
}
export default Object.assign(arrayable, {coerce})

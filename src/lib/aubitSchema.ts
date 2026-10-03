import type schema from 'aubit-schema'

import {jsonSchema} from 'aubit-schema'

export type AubitData = ReturnType<typeof schema.parse>
export type AubitItem = AubitData['entries'][string]

export type CategoryId = ArrayableItem<AubitItem['category']>
export type PriorityLevel = AubitItem['priority']
export type EditData = ArrayableItem<SuggestedChangeData['edit']>
export type EditAction = EditData['action']
export type NeedleData = Extract<EditData, {needle: unknown}>['needle']
type ArrayableItem<Value> = Value extends ReadonlyArray<infer Item> ? Item : Value
type JsonSchemaNode = {
  $defs?: Record<string, JsonSchemaNode>
  $ref?: string
  additionalProperties?: JsonSchemaNode | boolean
  anyOf?: ReadonlyArray<JsonSchemaNode>
  const?: unknown
  description?: string
  properties?: Record<string, JsonSchemaNode>
}
type SuggestedChangeData = NonNullable<AubitItem['suggestedChanges']>[number]

const rootSchema = jsonSchema as JsonSchemaNode
const resolve = (node: JsonSchemaNode): JsonSchemaNode => {
  if (!node.$ref) {
    return node
  }
  const prefix = '#/$defs/'
  if (!node.$ref.startsWith(prefix)) {
    throw new Error(`Unsupported Aubit JSON Schema reference: ${node.$ref}`)
  }
  const resolved = rootSchema.$defs?.[node.$ref.slice(prefix.length)]
  if (!resolved) {
    throw new Error(`Unresolved Aubit JSON Schema reference: ${node.$ref}`)
  }
  return resolve(resolved)
}
const requireNode = (node: JsonSchemaNode | undefined, path: string) => {
  if (!node) {
    throw new Error(`Aubit JSON Schema is missing ${path}`)
  }
  return resolve(node)
}
const itemSchema = (() => {
  const entries = requireNode(rootSchema.properties?.entries, 'properties.entries')
  if (!entries.additionalProperties || typeof entries.additionalProperties === 'boolean') {
    throw new Error('Aubit JSON Schema entries must define an object value schema')
  }
  return requireNode(entries.additionalProperties, 'properties.entries.additionalProperties')
})()
const getConstOptions = (property: string) => {
  const propertySchema = requireNode(itemSchema.properties?.[property], `entries.*.${property}`)
  const candidates = [propertySchema, ...(propertySchema.anyOf ?? []).map(resolve)]
  const optionContainer = candidates.find(candidate => candidate.anyOf?.length && candidate.anyOf.every(option => resolve(option).const !== undefined))
  if (!optionContainer?.anyOf) {
    throw new Error(`Aubit JSON Schema property ${property} does not expose constant options`)
  }
  return optionContainer.anyOf.map(resolve)
}

export const categoryDefinitions = getConstOptions('category').map(option => {
  if (typeof option.const !== 'string') {
    throw new TypeError('Aubit category option must be a string')
  }
  return {
    id: option.const as CategoryId,
    description: option.description,
  }
})

export const priorityDefinitions = getConstOptions('priority').map(option => {
  if (typeof option.const !== 'number') {
    throw new TypeError('Aubit priority option must be a number')
  }
  return {
    level: option.const as PriorityLevel,
    description: option.description,
  }
})

export {jsonSchema, default as schema} from 'aubit-schema'

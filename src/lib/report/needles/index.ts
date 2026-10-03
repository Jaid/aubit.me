import type {NeedleData} from '#src/lib/schema/aubit.schema.ts'
import type {Needle} from './base/Needle.ts'

import {LineNeedle} from './LineNeedle.ts'
import {PatternNeedle} from './PatternNeedle.ts'
import {TextNeedle} from './TextNeedle.ts'

export const createNeedle = (data: NeedleData): Needle => {
  if (typeof data === 'string') {
    return new TextNeedle(data)
  }
  if ('line' in data) {
    return new LineNeedle(data.line)
  }
  return new PatternNeedle(data.regex, data.flags)
}
export type {Needle} from './base/Needle.ts'
export {LineNeedle} from './LineNeedle.ts'
export {PatternNeedle} from './PatternNeedle.ts'
export {TextNeedle} from './TextNeedle.ts'

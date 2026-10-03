import type {ComponentProps, ReactNode} from 'react'

import clsx from 'clsx'
import {useEffect, useRef, useState} from 'react'

import css from './style.module.sass'

type Props = Omit<ComponentProps<'button'>, 'onClick' | 'onError'> & {
  doneLabel?: ReactNode
  icon?: ReactNode
  onClick: () => unknown
  onError?: (message: string) => void
}

export default function ActionButton({onClick, onError, doneLabel, icon, children, className, disabled, type = 'button', ...props}: Props) {
  const [state, setState] = useState<'busy' | 'done' | 'failed' | 'idle'>('idle')
  const mounted = useRef(true)
  const busy = useRef(false)
  useEffect(() => {
    mounted.current = true; return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    if (state !== 'done' && state !== 'failed') {
      return
    }
    const timeout = setTimeout(() => setState('idle'), 1800)
    return () => clearTimeout(timeout)
  }, [state])
  const handleClick = async () => {
    if (busy.current) {
      return
    }
    busy.current = true
    setState('busy')
    try {
      await onClick(); if (mounted.current) {
        setState(doneLabel ? 'done' : 'idle')
      }
    } catch (error) {
      if (mounted.current) {
        setState('failed'); onError?.(Error.isError(error) ? error.message : 'This action could not be completed.')
      }
    } finally {
      busy.current = false
    }
  }
  return <button className={clsx(css.button, className)} data-state={state} disabled={disabled || state === 'busy'} type={type} onClick={() => { handleClick().catch(error => onError?.(error instanceof Error ? error.message : 'Action failed.')) }} {...props}>
    {icon && <span className={css.icon} aria-hidden>{state === 'done' ? '✓' : icon}</span>}
    <span className={css.label}>{state === 'done' ? doneLabel : state === 'failed' ? 'Unavailable' : children}</span>
  </button>
}

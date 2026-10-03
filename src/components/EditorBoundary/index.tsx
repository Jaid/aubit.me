import type {ReactNode} from 'react'

import {Component} from 'react'

type Props = {
  children: ReactNode
  fallback: ReactNode
}
/** An editor-loading failure must not take the user's document down with it. */
export default class EditorBoundary extends Component<Props, {failed: boolean}> {
  static getDerivedStateFromError() {
    return {failed: true}
  }
  state = {failed: false}
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

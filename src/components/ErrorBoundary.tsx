'use client'
import React from 'react'
import { reportError } from '../lib/errorReporting'

interface Props {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  isOffline: boolean
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, isOffline: false }
  }

  // eslint-disable-next-line @typescript/eslint/no-unused-vars
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, isOffline: false }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    reportError(error, { kind: 'render' })
  }

  componentDidMount() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline)
      window.addEventListener('offline', this.handleOffline)
    }
  }

  componentWillUnmount() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline)
      window.removeEventListener('offline', this.handleOffline)
    }
  }

  handleOnline = () => {
    this.setState({ isOffline: false })
    if (this.state.hasError) {
      this.reset()
    }
  }

  handleOffline = () => {
    this.setState({ isOffline: true })
  }

  reset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      // Always show a friendly message, ignore custom fallback to prevent leaking technical details.
      return <div>Something went wrong. Please try again.</div>
    }

    return (
      <>
        {this.state.isOffline && (
          <div
            style={{
              position: 'sticky',
              top: 0,
              width: '100%',
              padding: '0.5rem',
              textAlign: 'center',
              background: '#fff3cd',
              color: '#856404',
              fontSize: '0.9rem',
              zIndex: 1000,
              borderBottom: '1px solid #ffc107',
            }}
            role="banner"
          >
            Offline — Stellar cached data
          </div>
        )}
        {this.props.children}
      </>
    )
  }
}
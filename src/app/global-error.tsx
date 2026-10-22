'use client'

import { useEffect, useState } from 'react'
import { Helio } from '../brand/Helio'
import { INK, SOLAR } from '../brand/palette'
import { reportError } from '../lib/errorReporting'

const ERROR_MESSAGES = {
  en: {
    eyebrow: 'Something went wrong',
    title: 'Heliobond hit an unexpected error',
    body: 'The app failed before it could finish loading. Try again, or reload the page to start fresh.',
    errorRef: 'Error ref: {digest}',
    tryAgain: 'Try again',
    reload: 'Reload page',
  },
  fr: {
    eyebrow: 'Une erreur est survenue',
    title: 'Heliobond a rencontré une erreur inattendue',
    body: "L'application a échoué avant la fin du chargement. Réessayez ou rechargez la page pour repartir de zéro.",
    errorRef: 'Référence de l’erreur : {digest}',
    tryAgain: 'Réessayer',
    reload: 'Recharger la page',
  },
  es: {
    eyebrow: 'Algo salió mal',
    title: 'Heliobond encontró un error inesperado',
    body: 'La aplicación falló antes de terminar de cargarse. Inténtalo de nuevo o recarga la página para empezar de nuevo.',
    errorRef: 'Referencia del error: {digest}',
    tryAgain: 'Intentar de nuevo',
    reload: 'Recargar página',
  },
  ar: {
    eyebrow: 'حدث خطأ ما',
    title: 'واجه Heliobond خطأً غير متوقع',
    body: 'تعطّل التطبيق قبل اكتمال التحميل. حاول مرة أخرى أو أعد تحميل الصفحة للبدء من جديد.',
    errorRef: 'مرجع الخطأ: {digest}',
    tryAgain: 'حاول مرة أخرى',
    reload: 'إعادة تحميل الصفحة',
  },
  pt: {
    eyebrow: 'Ocorreu um erro',
    title: 'O Heliobond encontrou um erro inesperado',
    body: 'O aplicativo falhou antes de terminar de carregar. Tente novamente ou recarregue a página para começar de novo.',
    errorRef: 'Referência do erro: {digest}',
    tryAgain: 'Tentar novamente',
    reload: 'Recarregar página',
  },
} as const

type ErrorLocale = keyof typeof ERROR_MESSAGES

function getCookieLocale(): ErrorLocale {
  const match = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=([^;]*)/)
  const locale = match?.[1]
  return locale && Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, locale)
    ? (locale as ErrorLocale)
    : 'en'
}

/**
 * Root error boundary (#710). Next.js swaps this in for the whole root layout
 * when an error escapes the layout shell itself — `LocaleProvider`, `Providers`,
 * `TopBar` or `Footer` — where `error.tsx` cannot reach. It renders its own
 * `<html>`/`<body>` because the root layout is gone.
 *
 * Deliberately provider-free: it must not depend on anything that might be the
 * crashing thing. Styles are literal (no CSS custom properties), since the
 * layout that loads the global stylesheet has been replaced.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [locale, setLocale] = useState<ErrorLocale>('en')

  useEffect(() => {
    setLocale(getCookieLocale())
    console.error('[Heliobond] root error:', error)
    reportError(error, {
      kind: 'root',
      context: error.digest ? { digest: error.digest } : undefined,
    })
  }, [error])

  const messages = ERROR_MESSAGES[locale]

  return (
    <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <body
        style={{
          margin: 0,
          background: '#F3F5F1',
          color: INK,
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        <main
          id="main-content"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100dvh',
            padding: '64px 32px',
            textAlign: 'center',
          }}
        >
          <div aria-hidden="true" style={{ marginBottom: 32, opacity: 0.75 }}>
            <Helio size={64} motes={12} breathe={false} />
          </div>

          <p
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 13,
              letterSpacing: '0.1em',
              color: SOLAR,
              margin: '0 0 12px',
              textTransform: 'uppercase',
            }}
          >
            {messages.eyebrow}
          </p>

          <h1
            style={{
              fontWeight: 800,
              fontSize: 'clamp(2rem, 4vw, 3rem)',
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
              color: INK,
              margin: '0 0 14px',
            }}
          >
            {messages.title}
          </h1>

          <p
            style={{
              fontSize: 16,
              lineHeight: 1.6,
              color: 'rgba(11, 43, 35, 0.6)',
              maxWidth: 440,
              margin: '0 0 8px',
            }}
          >
            {messages.body}
          </p>

          {error.digest && (
            <p
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 12,
                color: 'rgba(11, 43, 35, 0.4)',
                margin: '0 0 32px',
              }}
            >
              {messages.errorRef.replace('{digest}', error.digest)}
            </p>
          )}
          {!error.digest && <div style={{ marginBottom: 32 }} />}

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={reset}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: 44,
                padding: '0 20px',
                fontWeight: 600,
                fontSize: 15,
                lineHeight: 1,
                borderRadius: 999,
                background: SOLAR,
                color: INK,
                border: '1px solid transparent',
                cursor: 'pointer',
              }}
            >
              {messages.tryAgain}
            </button>

            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: 44,
                padding: '0 20px',
                fontWeight: 600,
                fontSize: 15,
                lineHeight: 1,
                borderRadius: 999,
                background: 'transparent',
                color: INK,
                border: `1px solid ${INK}`,
                cursor: 'pointer',
              }}
            >
              {messages.reload}
            </button>
          </div>
        </main>
      </body>
    </html>
  )
}

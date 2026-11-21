import React from 'react'
import type { Payload } from 'payload'
import { ssoEnabled } from '../../auth/supabase/core'

const errors: Record<string, string> = {
  configuration: 'Die gemeinsame Anmeldung ist noch nicht vollständig eingerichtet.',
  state: 'Die Anmeldung ist abgelaufen oder ungültig. Bitte starte sie erneut.',
  denied: 'Die Anmeldung wurde abgebrochen.',
  forbidden: 'Deinem Konto fehlt die Backend-Berechtigung. Bitte wende dich an die Verwaltung.',
  identity: 'Für den CMS-Zugang benötigst du ein Konto mit bestätigter E-Mail-Adresse.',
  account_conflict:
    'Für diese E-Mail-Adresse existiert bereits ein CMS-Konto. Die Verwaltung muss es zuerst mit deinem Supabase-Konto verknüpfen.',
  provider: 'Die Anmeldung konnte nicht abgeschlossen werden. Bitte versuche es erneut.',
}

const BeforeLogin = ({
  payload,
  searchParams,
}: {
  payload: Payload
  searchParams?: Record<string, string | string[] | undefined>
}) => {
  if (ssoEnabled()) {
    const error = searchParams?.sso_error
    return (
      <div>
        <h1>Mit deinem Konglomerat-Konto anmelden</h1>
        <p>Verwende dein bestehendes Website-Konto mit Backend-Berechtigung.</p>
        {typeof error === 'string' && errors[error] ? <p role="alert">{errors[error]}</p> : null}
        <a
          className="btn btn--style-primary btn--size-medium"
          href={`${payload.config.routes.api}/sso/login`}
        >
          Mit Supabase anmelden
        </a>
      </div>
    )
  }
  return (
    <div>
      <p>
        <b>Konglomerat CMS</b>
        {' Melde dich an, um Seiten, Medien und die Navigation von Konglo Digital zu bearbeiten.'}
      </p>
    </div>
  )
}

export default BeforeLogin

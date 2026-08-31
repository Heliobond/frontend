// src/lib/webauthn.ts
// WebAuthn / biometric authentication helpers.

function base64urlToArrayBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const binaryString = atob(base64 + padding)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer
}

function arrayBufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+\$/, '')
}

interface PublicKeyCredentialJSON {
  id: string
  rawId: string
  type: string
  response: Record<string, unknown>
}

async function postJSON(url: string, body: unknown): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}
export async function registerBiometric(username: string): Promise<any> {
  const options = await postJSON('/webauthn/register/begin', { username })

  // Convert base64url fields to ArrayBuffer for WebAuthn API
  options.challenge = base64urlToArrayBuffer(options.challenge)
  options.user.id = base64urlToArrayBuffer(options.user.id)
  if (options.excludeCredentials) {
    options.excludeCredentials = options.excludeCredentials.map((cred: any) => ({
      ...cred,
      id: base64urlToArrayBuffer(cred.id),
    }))
  }

  const credential = (await navigator.credentials.create({
    publicKey: options,
  })) as PublicKeyCredential & { response: AuthenticatorAttestationResponse }

  if (!credential) throw new Error('Registration canceled')

  const credentialJSON: PublicKeyCredentialJSON = {
    id: credential.id,
    rawId: arrayBufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      attestationObject: arrayBufferToBase64url(credential.response.attestationObject),
      clientDataJSON: arrayBufferToBase64url(credential.response.clientDataJSON),
    },
  }

  return postJSON('/webauthn/register/complete', { username, credential: credentialJSON })
}

export async function loginBiometric(username: string): Promise<any> {
  const options = await postJSON('/webauthn/login/begin', { username })

  options.challenge = base64urlToArrayBuffer(options.challenge)
  if (options.allowCredentials) {
    options.allowCredentials = options.allowCredentials.map((cred: any) => ({
      ...cred,
      id: base64urlToArrayBuffer(cred.id),
    }))
  }

  const assertion = (await navigator.credentials.get({
    publicKey: options,
  })) as PublicKeyCredential & { response: AuthenticatorAssertionResponse }

  if (!assertion) throw new Error('Authentication canceled')

  const credentialJSON: PublicKeyCredentialJSON = {
    id: assertion.id,
    rawId: arrayBufferToBase64url(assertion.rawId),
    type: assertion.type,
    response: {
      authenticatorData: arrayBufferToBase64url(assertion.response.authenticatorData),
      clientDataJSON: arrayBufferToBase64url(assertion.response.clientDataJSON),
      signature: arrayBufferToBase64url(assertion.response.signature),
      userHandle: assertion.response.userHandle
        ? arrayBufferToBase64url(assertion.response.userHandle)
        : null,
    },
  }

  return postJSON('/webauthn/login/complete', { username, credential: credentialJSON })
}

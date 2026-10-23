import { AppError } from './appError'
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
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

interface PublicKeyCredentialJSON {
  id: string
  rawId: string
  type: string
  response: Record<string, unknown>
}

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    cache: 'no-store',
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new AppError(typeof err.error === 'string' && err.error ? err.error : 'serverError')
  }
  return res.json()
}

export interface VerificationResult {
  verified: true
}
type DescriptorJSON = Omit<PublicKeyCredentialDescriptor, 'id'> & { id: string }
type RegistrationOptionsJSON = Omit<
  PublicKeyCredentialCreationOptions,
  'challenge' | 'user' | 'excludeCredentials'
> & {
  challenge: string
  user: Omit<PublicKeyCredentialUserEntity, 'id'> & { id: string }
  excludeCredentials?: DescriptorJSON[]
}
type LoginOptionsJSON = Omit<
  PublicKeyCredentialRequestOptions,
  'challenge' | 'allowCredentials'
> & {
  challenge: string
  allowCredentials?: DescriptorJSON[]
}
function requireSupport(username: string) {
  if (!username.trim()) throw new AppError('usernameRequired')
  if (typeof window === 'undefined' || !window.PublicKeyCredential || !navigator.credentials) {
    throw new AppError('webauthnUnsupported')
  }
}
async function complete(
  url: string,
  username: string,
  credential: PublicKeyCredentialJSON,
): Promise<VerificationResult> {
  const result = await postJSON<unknown>(url, { username, credential })
  if (
    !result ||
    typeof result !== 'object' ||
    !('verified' in result) ||
    result.verified !== true
  ) {
    throw new AppError('credentialNotVerified')
  }
  return { verified: true }
}

export async function registerBiometric(username: string): Promise<VerificationResult> {
  requireSupport(username)
  const json = await postJSON<RegistrationOptionsJSON>('/webauthn/register/begin', { username })

  const options: PublicKeyCredentialCreationOptions = {
    ...json,
    challenge: base64urlToArrayBuffer(json.challenge),
    user: { ...json.user, id: base64urlToArrayBuffer(json.user.id) },
    excludeCredentials: json.excludeCredentials?.map((cred) => ({
      ...cred,
      id: base64urlToArrayBuffer(cred.id),
    })),
  }

  const credential = (await navigator.credentials.create({
    publicKey: options,
  })) as PublicKeyCredential & { response: AuthenticatorAttestationResponse }

  if (!credential) throw new AppError('registrationCanceled')

  const credentialJSON: PublicKeyCredentialJSON = {
    id: credential.id,
    rawId: arrayBufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      attestationObject: arrayBufferToBase64url(credential.response.attestationObject),
      clientDataJSON: arrayBufferToBase64url(credential.response.clientDataJSON),
    },
  }

  return complete('/webauthn/register/complete', username, credentialJSON)
}

export async function loginBiometric(username: string): Promise<VerificationResult> {
  requireSupport(username)
  const json = await postJSON<LoginOptionsJSON>('/webauthn/login/begin', { username })

  const options: PublicKeyCredentialRequestOptions = {
    ...json,
    challenge: base64urlToArrayBuffer(json.challenge),
    allowCredentials: json.allowCredentials?.map((cred) => ({
      ...cred,
      id: base64urlToArrayBuffer(cred.id),
    })),
  }

  const assertion = (await navigator.credentials.get({
    publicKey: options,
  })) as PublicKeyCredential & { response: AuthenticatorAssertionResponse }

  if (!assertion) throw new AppError('authenticationCanceled')

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

  return complete('/webauthn/login/complete', username, credentialJSON)
}

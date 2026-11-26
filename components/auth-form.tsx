'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, LockKeyhole, ShieldCheck } from 'lucide-react'
import { authClient } from '@/lib/auth-client'

export function AuthForm() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function signInWithGoogle() {
    setBusy(true)
    setMessage('')
    try {
      const result = await authClient.signIn.social({
        provider: 'google',
        callbackURL: '/dashboard',
      })
      if (!result.error) return
    } catch {
      setMessage('No se pudo completar el acceso con Google. IntÃ©ntalo de nuevo.')
      setBusy(false)
      return
    }
    setMessage('No se pudo completar el acceso con Google. IntÃ©ntalo de nuevo.')
    setBusy(false)
  }

  return (
    <main className="auth-shell">
      <section className="auth-story">
        <Link href="/" className="brand brand-on-dark"><span className="brand-mark">A</span><span>Administra<span className="brand-dot">.</span></span></Link>
        <div className="story-copy">
          <span className="eyebrow eyebrow-light">TU TRANQUILIDAD, EN ORDEN</span>
          <h1>El hogar tambiÃ©n<br />se lleva en <em>cuentas.</em></h1>
          <p>Una mirada clara a tus alquileres, gastos y todo lo que hace que cada mes encaje.</p>
          <div className="story-note"><span className="story-note-icon"><ShieldCheck size={18} /></span><span>Privado por diseÃ±o. Tus registros se guardan en tu base de datos privada.</span></div>
        </div>
        <div className="story-footer"><span>ADMINISTRA Â· CONTROL DE ALQUILERES</span><span>01 â€” 03</span></div>
      </section>
      <section className="auth-panel">
        <div className="auth-topline">CONTROL DE ALQUILERES <span>â€¢</span> ACCESO SEGURO</div>
        <div className="auth-card">
          <div className="auth-icon"><LockKeyhole size={20} /></div>
          <div className="eyebrow">BIENVENIDO A ADMINISTRA</div>
          <h2>QuÃ© gusto verte</h2>
          <p className="auth-subtitle">Accede a tu panel de alquileres y gastos con tu cuenta de Google.</p>
          <button type="button" className="button-primary google-auth-button" onClick={signInWithGoogle} disabled={busy}>
            {busy ? 'Conectando con Googleâ€¦' : 'Continuar con Google'}<ArrowRight size={17} />
          </button>
          {message && <p className="form-error" role="alert">{message}</p>}
          <div className="secure-caption"><ShieldCheck size={15} /> SesiÃ³n protegida y datos cifrados</div>
        </div>
        <div className="auth-bottom">HECHO PARA VIVIR MÃS TRANQUILO <span>Â© 2026 ADMINISTRA</span></div>
      </section>
    </main>
  )
}


'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { authClient } from '@/lib/auth-client'

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const isSignUp = mode === 'sign-up'

  async function signInWithGoogle() {
    setBusy(true)
    setMessage('')
    const result = await authClient.signIn.social({
      provider: 'google',
      callbackURL: '/dashboard',
    })
    if (result.error) {
      setBusy(false)
      setMessage('No se pudo completar el acceso con Google. Inténtalo de nuevo.')
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    const result = isSignUp
      ? await authClient.signUp.email({ email, password, name })
      : await authClient.signIn.email({ email, password })
    setBusy(false)
    if (result.error) {
      setMessage('No se pudo completar el acceso. Comprueba los datos e inténtalo de nuevo.')
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <main className="auth-shell">
      <section className="auth-story">
        <Link href="/" className="brand brand-on-dark"><span className="brand-mark">A</span><span>Administra<span className="brand-dot">.</span></span></Link>
        <div className="story-copy">
          <span className="eyebrow eyebrow-light">TU TRANQUILIDAD, EN ORDEN</span>
          <h1>El hogar también<br />se lleva en <em>cuentas.</em></h1>
          <p>Una mirada clara a tus alquileres, gastos y todo lo que hace que cada mes encaje.</p>
          <div className="story-note"><span className="story-note-icon"><ShieldCheck size={18} /></span><span>Privado por diseño. Tus datos se quedan en tu cuenta de Google.</span></div>
        </div>
        <div className="story-footer"><span>ADMINISTRA · CONTROL DE ALQUILERES</span><span>01 — 03</span></div>
      </section>
      <section className="auth-panel">
        <div className="auth-topline">CONTROL DE ALQUILERES <span>•</span> ACCESO SEGURO</div>
        <div className="auth-card">
          <div className="auth-icon"><LockKeyhole size={20} /></div>
          <div className="eyebrow">BIENVENIDO A ADMINISTRA</div>
          <h2>{isSignUp ? 'Crea tu espacio' : 'Qué gusto verte'}</h2>
          <p className="auth-subtitle">{isSignUp ? 'Empieza a organizar tus alquileres con calma.' : 'Accede a tu panel de alquileres y gastos.'}</p>
          <button type="button" className="button-primary google-auth-button" onClick={signInWithGoogle} disabled={busy}>
            Continuar con Google
          </button>
          <div className="auth-divider"><span>o con tu correo</span></div>
          <form onSubmit={submit} className="auth-form">
            {isSignUp && <label className="field-label">Nombre<input autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} placeholder="Tu nombre" /></label>}
            <label className="field-label">Correo electrónico<span className="input-wrap"><Mail size={17} /><input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nombre@correo.com" /></span></label>
            <label className="field-label">Contraseña<span className="input-wrap"><LockKeyhole size={17} /><input type={showPassword ? 'text' : 'password'} autoComplete={isSignUp ? 'new-password' : 'current-password'} required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo 8 caracteres" /><button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
            {message && <p className="form-error" role="alert">{message}</p>}
            <button className="button-primary auth-submit" disabled={busy}>{busy ? 'Un momento…' : isSignUp ? 'Crear cuenta' : 'Entrar'}<ArrowRight size={17} /></button>
          </form>
          <p className="auth-switch">{isSignUp ? '¿Ya tienes una cuenta?' : '¿Primera vez por aquí?'} <Link href={isSignUp ? '/sign-in' : '/sign-up'}>{isSignUp ? 'Inicia sesión' : 'Crea tu cuenta'}</Link></p>
          <div className="secure-caption"><ShieldCheck size={15} /> Sesión protegida y datos cifrados</div>
        </div>
        <div className="auth-bottom">HECHO PARA VIVIR MÁS TRANQUILO <span>© 2026 ADMINISTRA</span></div>
      </section>
    </main>
  )
}

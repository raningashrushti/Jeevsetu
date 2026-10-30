
import React, { useState } from 'react';
import { supabase } from './supabase.js';
import {
  Heart, ShieldCheck, Eye, EyeOff, ArrowLeft, PawPrint
} from 'lucide-react';

export default function VolunteerLogin({ onLogin, onBack }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(event) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;
      onLogin(data.user);
    } catch (err) {
      setError(err.message || 'Unable to sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <section className="login-visual">
        <button className="login-back" onClick={onBack} type="button">
          <ArrowLeft size={17} /> Back to Home
        </button>

        <div className="login-brand">
          <div className="login-brand-icon"><Heart size={24} /></div>
          <span>JeevSetu</span>
        </div>

        <div className="login-message">
          <span className="login-eyebrow">
            <PawPrint size={15} /> EVERY LIFE MATTERS
          </span>
          <h1>Small acts of care.<br />A world of difference.</h1>
          <p>
            Every rescue begins with someone who cares.
            Thank you for being part of the change.
          </p>
        </div>

        <div className="login-quote">
          <Heart size={18} />
          <span>Be the reason a life gets a second chance.</span>
        </div>
      </section>

      <section className="login-form-panel">
        <div className="login-form-wrap">
          <div className="login-mobile-brand">
            <Heart size={21} /> JeevSetu
          </div>

          <div className="login-heading-icon">
            <ShieldCheck size={27} />
          </div>

          <p className="login-kicker">VOLUNTEER PORTAL</p>
          <h2>Welcome back</h2>
          <p className="login-description">
            Sign in to review reports and coordinate rescue efforts.
          </p>

          <form onSubmit={handleLogin} className="login-form">
            <label htmlFor="volunteer-email">Email address</label>
            <input
              id="volunteer-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
            />

            <div className="login-password-heading">
              <label htmlFor="volunteer-password">Password</label>
            </div>

            <div className="login-password-field">
              <input
                id="volunteer-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {error && <p role="alert" className="login-error">{error}</p>}

            <button
              type="submit"
              className="login-submit"
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign in to your account'}
              {!loading && <ArrowLeft className="login-submit-arrow" size={18} />}
            </button>
          </form>

          <div className="login-security">
            <ShieldCheck size={17} />
            <span>Your volunteer access is protected.</span>
          </div>

          <p className="login-admin-note">
            Need an account? Contact the JeevSetu administrator.
          </p>
        </div>
      </section>
    </div>
  );
}

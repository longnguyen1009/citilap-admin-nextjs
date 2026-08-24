"use client";
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { Lock, User, LogIn, AlertCircle } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showMockLogin, setShowMockLogin] = useState(false);
  const { login, mockLogin, isSupabaseConnected, user } = useAuth();
  const router = useRouter();

  // Tự động chuyển hướng khi user đã có (tránh race condition với AuthContext)
  React.useEffect(() => {
    if (user) {
      router.push('/');
    }
  }, [user, router]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Vui lòng nhập email và mật khẩu');
      return;
    }
    setError('');
    setIsSubmitting(true);

    const result = await login(email, password);
    if (!result.ok) {
      setError(result.message || 'Sai email hoặc mật khẩu');
      setIsSubmitting(false);
    } else {
      window.location.href = '/';
    }
  };

  // Mock login fallback (khi chưa cấu hình Supabase)
  const handleMockLogin = (role) => {
    mockLogin(role);
    router.push('/');
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Inter, sans-serif',
    }}>
      <div style={{
        background: 'rgba(255,255,255,0.05)',
        backdropFilter: 'blur(20px)',
        borderRadius: '16px',
        border: '1px solid rgba(255,255,255,0.1)',
        padding: '40px',
        width: '100%',
        maxWidth: '420px',
        boxShadow: '0 25px 50px rgba(0,0,0,0.3)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ color: '#fff', fontSize: '1.8rem', fontWeight: 800, margin: 0 }}>
            🖥️ CitiLap
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', marginTop: '6px' }}>
            Warehouse Management System
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', display: 'block', marginBottom: '6px' }}>
              Email
            </label>
            <div style={{ position: 'relative' }}>
              <User size={16} style={{
                position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                color: 'rgba(255,255,255,0.4)',
              }} />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@citilap.com"
                style={{
                  width: '100%', padding: '10px 12px 10px 38px',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '8px', color: '#fff', fontSize: '0.9rem',
                  outline: 'none', boxSizing: 'border-box',
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(99,102,241,0.6)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.15)'}
              />
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', display: 'block', marginBottom: '6px' }}>
              Mật khẩu
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{
                position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                color: 'rgba(255,255,255,0.4)',
              }} />
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: '100%', padding: '10px 12px 10px 38px',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '8px', color: '#fff', fontSize: '0.9rem',
                  outline: 'none', boxSizing: 'border-box',
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(99,102,241,0.6)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.15)'}
              />
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '10px 12px', marginBottom: '16px',
              background: 'rgba(239,68,68,0.15)', borderRadius: '8px',
              border: '1px solid rgba(239,68,68,0.3)',
            }}>
              <AlertCircle size={14} color="#ef4444" />
              <span style={{ color: '#fca5a5', fontSize: '0.82rem' }}>{error}</span>
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              width: '100%', padding: '11px',
              background: isSubmitting ? 'rgba(99,102,241,0.5)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff', border: 'none', borderRadius: '8px',
              fontSize: '0.9rem', fontWeight: 600, cursor: isSubmitting ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              transition: 'all 0.2s',
            }}
          >
            <LogIn size={16} />
            {isSubmitting ? 'Đang đăng nhập...' : 'Đăng Nhập'}
          </button>
        </form>

        {/* Mock login toggle */}
        {!isSupabaseConnected && (
          <div style={{ marginTop: '20px', textAlign: 'center' }}>
            <button
              onClick={() => setShowMockLogin(!showMockLogin)}
              style={{
                background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
                fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline',
              }}
            >
              Demo không cần Supabase
            </button>
            {showMockLogin && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                {['ADMIN', 'SALES', 'TECH'].map(role => (
                  <button
                    key={role}
                    onClick={() => handleMockLogin(role)}
                    style={{
                      flex: 1, padding: '8px', borderRadius: '6px',
                      border: '1px solid rgba(255,255,255,0.2)',
                      background: 'rgba(255,255,255,0.05)',
                      color: '#fff', fontSize: '0.75rem', cursor: 'pointer',
                    }}
                  >
                    {role}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <p style={{
          textAlign: 'center', color: 'rgba(255,255,255,0.3)',
          fontSize: '0.7rem', marginTop: '24px',
        }}>
          CitiLap Warehouse Management © 2026
        </p>
      </div>
    </div>
  );
}

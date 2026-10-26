
import { useState } from 'react';
import { supabase } from './supabase';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data, error: loginError } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      if (loginError) throw loginError;

      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('user_id, role, active')
        .eq('user_id', data.user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profile?.active || !['gestao', 'vendedor'].includes(profile.role)) {
        await supabase.auth.signOut();
        throw new Error('Usuário sem perfil ativo para acessar o sistema.');
      }

      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <img
          className="login-logo"
          src="https://lhinolmdpaonyuxbgzbw.supabase.co/storage/v1/object/public/puppy-photos/site/2.svg"
          alt="Valle Tanti Auguri"
        />

        <h2>Acesso ao Sistema</h2>
        <p>Entre com suas credenciais de acesso.</p>

        <label>
          E-mail
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label>
          Senha
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && <div className="alert error">{error}</div>}

        <button className="primary-button" type="submit" disabled={loading}>
          {loading ? 'Entrando...' : 'Entrar no Sistema'}
        </button>
      </form>
    </main>
  );
}

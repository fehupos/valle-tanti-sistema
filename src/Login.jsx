
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

      const { data: admin, error: adminError } = await supabase
        .from('admin_users')
        .select('user_id')
        .eq('user_id', data.user.id)
        .maybeSingle();

      if (adminError) throw adminError;

      if (!admin) {
        await supabase.auth.signOut();
        throw new Error('Usuário sem permissão administrativa.');
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

        <h2>Acesso Administrativo</h2>
        <p>Entre com as mesmas credenciais do site principal.</p>

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

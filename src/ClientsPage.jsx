import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import './ClientsPage.css';
import ClientHistory from './ClientHistory';

const PAGE_SIZE = 15;
const blank = {
  full_name: '', phone: '', email: '', cpf: '', rg: '', birth_date: '',
  postal_code: '', address: '', address_number: '', address_complement: '', neighborhood: '',
  city: '', state: '', nationality: '', marital_status: '', profession: '', instagram: '',
  marketing_consent: false, notes: '',
};
const onlyDigits = (v) => String(v ?? '').replace(/\D/g, '');
const showDate = (v) => v ? new Date(`${v}T12:00:00`).toLocaleDateString('pt-BR') : '—';
const showPhone = (v) => v || '—';
const initials = (s) => (s || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase()).join('');
const safeSearch = (v) => v.trim().replace(/[%_,().\\]/g, '').slice(0, 80);

export default function ClientsPage({ userProfile }) {
  const management = userProfile?.role === 'gestao';
  const [clients, setClients] = useState([]);
  const [summaries, setSummaries] = useState({});
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [refresh, setRefresh] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let query = supabase.from('clients')
        .select('id, full_name, phone, email, cpf, rg, birth_date, postal_code, address, address_number, address_complement, neighborhood, city, state, nationality, marital_status, profession, instagram, marketing_consent, notes, created_at', { count: 'exact' })
        .order('full_name', { ascending: true })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
      const q = safeSearch(search);
      if (q) query = query.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%,city.ilike.%${q}%,cpf.ilike.%${q}%`);
      const { data, count, error: queryError } = await query;
      if (queryError) throw queryError;
      setClients(data || []);
      setTotal(count ?? 0);
      const ids = (data || []).map(c => c.id);
      if (!ids.length) { setSummaries({}); return; }
      const { data: agg, error: aggError } = await supabase.rpc('client_purchase_summary_v1', { p_client_ids: ids });
      if (aggError) throw aggError;
      setSummaries(Object.fromEntries((agg || []).map(item => [item.client_id, item])));
    } catch (e) {
      setError(e?.message || 'Não foi possível consultar os clientes.');
    } finally { setLoading(false); }
  }, [search, page, refresh]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search]);

  function openForm(client = null) {
    setNotice(''); setError('');
    setEditing(client?.id || 'new');
    setForm(client ? Object.fromEntries(Object.keys(blank).map(k => [k, client[k] ?? blank[k]])) : { ...blank });
  }

  async function saveClient(e) {
    e.preventDefault();
    if (saving) return;
    const payload = {
      ...form,
      full_name: form.full_name.trim(),
      cpf: onlyDigits(form.cpf) || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      birth_date: form.birth_date || null,
      state: form.state.trim().toUpperCase() || null,
    };
    if (!payload.full_name) { setError('Informe o nome completo.'); return; }
    if (payload.cpf && payload.cpf.length !== 11) { setError('O CPF precisa ter 11 dígitos.'); return; }
    setSaving(true); setError('');
    try {
      const operation = editing === 'new'
        ? supabase.from('clients').insert(payload)
        : supabase.from('clients').update(payload).eq('id', editing);
      const { error: saveError } = await operation;
      if (saveError) throw saveError;
      setEditing(null);
      setSelected(null);
      setNotice(editing === 'new' ? 'Cliente cadastrado com sucesso.' : 'Cliente atualizado com sucesso.');
      setRefresh(n => n + 1);
    } catch (e) { setError(e.message || 'Erro ao salvar cliente.'); }
    finally { setSaving(false); }
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const purchases = (id) => summaries[id]?.purchase_count ?? 0;
  const lastPurchase = (id) => summaries[id]?.last_purchase ?? null;

  return <main className="content valle-clients-page">
    <header className="page-header">
      <div><h1>Clientes</h1><p>Cadastros, contatos e histórico de compras do canil.</p></div>
      <button type="button" className="primary-button" onClick={() => openForm()}>+ Novo cliente</button>
    </header>
    {error && <div className="alert error" role="alert">{error}</div>}
    {notice && <div className="alert success" role="status">{notice}</div>}
    <div className="stats"><div className="stat-card"><span>Clientes encontrados</span><strong>{total}</strong></div><div className="stat-card"><span>Compras dos clientes nesta página</span><strong>{clients.reduce((n,c)=>n + purchases(c.id),0)}</strong></div></div>
    <section className="panel valle-clients-panel">
      <div className="valle-client-toolbar">
        <input className="search-input" aria-label="Buscar clientes" placeholder="Buscar nome, telefone, cidade ou CPF..." value={search} onChange={e => setSearch(e.target.value)} />
        <button type="button" className="valle-btn valle-btn-ghost" onClick={() => setRefresh(n => n + 1)}>Atualizar</button>
      </div>
      <p className="valle-clients-hint">Gestão e vendedores podem visualizar toda a base de clientes. Clique em uma linha para ver os detalhes.</p>
      <div className="valle-clients-table-wrap">
        <table className="valle-clients-table">
          <thead><tr><th>Nome</th><th>Telefone</th><th>Cidade</th><th>UF</th><th>Última Compra</th><th>Compras</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="6">Carregando clientes...</td></tr> : clients.length === 0 ? <tr><td colSpan="6">Nenhum cliente encontrado.</td></tr> : clients.map(client => <tr key={client.id} tabIndex={0} role="button" onClick={() => setSelected(client)} onKeyDown={e => { if (e.key === 'Enter') setSelected(client); }}>
              <td><strong>{client.full_name || 'Sem nome'}</strong></td>
              <td>{showPhone(client.phone)}</td><td>{client.city || '—'}</td><td>{client.state || '—'}</td>
              <td>{showDate(lastPurchase(client.id))}</td><td>{purchases(client.id)}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <div className="valle-clients-pager"><span>Página {page} de {pages} · {total} cliente(s)</span><div><button type="button" className="valle-btn valle-btn-ghost" disabled={page === 1 || loading} onClick={()=>setPage(n => n - 1)}>Anterior</button><button type="button" className="valle-btn valle-btn-ghost" disabled={page >= pages || loading} onClick={()=>setPage(n => n + 1)}>Próxima</button></div></div>
    </section>

    {selected && !editing && <div className="valle-detail-overlay" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setSelected(null); }}>
      <section className="valle-detail-modal" role="dialog" aria-modal="true" aria-label="Detalhes do cliente">
        <div className="valle-detail-header"><div><span className="valle-detail-kicker">CADASTRO DE CLIENTE</span><h2>{selected.full_name}</h2></div><button type="button" className="valle-detail-close" onClick={()=>setSelected(null)} aria-label="Fechar">×</button></div>
        <div className="valle-detail-content">
          <div className="valle-client-profile"><div className="valle-client-avatar">{initials(selected.full_name)}</div><div><strong>{selected.city || 'Cidade não informada'}{selected.state ? ` / ${selected.state}` : ''}</strong><p>{selected.phone || 'Telefone não informado'}</p></div></div>
          <div className="valle-client-kpis"><div><small>Compras concluídas</small><strong>{purchases(selected.id)}</strong></div><div><small>Última compra</small><strong>{showDate(lastPurchase(selected.id))}</strong></div></div>
          <dl className="valle-detail-grid">
            <div><dt>CPF</dt><dd>{selected.cpf || '—'}</dd></div><div><dt>E-mail</dt><dd>{selected.email || '—'}</dd></div>
            <div><dt>Data de nascimento</dt><dd>{showDate(selected.birth_date)}</dd></div><div><dt>Contato para campanhas</dt><dd>{selected.marketing_consent ? 'Autorizado' : 'Não autorizado'}</dd></div>
            <div><dt>Endereço</dt><dd>{[selected.address,selected.address_number,selected.neighborhood].filter(Boolean).join(', ') || '—'}</dd></div><div><dt>CEP</dt><dd>{selected.postal_code || '—'}</dd></div>
            <div><dt>Instagram</dt><dd>{selected.instagram || '—'}</dd></div><div><dt>Observações</dt><dd>{selected.notes || '—'}</dd></div>
          </dl>
          <ClientHistory client={selected} userProfile={userProfile} />
        </div>
        <div className="valle-detail-footer valle-detail-actions"><button type="button" className="valle-btn valle-btn-ghost" onClick={()=>setSelected(null)}>Fechar</button>{management && <button type="button" className="valle-btn valle-btn-confirm" onClick={()=>openForm(selected)}>Editar cliente</button>}</div>
      </section>
    </div>}

    {editing && <div className="valle-detail-overlay" role="presentation"><section className="valle-detail-modal valle-client-form-modal" role="dialog" aria-modal="true" aria-label="Cadastro de cliente">
      <div className="valle-detail-header"><div><span className="valle-detail-kicker">GESTÃO DE CLIENTES</span><h2>{editing === 'new' ? 'Novo cliente' : 'Editar cliente'}</h2></div><button type="button" className="valle-detail-close" onClick={()=>{setEditing(null);setError('');}} aria-label="Fechar">×</button></div>
      <form onSubmit={saveClient}>
        <div className="valle-detail-content valle-client-form-grid">
          <label className="valle-client-wide">Nome completo *<input required value={form.full_name} onChange={e=>setForm(f=>({...f,full_name:e.target.value}))}/></label>
          <label>Telefone / WhatsApp<input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/></label>
          <label>CPF<input inputMode="numeric" value={form.cpf} onChange={e=>setForm(f=>({...f,cpf:e.target.value}))}/></label>
          <label>E-mail<input type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></label>
          <label>Data de nascimento<input type="date" value={form.birth_date} onChange={e=>setForm(f=>({...f,birth_date:e.target.value}))}/></label>
          <label>Cidade<input value={form.city} onChange={e=>setForm(f=>({...f,city:e.target.value}))}/></label>
          <label>UF<input maxLength={2} value={form.state} onChange={e=>setForm(f=>({...f,state:e.target.value}))}/></label>
          <label>CEP<input value={form.postal_code} onChange={e=>setForm(f=>({...f,postal_code:e.target.value}))}/></label>
          <label>Rua<input value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))}/></label>
          <label>Número<input value={form.address_number} onChange={e=>setForm(f=>({...f,address_number:e.target.value}))}/></label>
          <label>Bairro<input value={form.neighborhood} onChange={e=>setForm(f=>({...f,neighborhood:e.target.value}))}/></label>
          <label className="valle-client-wide">Complemento<input value={form.address_complement} onChange={e=>setForm(f=>({...f,address_complement:e.target.value}))}/></label>
          <label className="valle-client-wide">Instagram<input value={form.instagram} onChange={e=>setForm(f=>({...f,instagram:e.target.value}))}/></label>
          <label className="valle-client-wide">Observações<textarea rows={3} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></label>
          <label className="valle-client-wide valle-client-check"><input type="checkbox" checked={!!form.marketing_consent} onChange={e=>setForm(f=>({...f,marketing_consent:e.target.checked}))}/>Cliente autorizou receber campanhas e ofertas. Marque apenas com autorização expressa.</label>
        </div>
        {error && <div className="valle-client-form-error" role="alert">{error}</div>}
        <div className="valle-detail-footer valle-detail-actions"><button type="button" className="valle-btn valle-btn-ghost" disabled={saving} onClick={()=>{setEditing(null);setError('');}}>Cancelar</button><button type="submit" className="valle-btn valle-btn-confirm" disabled={saving}>{saving ? 'Salvando...' : 'Salvar cliente'}</button></div>
      </form>
    </section></div>}
  </main>;
}

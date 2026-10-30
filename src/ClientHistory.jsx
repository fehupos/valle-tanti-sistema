import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import { downloadStoredDraft } from './contractStorage';

const dateBR = v => v ? new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—';
const money = v => v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const labels = { consolidada: 'Venda concluída', reservada: 'Reserva aguardando entrega', cancelada: 'Operação cancelada' };

export default function ClientHistory({ client, userProfile }) {
  const [operations, setOperations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(null);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    if (!client?.id) return;
    let active = true;
    setLoading(true);
    setError('');
    setOperations([]);
    supabase.rpc('client_operations_history_v1', { p_client_id: client.id })
      .then(({ data, error: err }) => {
        if (!active) return;
        if (err) setError(err.message);
        else setOperations(data || []);
      })
      .catch(err => { if (active) setError(err.message || 'Não foi possível consultar o histórico.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client?.id]);

  const summary = useMemo(() => ({
    purchases: operations.filter(s => s.operation_status === 'consolidada').length,
    reservations: operations.filter(s => s.operation_status === 'reservada').length,
    cancelled: operations.filter(s => s.operation_status === 'cancelada').length,
    total: operations.filter(s => s.operation_status === 'consolidada').reduce((a, s) => a + Number(s.sale_price || 0), 0),
  }), [operations]);

  async function download(sale) {
    setError(''); setDownloading(sale.sale_id);
    try {
      await downloadStoredDraft({ file_path: sale.contract_file_path, version: sale.contract_version }, sale.sale_id);
    } catch (e) { setError(e.message || 'Não foi possível baixar a minuta.'); }
    finally { setDownloading(null); }
  }

  return <section className="valle-client-history" aria-label="Histórico de compras e Chihuahuas">
    <div className="valle-client-section-title"><h3>Histórico e Chihuahuas</h3><span>Operações vinculadas a este CPF/cadastro</span></div>
    {error && <p className="valle-client-history-error" role="alert">{error}</p>}
    {loading ? <p className="valle-client-history-muted">Carregando histórico...</p> : <>
      <div className="valle-client-history-kpis">
        <div><small>Compras</small><strong>{summary.purchases}</strong></div>
        <div><small>Total comprado</small><strong>{money(summary.total)}</strong></div>
        <div><small>Reservas ativas</small><strong>{summary.reservations}</strong></div>
        <div><small>Cancelamentos</small><strong>{summary.cancelled}</strong></div>
      </div>
      {!operations.length ? <p className="valle-client-history-muted">Este cliente ainda não possui vendas ou reservas vinculadas ao cadastro.</p>
        : <div className="valle-client-operations">
          {operations.map(s => {
            const canDownload = Boolean(s.contract_file_path) && (userProfile?.role === 'gestao' || s.seller_id === userProfile?.user_id);
            const open = expanded === s.sale_id;
            return <article className="valle-client-operation" key={s.sale_id}>
              <button type="button" className="valle-client-operation-head" onClick={() => setExpanded(open ? null : s.sale_id)} aria-expanded={open}>
                {s.puppy_image ? <img className="valle-client-puppy-image" src={s.puppy_image} alt={`Filhote ${s.puppy_name || 'sem nome'}`} />
                  : <span className="valle-client-puppy-placeholder" aria-hidden="true">🐾</span>}
                <span className="valle-client-operation-main"><strong>{s.puppy_name || 'Filhote sem nome'}</strong><small>{dateBR(s.sale_date)} · {money(s.sale_price)}</small></span>
                <span className={`valle-client-status valle-client-status-${s.operation_status}`}>{labels[s.operation_status] || s.operation_status}</span>
                <span className="valle-client-collapse" aria-hidden="true">{open ? '−' : '+'}</span>
              </button>
              {open && <div className="valle-client-operation-body">
                <dl className="valle-client-history-grid">
                  <div><dt>Nascimento do Chihuahua</dt><dd>{dateBR(s.puppy_birth_date)}</dd></div>
                  <div><dt>Sexo</dt><dd>{s.puppy_gender || '—'}</dd></div>
                  <div><dt>Pelagem</dt><dd>{s.puppy_coat || '—'}</dd></div>
                  <div><dt>Cor</dt><dd>{s.puppy_color || '—'}</dd></div>
                  <div><dt>Vendedor</dt><dd>{s.seller_name || '—'}</dd></div>
                  <div><dt>Entrega prevista</dt><dd>{dateBR(s.expected_delivery_date)}</dd></div>
                  {s.operation_status === 'cancelada' && <div><dt>Cancelamento</dt><dd>{dateBR(s.cancelled_at)}</dd></div>}
                </dl>
                <div className="valle-client-contract-row">
                  {canDownload ? <button className="valle-btn valle-btn-confirm" type="button" disabled={downloading === s.sale_id} onClick={() => download(s)}>{downloading === s.sale_id ? 'Baixando...' : 'Baixar minuta armazenada'}</button>
                    : <span className="valle-client-history-muted">{s.contract_file_path ? 'Minuta: acesso restrito à Gestão e ao vendedor responsável.' : 'Nenhuma minuta armazenada para esta operação.'}</span>}
                </div>
              </div>}
            </article>;
          })}
        </div>}
    </>}
  </section>;
}

import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import './SalesPage.css';

const money = n => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const readable = s => s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '—';
const dateBR = s => s ? String(s).slice(0,10).split('-').reverse().join('/') : '—';
const monthKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
const currentMonth = () => monthKey(new Date());
const recentMonths = () => Array.from({ length: 4 }, (_, i) => {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 3 + i, 1);
  return { key: monthKey(d), label: d.toLocaleDateString('pt-BR', { month:'long', year:'numeric' }) };
});
const snapshot = sale => sale.contract_snapshot && typeof sale.contract_snapshot === 'object' ? sale.contract_snapshot : {};
const animalData = sale => {
  const snap = snapshot(sale);
  return snap.animal || snap.animal_details || snap.puppy || {};
};
const clientData = sale => {
  const snap = snapshot(sale);
  return snap.client || snap.buyer || {};
};

export default function SalesPage() {
  const [month, setMonth] = useState(currentMonth);
  const [sales, setSales] = useState([]);
  const [puppies, setPuppies] = useState({});
  const [clients, setClients] = useState({});
  const [sellers, setSellers] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const months = useMemo(recentMonths, []);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true); setError('');
      try {
        const first = `${month}-01`;
        const [year, m] = month.split('-').map(Number);
        const end = monthKey(new Date(year, m, 1)) + '-01';
        const { data, error: saleError } = await supabase.from('sales')
          .select('*').gte('sale_date', first).lt('sale_date', end)
          .order('sale_date', { ascending:false }).order('created_at', { ascending:false });
        if (saleError) throw saleError;
        const rows = data || [];
        const puppyIds = [...new Set(rows.map(s => s.puppy_id).filter(Boolean))];
        const clientIds = [...new Set(rows.map(s => s.client_id).filter(Boolean))];
        const [puppyResult, clientResult, sellerResult] = await Promise.all([
          puppyIds.length ? supabase.from('puppies').select('id,name,gender,coat,coat_color').in('id',puppyIds) : Promise.resolve({data:[],error:null}),
          clientIds.length ? supabase.from('clients').select('id,full_name,state').in('id',clientIds) : Promise.resolve({data:[],error:null}),
          supabase.rpc('get_seller_names')
        ]);
        if (puppyResult.error) throw puppyResult.error;
        if (clientResult.error) throw clientResult.error;

        console.log('DIAGNOSTICO VENDEDORES', {
          vendas: rows.map(s => ({
            seller_id: s.seller_id
          })),
          nomesRetornados: sellerResult.data,
          erro: sellerResult.error
        });

        if (sellerResult.error) throw sellerResult.error;
        if (!alive) return;
        setSales(rows);
        setPuppies(Object.fromEntries((puppyResult.data || []).map(p => [p.id,p])));
        setClients(Object.fromEntries((clientResult.data || []).map(c => [c.id,c])));
        
      setSellers(
        Object.fromEntries(
          (sellerResult.data || []).map(vendedor => [
            vendedor.user_id,
            vendedor.full_name
          ])
        )
      );

        setSellers(Object.fromEntries((sellerResult.data || []).map(u => [u.user_id,u.full_name])));
      } catch (e) { if (alive) setError(e.message || 'Falha ao carregar vendas.'); }
      finally { if (alive) setLoading(false); }
    }
    load();
    return () => { alive = false; };
  }, [month]);

  const total = sales.reduce((sum,s) => sum + Number(s.sale_price || 0), 0);
  const filtered = sales.filter(s => {
    const p = puppies[s.puppy_id] || {};
    const c = clients[s.client_id] || {};
    const a = animalData(s);
    const b = clientData(s);
    const words = [p.name,a.name,s.buyer_name,c.full_name,b.full_name,s.seller_id].join(' ').toLocaleLowerCase('pt-BR');
    return words.includes(search.trim().toLocaleLowerCase('pt-BR'));
  });
  const pageCount = Math.max(1,Math.ceil(filtered.length/15));
  const shown = filtered.slice((page-1)*15,page*15);
  const changeMonth = value => { if (/^\d{4}-\d{2}$/.test(value)) {setMonth(value);setPage(1);setSearch('');} };
  const cell = (s) => {
    const p = puppies[s.puppy_id] || {};
    const c = clients[s.client_id] || {};
    const a = animalData(s);
    const b = clientData(s);
    return {
      name: a.name || p.name || '—',
      gender: readable(a.gender || p.gender),
      color: a.color || a.coat_color || p.coat_color || '—',
      coat: readable(a.coat || p.coat),
      client: b.full_name || c.full_name || s.buyer_name || '—',
      uf: b.state || c.state || '—',
      // seller_id is an auth UUID, not a human-readable seller name.
      seller: s.seller_id ? `ID ${s.seller_id.slice(0,8)}…` : 'Não atribuído'
    };
  };

  return <div className="sales-page">
    <header className="sales-page-header"><div><h1>Vendas</h1><p>Indicadores e histórico por data da venda</p></div></header>
    <section className="sales-panel">
      <h2>Mês de referência</h2>
      <div className="sales-months">{months.map(m => <button type="button" key={m.key} className={month === m.key ? 'sales-month active' : 'sales-month'} onClick={() => changeMonth(m.key)}>{m.label}</button>)}</div>
      <label className="sales-other-month">Consultar outro mês <input type="month" value={month} onChange={e => changeMonth(e.target.value)}/></label>
      <div className="sales-kpis">
        <div><span>Quantidade de vendas</span><strong>{loading ? '…' : sales.length}</strong></div>
        <div><span>Valor vendido</span><strong>{loading ? '…' : money(total)}</strong></div>
        <div><span>Ticket médio</span><strong>{loading ? '…' : money(sales.length ? total/sales.length : 0)}</strong></div>
      </div>
    </section>
    <section className="sales-panel">
      <div className="sales-list-head"><div><h2>Histórico de vendas</h2><p>{filtered.length} venda(s) encontrada(s)</p></div><input aria-label="Buscar vendas" placeholder="Buscar filhote ou cliente..." value={search} onChange={e => {setSearch(e.target.value);setPage(1);}} /></div>
      {error && <p className="sales-error" role="alert">{error}</p>}
      {loading ? <p>Carregando vendas...</p> : <div className="sales-table-scroll"><table className="sales-table"><thead><tr>{['Data','Filhote','Sexo','Cor','Pelagem','Cliente','UF','Valor','Vendedor'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>
        {shown.map(s => { const v=cell(s); return <tr key={s.id} onClick={() => setSelected(s)} title="Clique para visualizar a venda" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')setSelected(s);}}><td>{dateBR(s.sale_date)}</td><td>{v.name}</td><td>{v.gender}</td><td>{v.color}</td><td>{v.coat}</td><td>{v.client}</td><td>{v.uf}</td><td className="sales-money">{money(s.sale_price)}</td><td>{v.seller}</td></tr>; })}
        {!shown.length && <tr><td colSpan={9} className="sales-empty">Nenhuma venda encontrada para este mês.</td></tr>}
      </tbody></table></div>}
      {pageCount>1 && <div className="sales-pagination"><button disabled={page===1} onClick={()=>setPage(p=>p-1)}>Anterior</button><span>Página {page} de {pageCount}</span><button disabled={page===pageCount} onClick={()=>setPage(p=>p+1)}>Próxima</button></div>}
    </section>
    {selected && <div className="sales-detail-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null);}}><section className="sales-detail" role="dialog" aria-modal="true" aria-label="Detalhes da venda"><header><h2>Detalhes da venda</h2><button type="button" onClick={()=>setSelected(null)} aria-label="Fechar">×</button></header><dl><dt>Data</dt><dd>{dateBR(selected.sale_date)}</dd><dt>Filhote</dt><dd>{cell(selected).name}</dd><dt>Cliente</dt><dd>{cell(selected).client}</dd><dt>Valor</dt><dd>{money(selected.sale_price)}</dd><dt>Adiantamento</dt><dd>{money(selected.advance_amount)}</dd><dt>Na entrega</dt><dd>{money(selected.delivery_amount ?? (Number(selected.sale_price || 0)-Number(selected.advance_amount || 0)))}</dd><dt>Fornecedor</dt><dd>{selected.supplier_name || '—'}</dd><dt>Vendedor</dt><dd>{cell(selected).seller}</dd></dl><p className="sales-detail-note">A emissão do contrato será adicionada em uma próxima etapa.</p></section></div>}
  </div>;
}

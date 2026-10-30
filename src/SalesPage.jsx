import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import './SalesPage.css';
import { downloadStoredDraft } from './contractStorage';
import SaleDetailModal from './SaleDetailModal';
import CancelOperationModal from './CancelOperationModal';
import DeleteTestDataModal from './DeleteTestDataModal';
import './ValleRefinements.css';

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

export default function SalesPage({ userProfile, onOperationChanged }) {
  const [month, setMonth] = useState(currentMonth);
  const [sales, setSales] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [reservations,setReservations]=useState([]);
  const [contractMap,setContractMap]=useState({});
  const [busy, setBusy] = useState(false);
  const [puppies, setPuppies] = useState({});
  const [clients, setClients] = useState({});
  const [sellers, setSellers] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [success, setSuccess] = useState('');
  const [toCancel, setToCancel] = useState(null);
  const [toDeleteTest,setToDeleteTest]=useState(null);
  const [cancelledSales, setCancelledSales] = useState([]);
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
          .select('*').eq('operation_status','consolidada').gte('sale_date', first).lt('sale_date', end)
          .order('sale_date', { ascending:false }).order('created_at', { ascending:false });
        if (saleError) throw saleError;
        const rows = data || [];
        const puppyIds = [...new Set(rows.map(s => s.puppy_id).filter(Boolean))];
        const clientIds = [...new Set(rows.map(s => s.client_id).filter(Boolean))];
        const [puppyResult, clientResult, sellerResult] = await Promise.all([
          puppyIds.length ? supabase.from('puppies').select('id,name,gender,coat,coat_color,image').in('id',puppyIds) : Promise.resolve({data:[],error:null}),
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
        const {count:pending,error:pendingError}=await supabase.from('sales').select('id',{count:'exact',head:true}).eq('operation_status','reservada');
        if(pendingError) throw pendingError;
        setPendingCount(pending||0);
        const {data:reservationsData,error:reservationError}=await supabase.from('sales').select('*').eq('operation_status','reservada').order('expected_delivery_date',{ascending:true});
        if(reservationError) throw reservationError;
        setReservations(reservationsData||[]);
        const {data:cancelledRows,error:cancelledError}=await supabase.from('sales').select('*').eq('operation_status','cancelada').order('cancelled_at',{ascending:false}).limit(100);
        if(cancelledError) throw cancelledError;
        setCancelledSales(cancelledRows||[]);
        const allRows=[...rows,...(reservationsData||[]),...(cancelledRows||[])];
        const allIds=allRows.map(s=>s.id);
        if(allIds.length){
          const {data:contractRows,error:contractError}=await supabase.from('contracts').select('sale_id,file_path,version,id').in('sale_id',allIds).order('version',{ascending:false});
          if(contractError) throw contractError;
          setContractMap(Object.fromEntries((contractRows||[]).reverse().map(c=>[c.sale_id,c])));
          const missingPuppyIds=[...new Set([...(reservationsData||[]),...(cancelledRows||[])].map(s=>s.puppy_id).filter(id=>id&&!puppyIds.includes(id)))];
          if(missingPuppyIds.length){
            const {data:reservedPuppies,error:rpError}=await supabase.from('puppies').select('id,name,gender,coat,coat_color,image').in('id',missingPuppyIds);
            if(rpError) throw rpError;
            setPuppies(Object.fromEntries([...(puppyResult.data||[]),...(reservedPuppies||[])].map(p=>[p.id,p])));
          }
        } else setContractMap({});
        setPuppies(prev => ({...prev,...Object.fromEntries((puppyResult.data || []).map(p => [p.id,p]))}));
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
  }, [month,reloadKey]);

  async function confirmDelivery(id) {
    if(!window.confirm('Confirmar a entrega? A reserva passará a venda consolidada e a comissão será contabilizada hoje.')) return;
    setBusy(true);setError('');
    const {error:e}=await supabase.rpc('confirm_puppy_delivery_v1',{p_sale_id:id});
    if(e) setError(e.message); else { setSelected(null); setSuccess('Entrega confirmada com sucesso. A venda foi consolidada.'); setReloadKey(n=>n+1); }
    setBusy(false);
  }
  async function downloadContract(sale) {
    setBusy(true);setError('');
    try {await downloadStoredDraft(contractMap[sale.id],sale,clients[sale.client_id]);}
    catch(e){setError(e.message||'Não foi possível baixar a minuta.');}
    finally{setBusy(false);}
  }
  const canCancel = sale => userProfile?.role === 'gestao' || (userProfile?.role === 'vendedor' && sale.operation_status === 'reservada' && sale.seller_id === userProfile.user_id);
  async function cancelledSuccessfully() {
    setToCancel(null);setSelected(null);
    setSuccess('Operação cancelada. O filhote passou para o Histórico de Filhotes com status Cancelado. Reembolso registrado sem movimentação financeira.');
    setReloadKey(n=>n+1);
    await onOperationChanged?.();
  }
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
      seller: sellers[s.seller_id] || (s.seller_id ? 'Vendedor' : 'Não atribuído')
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
        <div><span>Ticket médio</span><strong>{loading ? '…' : money(sales.length ? total/sales.length : 0)}</strong></div><div><span>Reservas aguardando entrega</span><strong>{loading ? '…' : pendingCount}</strong></div>
      </div>
    </section>
    <section className="sales-panel">
      <div className="sales-list-head"><div><h2>Histórico de vendas</h2><p>{filtered.length} venda(s) encontrada(s)</p></div><input aria-label="Buscar vendas" placeholder="Buscar filhote ou cliente..." value={search} onChange={e => {setSearch(e.target.value);setPage(1);}} /></div>
      {error && <p className="sales-error" role="alert">{error}</p>}
      {success && <p className="valle-success" role="status">{success}</p>}
      {loading ? <p>Carregando vendas...</p> : <div className="sales-table-scroll valle-table-fit"><table className="sales-table valle-table"><thead><tr>{['Data','Filhote','Sexo','Cor','Pelagem','Cliente','UF','Valor','Vendedor','Minuta'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>
        {shown.map(s => { const v=cell(s); return <tr key={s.id} onClick={() => setSelected(s)} title="Clique para visualizar a venda" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')setSelected(s);}}><td>{dateBR(s.sale_date)}</td><td>{v.name}</td><td>{v.gender}</td><td>{v.color}</td><td>{v.coat}</td><td>{v.client}</td><td>{v.uf}</td><td className="sales-money">{money(s.sale_price)}</td><td>{v.seller}</td><td><button className="valle-btn valle-btn-download" type="button" disabled={busy||!contractMap[s.id]} onClick={e=>{e.stopPropagation();downloadContract(s);}}>{contractMap[s.id]?'Baixar minuta':'Indisponível'}</button></td></tr>; })}
        {!shown.length && <tr><td colSpan={10} className="sales-empty">Nenhuma venda encontrada para este mês.</td></tr>}
      </tbody></table></div>}
      {pageCount>1 && <div className="sales-pagination"><button disabled={page===1} onClick={()=>setPage(p=>p-1)}>Anterior</button><span>Página {page} de {pageCount}</span><button disabled={page===pageCount} onClick={()=>setPage(p=>p+1)}>Próxima</button></div>}
    </section>
    <section className="sales-panel"><h2>Reservas aguardando entrega ({reservations.length})</h2>
      <div className="sales-table-scroll valle-table-fit"><table className="sales-table valle-table"><thead><tr><th>Entrega prevista</th><th>Filhote</th><th>Cliente</th><th>Valor</th><th>Ações</th></tr></thead><tbody>
      {reservations.map(r=><tr key={r.id} onClick={()=>setSelected(r)} style={{cursor:'pointer'}}><td>{dateBR(r.expected_delivery_date)}</td><td>{animalData(r).name||r.puppy_id}</td><td>{clientData(r).full_name||r.buyer_name}</td><td>{money(r.sale_price)}</td><td><button type="button" className="valle-btn valle-btn-confirm" disabled={busy} onClick={e=>{e.stopPropagation();confirmDelivery(r.id);}}>Confirmar entrega</button> <button type="button" className="valle-btn valle-btn-download" disabled={busy||!contractMap[r.id]} onClick={e=>{e.stopPropagation();downloadContract(r);}}>{contractMap[r.id]?'Baixar minuta':'Indisponível'}</button></td></tr>)}
      {!reservations.length&&<tr><td colSpan={5}>Nenhuma reserva pendente.</td></tr>}</tbody></table></div>
    </section>
    <section className="sales-panel"><h2>Operações canceladas</h2><p className="valle-cancel-muted">Histórico preservado. Até 100 cancelamentos recentes.</p>
      <div className="sales-table-scroll valle-table-fit"><table className="sales-table valle-table"><thead><tr><th>Cancelamento</th><th>Filhote</th><th>Cliente</th><th>Tipo</th><th>Motivo</th><th>Reembolso</th><th>Minuta</th></tr></thead><tbody>
        {cancelledSales.map(s=><tr key={s.id} onClick={()=>setSelected(s)} style={{cursor:'pointer'}} tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')setSelected(s);}}><td>{dateBR(s.cancelled_at)}</td><td>{animalData(s).name||puppies[s.puppy_id]?.name||'—'}</td><td>{clientData(s).full_name||s.buyer_name||'—'}</td><td>Cancelada</td><td>{s.cancellation_reason||'—'}</td><td>{money(s.refund_amount)} — {s.refund_status||'—'}</td><td><button className="valle-btn valle-btn-download" type="button" disabled={busy||!contractMap[s.id]} onClick={e=>{e.stopPropagation();downloadContract(s);}}>{contractMap[s.id]?'Baixar minuta':'Indisponível'}</button></td></tr>)}
        {!cancelledSales.length&&<tr><td colSpan={7}>Nenhuma operação cancelada.</td></tr>}
      </tbody></table></div>
    </section>
    {toDeleteTest && <DeleteTestDataModal sale={toDeleteTest} puppy={puppies[toDeleteTest.puppy_id]} onClose={()=>setToDeleteTest(null)} onDeleted={async(failures)=>{setToDeleteTest(null);setSelected(null);setSuccess(failures.length?'Operação excluída do banco; arquivos pendentes no Storage: '+failures.join('; '):'Dados de teste excluídos com sucesso.');setReloadKey(k=>k+1);await onOperationChanged?.();}}/>}
    {toCancel && <CancelOperationModal sale={toCancel} onClose={()=>setToCancel(null)} onCancelled={cancelledSuccessfully}/>}
    {selected && <SaleDetailModal
      sale={selected}
      puppy={puppies[selected.puppy_id]}
      client={clients[selected.client_id]}
      seller={sellers[selected.seller_id]}
      contract={contractMap[selected.id]}
      busy={busy}
      onClose={()=>setSelected(null)}
      onDownload={()=>downloadContract(selected)}
      canCancel={canCancel(selected)}
      canDelete={userProfile?.role==='gestao'}
      onDelete={()=>{setToDeleteTest(selected);setSelected(null);}}
      onCancel={()=>{setToCancel(selected);setSelected(null);}}
    />}

  </div>;
}

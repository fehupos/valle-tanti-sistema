import { useState } from 'react';
import './ValleRefinements.css';

const money = value => Number(value || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const date = value => value ? String(value).slice(0,10).split('-').reverse().join('/') : '—';
const show = value => value === 0 ? '0' : (value || '—');
export default function SaleDetailModal({sale,puppy,client,seller,contract,busy=false,onClose,onDownload,onCancel,canCancel=false,onDelete,canDelete=false}){
  const [downloading,setDownloading]=useState(false);
  const [error,setError]=useState('');
  if(!sale)return null;
  const snap=sale.contract_snapshot || {};
  const animal=snap.animal || snap.animal_details || snap.puppy || {};
  const buyer=snap.client || snap.buyer || {};
  const isReservation=sale.operation_status === 'reservada';
  const isCancelled=sale.operation_status === 'cancelada';
  const image=puppy?.image || animal.image;
  const fields=[
    ['Filhote',animal.name || puppy?.name],
    ['Sexo',animal.gender || puppy?.gender],
    ['Pelagem',animal.coat || puppy?.coat],
    ['Cor',animal.coat_color || animal.color || puppy?.coat_color],
    ['Cliente',buyer.full_name || client?.full_name || sale.buyer_name],
    ['UF',buyer.state || client?.state],
    ['Data da operação',date(sale.sale_date)],
    ...(isReservation ? [['Entrega prevista',date(sale.expected_delivery_date)]] : []),
    ['Valor total',money(sale.sale_price)],
    ['Adiantamento',money(sale.advance_amount)],
    ['Valor na entrega',money(sale.delivery_amount ?? (Number(sale.sale_price || 0)-Number(sale.advance_amount || 0)))],
    ['Fornecedor',sale.supplier_name],
    ['Vendedor',seller || '—'],
    ...(isCancelled ? [['Motivo do cancelamento',sale.cancellation_reason],['Data do cancelamento',date(sale.cancelled_at)],['Reembolso registrado',money(sale.refund_amount)],['Situação do reembolso',sale.refund_status],['Observações do reembolso',sale.refund_notes]] : [])
  ];
  async function download(){
    if(!contract || !onDownload)return;
    setDownloading(true);setError('');
    try {await onDownload();}catch(e){setError(e.message||'Falha ao baixar a minuta.');}
    finally{setDownloading(false);}
  }
  return <div className="valle-detail-overlay" onMouseDown={e=>{if(e.currentTarget===e.target)onClose();}}>
    <section className="valle-detail-modal" role="dialog" aria-modal="true" aria-label="Detalhes da operação">
      <header className="valle-detail-header"><div><span className="valle-detail-kicker">VALLE TANTI AUGURI</span><h2>{isCancelled?'Operação cancelada':isReservation?'Detalhes da reserva':'Detalhes da venda'}</h2></div><button type="button" className="valle-detail-close" aria-label="Fechar" onClick={onClose}>×</button></header>
      <div className="valle-detail-content">
        <div className="valle-detail-hero">{image?<img src={image} alt={`Foto de ${animal.name || puppy?.name || 'filhote'}`} />:<div className="valle-detail-placeholder">🐶</div>}<div><span className="valle-status-label">{isCancelled?'Operação cancelada':isReservation?'Reserva ativa':'Venda consolidada'}</span><h3>{show(animal.name || puppy?.name)}</h3><p>{show(animal.coat_color || animal.color || puppy?.coat_color)}</p></div></div>
        <dl className="valle-detail-grid">{fields.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{show(value)}</dd></div>)}</dl>
        {error && <p role="alert" className="sales-error">{error}</p>}
      </div>
      <footer className="valle-detail-footer"><p>A minuta disponível é a versão armazenada no Supabase.</p><div className="valle-detail-actions"><button type="button" className="valle-btn valle-btn-ghost" onClick={onClose}>Fechar</button>{canDelete && <button type="button" className="valle-btn valle-btn-danger" disabled={busy} onClick={onDelete}>Excluir teste</button>}{canCancel && !isCancelled && <button type="button" className="valle-btn valle-btn-danger" disabled={busy} onClick={onCancel}>Cancelar operação</button>}<button type="button" className="valle-btn valle-btn-confirm" disabled={!contract||busy||downloading} onClick={download}>{downloading?'Baixando...':contract?'Baixar minuta':'Minuta indisponível'}</button></div></footer>
    </section>
  </div>;
}

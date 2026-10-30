import { useState } from 'react';
import { supabase } from './supabase';
import './ValleRefinements.css';

export default function CancelOperationModal({ sale, onClose, onCancelled }) {
  const [reason, setReason] = useState('');
  const [refundAmount, setRefundAmount] = useState('0');
  const [refundStatus, setRefundStatus] = useState('nao_aplicavel');
  const [refundNotes, setRefundNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const amount = Number(String(refundAmount).replace(',', '.'));
  async function submit(event) {
    event.preventDefault();
    if (reason.trim().length < 5) { setError('Descreva o motivo com pelo menos 5 caracteres.'); return; }
    if (!Number.isFinite(amount) || amount < 0 || amount > Number(sale.sale_price || 0)) { setError('Informe um valor de reembolso válido.'); return; }
    if ((amount === 0 && refundStatus !== 'nao_aplicavel') || (amount > 0 && refundStatus === 'nao_aplicavel')) { setError('Selecione uma situação compatível com o reembolso.'); return; }
    if (!window.confirm('Confirmar o cancelamento? O filhote ficará com status CANCELADO e aparecerá apenas no Histórico de Filhotes. O contrato e o histórico serão preservados.')) return;
    setBusy(true); setError('');
    try {
      const { error: rpcError } = await supabase.rpc('cancel_sale_operation_v1', {
        p_sale_id: sale.id, p_reason: reason.trim(), p_refund_amount: amount,
        p_refund_status: refundStatus, p_refund_notes: refundNotes.trim() || null
      });
      if (rpcError) throw rpcError;
      await onCancelled?.();
    } catch (e) { setError(e.message || 'Não foi possível cancelar a operação.'); }
    finally { setBusy(false); }
  }
  return <div className="valle-detail-overlay" style={{zIndex:3200}} onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}>
    <form className="valle-detail-modal valle-cancel-modal" role="dialog" aria-modal="true" aria-label="Cancelar operação" onSubmit={submit}>
      <header className="valle-detail-header"><div><span className="valle-detail-kicker">VALLE TANTI AUGURI</span><h2>Cancelar {sale.operation_status === 'reservada' ? 'reserva' : 'venda'}</h2></div><button type="button" className="valle-detail-close" onClick={onClose} disabled={busy} aria-label="Fechar">×</button></header>
      <div className="valle-detail-content valle-cancel-form">
        <p>Esta operação será preservada no histórico como <strong>Cancelada</strong>. O filhote receberá o status <strong>Cancelado</strong>, sairá da lista de Filhotes ativos e aparecerá somente no <strong>Histórico de Filhotes</strong>. A minuta permanecerá vinculada à operação cancelada.</p>
        <label>Motivo do cancelamento <span aria-hidden="true">*</span><textarea rows={3} value={reason} onChange={e=>setReason(e.target.value)} required minLength={5} maxLength={1000} placeholder="Ex.: Cliente desistiu da reserva"/></label>
        <label>Valor do reembolso a registrar (R$)<input type="number" inputMode="decimal" min="0" max={Number(sale.sale_price||0)} step="0.01" value={refundAmount} onChange={e=>{setRefundAmount(e.target.value);const num=Number(e.target.value);if(num===0)setRefundStatus('nao_aplicavel');else if(refundStatus==='nao_aplicavel')setRefundStatus('pendente');}} required/></label>
        <label>Situação do reembolso<select value={refundStatus} onChange={e=>setRefundStatus(e.target.value)}><option value="nao_aplicavel">Não se aplica (R$ 0)</option><option value="pendente">Pendente</option><option value="realizado">Já realizado (somente registro)</option></select></label>
        <label>Observações sobre o reembolso<textarea rows={2} maxLength={2000} value={refundNotes} onChange={e=>setRefundNotes(e.target.value)} placeholder="Ex.: PIX a devolver, data combinada etc." /></label>
        <p className="valle-cancel-note">O sistema apenas registra a informação. Não executa PIX, estorno ou movimentação bancária.</p>
        {error && <p className="sales-error" role="alert">{error}</p>}
      </div>
      <footer className="valle-detail-footer valle-detail-actions"><button type="button" className="valle-btn valle-btn-ghost" onClick={onClose} disabled={busy}>Voltar</button><button type="submit" className="valle-btn valle-btn-danger" disabled={busy}>{busy?'Cancelando...':'Confirmar cancelamento'}</button></footer>
    </form>
  </div>;
}

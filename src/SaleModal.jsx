import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import './SaleModal.css';
import { createAndStoreDraft, downloadStoredDraft } from './contractStorage';

const emptyClient = {
  full_name: '', rg: '', cpf: '', email: '', phone: '', nationality: 'Brasileira',
  marital_status: '', profession: '', instagram: '', address: '', address_number: '',
  neighborhood: '', address_complement: '', postal_code: '', city: '', state: ''
};
const clientFields = Object.keys(emptyClient);
const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const text = (v) => String(v ?? '').trim();
const cents = (v) => Math.round(Number(v || 0) * 100);
const money = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const units = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const teens = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const tens = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const hundreds = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
function underThousand(n) {
  if (n === 100) return 'cem';
  const parts = [];
  if (n >= 100) { parts.push(hundreds[Math.floor(n / 100)]); n %= 100; }
  if (n >= 20) { parts.push(tens[Math.floor(n / 10)]); n %= 10; }
  else if (n >= 10) { parts.push(teens[n - 10]); n = 0; }
  if (n > 0) parts.push(units[n]);
  return parts.join(' e ');
}
function integerWords(n) {
  if (n === 0) return 'zero';
  const groups = [];
  const names = ['', 'mil', 'milhão', 'bilhão'];
  const plurals = ['', 'mil', 'milhões', 'bilhões'];
  let i = 0;
  while (n > 0 && i < 4) {
    const part = n % 1000;
    if (part) {
      const prefix = i === 1 && part === 1 ? '' : underThousand(part);
      const suffix = i === 0 ? '' : (part === 1 ? names[i] : plurals[i]);
      groups.unshift([prefix, suffix].filter(Boolean).join(' '));
    }
    n = Math.floor(n / 1000);
    i++;
  }
  return groups.join(' e ');
}
function amountWords(value) {
  const total = cents(value);
  if (!Number.isSafeInteger(total) || total < 0 || total >= 1e12) return 'Valor fora do intervalo suportado';
  const whole = Math.floor(total / 100);
  const fraction = total % 100;
  const wholeText = whole ? `${integerWords(whole)} ${whole === 1 ? 'real' : 'reais'}` : '';
  const centsText = fraction ? `${integerWords(fraction)} ${fraction === 1 ? 'centavo' : 'centavos'}` : '';
  return [wholeText, centsText].filter(Boolean).join(' e ') || 'zero reais';
}
function ageAt(birth, saleDate) {
  if (!birth || !saleDate) return '';
  const start = new Date(`${birth}T12:00:00Z`);
  const end = new Date(`${saleDate}T12:00:00Z`);
  const days = Math.round((end - start) / 86400000);
  return Number.isFinite(days) && days >= 0 ? String(days) : '';
}
const steps = ['Cliente', 'Endereço', 'Animal', 'Venda'];

export default function SaleModal({ puppy, mode = 'sale', onClose, onSold }) {
  const [step, setStep] = useState(0);
  const [completed, setCompleted] = useState(null);
  const [contractWarning, setContractWarning] = useState('');
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState('');
  const [creatingClient, setCreatingClient] = useState(false);
  const [client, setClient] = useState({ ...emptyClient });
  const [clientSearch, setClientSearch] = useState('');
  const [matchedClient, setMatchedClient] = useState(null);
  const [checkingCpf, setCheckingCpf] = useState(false);
  const [cpfLookupError, setCpfLookupError] = useState('');
  const [animal, setAnimal] = useState({
    name: puppy?.name || '', gender: puppy?.gender || '', breed: 'Chihuahua',
    color: puppy?.coat_color || '', father: '', mother: '',
    birth_date: puppy?.birth_date || '', pedigree_number: '', microchip_number: '', vaccine_count: ''
  });
  const [price, setPrice] = useState(puppy?.price != null ? String(puppy.price) : '');
  const [advance, setAdvance] = useState('0');
  const [saleDate, setSaleDate] = useState(localDate);
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [supplier, setSupplier] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [installments, setInstallments] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sellerProfile, setSellerProfile] = useState(null);
  const [sellerOptions, setSellerOptions] = useState([]);
  const [selectedSeller, setSelectedSeller] = useState('');
  const [sellerLoading, setSellerLoading] = useState(true);
  const remaining = (cents(price) - cents(advance)) / 100;
  const filteredClients = useMemo(() => clients.filter(c =>
    [c.full_name, c.cpf, c.phone].some(v => text(v).toLowerCase().includes(clientSearch.toLowerCase()))
  ), [clients, clientSearch]);

  useEffect(() => {
    let active = true;
    // Lista compartilhada de clientes para usuários ativos, via RPC com autorização no banco.
    supabase.rpc('list_clients_for_sales').then(({ data, error: e }) => {
      if (!active) return;
      if (e) setError(`Não foi possível carregar os clientes: ${e.message}`);
      else setClients((data || []).sort((a, b) => text(a.full_name).localeCompare(text(b.full_name), 'pt-BR')));
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadSeller() {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) throw new Error('Sessão expirada. Entre novamente no sistema.');
        const { data: profile, error: profileError } = await supabase
          .from('user_profiles')
          .select('user_id, full_name, role, active')
          .eq('user_id', user.id)
          .maybeSingle();
        if (profileError) throw profileError;
        if (!profile?.active || !['gestao', 'vendedor'].includes(profile.role)) {
          throw new Error('Seu usuário não tem permissão para registrar vendas.');
        }
        if (!active) return;
        setSellerProfile(profile);
        if (profile.role === 'gestao') {
          const { data: sellers, error: sellersError } = await supabase
            .from('user_profiles')
            .select('user_id, full_name, role, active')
            .eq('role', 'vendedor')
            .eq('active', true)
            .order('full_name');
          if (sellersError) throw sellersError;
          if (active) setSellerOptions(sellers || []);
        }
      } catch (e) {
        if (active) setError(e.message || 'Não foi possível verificar seu perfil.');
      } finally {
        if (active) setSellerLoading(false);
      }
    }
    loadSeller();
    return () => { active = false; };
  }, []);

  function selectClient(id) {
    setClientId(id);
    setMatchedClient(null);
    const selected = clients.find(c => c.id === id);
    if (selected) setClient(Object.fromEntries(clientFields.map(k => [k, selected[k] ?? ''])));
  }
  function changeClient(key, value) {
    if (key === 'cpf') setMatchedClient(null);
    setClient(prev => ({ ...prev, [key]: value }));
  }
  useEffect(() => {
    if (!creatingClient) return;
    const cpf = text(client.cpf).replace(/\D/g, '');
    setMatchedClient(null);
    setCpfLookupError('');
    if (cpf.length !== 11) { setCheckingCpf(false); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setCheckingCpf(true);
      const { data, error: lookupError } = await supabase.rpc('find_client_by_cpf', { p_cpf: cpf });
      if (cancelled) return;
      if (lookupError) setCpfLookupError('Não foi possível verificar o CPF. Tente novamente.');
      else setMatchedClient(data?.[0] || null);
      setCheckingCpf(false);
    }, 450);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [client.cpf, creatingClient]);
  function changeAnimal(key, value) { setAnimal(prev => ({ ...prev, [key]: value })); }
  function validateStep(index) {
    if (index === 0) {
      if (!creatingClient && !clientId) return 'Selecione um cliente ou marque Cadastrar novo cliente.';
      if (!text(client.full_name)) return 'Informe o nome completo do cliente.';
    }
    if (index === 2) {
      if (!text(animal.name) || !text(animal.gender) || !text(animal.breed)) return 'Preencha nome, sexo e raça do animal.';
      if (animal.birth_date && saleDate && ageAt(animal.birth_date, saleDate) === '') return 'A data de nascimento não pode ser posterior à venda.';
      if (animal.vaccine_count !== '' && (!Number.isInteger(Number(animal.vaccine_count)) || Number(animal.vaccine_count) < 0)) return 'Quantidade de vacinas inválida.';
    }
    if (index === 3) {
      if (mode === 'reservation' && (!expectedDelivery || expectedDelivery < localDate())) return 'Informe uma data prevista de entrega válida (hoje ou futura).';
      if (!Number.isFinite(Number(price)) || cents(price) <= 0) return 'Informe um valor total válido.';
      if (!Number.isFinite(Number(advance)) || cents(advance) < 0 || remaining < 0) return 'O adiantamento deve estar entre zero e o valor total.';
      if (paymentMethod === 'cartao' && (!Number.isInteger(Number(installments)) || Number(installments) < 1)) return 'Informe as parcelas do cartão.';
    }
    return '';
  }
  function next() {
    const issue = validateStep(step);
    if (issue) { setError(issue); return; }
    setError('');
    setStep(s => Math.min(s + 1, 3));
  }
  async function submitSale(event) {
    event.preventDefault();
    for (let i = 0; i < 4; i++) {
      const issue = validateStep(i);
      if (issue) { setStep(i); setError(issue); return; }
    }
    if (!puppy?.id || puppy.status !== 'disponivel') { setError('Filhote indisponível para venda.'); return; }
    if (sellerLoading || !sellerProfile) {
      setError('Não foi possível validar o vendedor. Reabra o formulário e tente novamente.');
      return;
    }
    setLoading(true); setError('');
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user || user.id !== sellerProfile.user_id) {
        throw new Error('Sessão alterada ou expirada. Entre novamente.');
      }
      const payload = Object.fromEntries(clientFields.map(k => [k, text(client[k]) || null]));
      let selectedClientId = clientId;
      if (creatingClient) {
        const cpf = text(client.cpf).replace(/\D/g, '');
        if (cpf.length === 11) {
          const { data: existing, error: lookupError } = await supabase.rpc('find_client_by_cpf', { p_cpf: cpf });
          if (lookupError) throw lookupError;
          if (existing?.length) selectedClientId = existing[0].id;
        }
        if (!selectedClientId) {
          const { data, error: e } = await supabase.from('clients').insert(payload).select('id').single();
          if (e) throw e;
          selectedClientId = data.id;
        }
      } else {
        // Atualiza o cadastro antes da venda para o snapshot refletir os dados conferidos.
        const { error: e } = await supabase.from('clients').update(payload).eq('id', clientId);
        if (e) throw e;
      }
      const animalDetails = {
        ...animal,
        days_old_at_sale: ageAt(animal.birth_date, mode === 'reservation' ? expectedDelivery : localDate()),
        vaccine_count: animal.vaccine_count === '' ? null : Number(animal.vaccine_count)
      };
      const { data: saleId, error: e } = await supabase.rpc(mode === 'reservation' ? 'reserve_puppy_v1' : 'register_puppy_sale_v2', {
        p_puppy_id: puppy.id,
        p_client_id: selectedClientId,
        p_sale_price: cents(price) / 100,
        p_advance_amount: cents(advance) / 100,
        p_sale_date: localDate(),
        ...(mode === 'reservation' ? {p_expected_delivery_date: expectedDelivery} : {}),
        p_payment_method: paymentMethod,
        p_installments: paymentMethod === 'cartao' ? Number(installments) : null,
        // Vendedor sempre registra em seu nome; Gestão pode atribuir a um vendedor ativo.
        p_seller_id: sellerProfile.role === 'vendedor'
          ? user.id
          : (selectedSeller || null),
        p_notes: text(notes) || null,
        p_supplier_name: text(supplier) || null,
        p_animal_details: animalDetails
      });
      if (e) throw e;
      // A operação já foi registrada. Uma falha na geração do Word não desfaz a venda/reserva.
      const {data: savedSale,error: readError}=await supabase.from('sales').select('*').eq('id',saleId).single();
      if(readError) throw new Error(`Operação registrada, mas não foi possível consultar seus dados: ${readError.message}`);
      let contract=null;
      try { contract=await createAndStoreDraft(savedSale,user.id); }
      catch(contractError) { setContractWarning(`Operação registrada, porém a minuta não foi armazenada: ${contractError.message}. Avise a Gestão.`); }
      setCompleted({saleId,contract,mode});
      onSold?.(saleId, { keepModalOpen:true });
    } catch (e) {
      setError(e?.message || 'Não foi possível registrar a venda.');
    } finally { setLoading(false); }
  }

  const field = (label, key, options = {}) => (
    <label className={options.wide ? 'sale-wide' : ''} key={key}>{label}
      <input type={options.type || 'text'} value={client[key] ?? ''} onChange={e => changeClient(key, e.target.value)} placeholder={options.placeholder || ''} />
    </label>
  );
  const animalField = (label, key, options = {}) => (
    <label className={options.wide ? 'sale-wide' : ''} key={key}>{label}
      <input type={options.type || 'text'} min={options.min} value={animal[key] ?? ''} onChange={e => changeAnimal(key, e.target.value)} />
    </label>
  );
  if (completed) return (
    <div className="sale-overlay"><section className="sale-dialog" role="dialog" aria-modal="true" aria-label="Operação concluída" style={{padding:28,maxWidth:550}}>
      <h2>{completed.mode === 'reservation' ? 'Reserva realizada com sucesso!' : 'Venda realizada com sucesso!'}</h2>
      <p>{completed.contract ? 'Sua minuta foi gerada e armazenada no Supabase.' : 'O registro foi salvo no sistema.'}</p>
      {contractWarning && <p className="sales-error" role="alert">{contractWarning}</p>}
      {completed.contract && <button type="button" className="primary-button" onClick={async()=>{try{await downloadStoredDraft(completed.contract,{id:completed.saleId,contract_snapshot:{client}},client);}catch(e){setContractWarning(e.message);}}}>Baixar minuta Word (.docx)</button>}
      <p>Se precisar acessar essa minuta novamente, entre no seu <strong>Histórico de Vendas</strong> ou na lista de <strong>Reservas</strong>.</p>
      <button type="button" className="secondary-button" onClick={onClose}>Concluir e fechar</button>
    </section></div>
  );
  return (
    <div className="sale-overlay" onMouseDown={e => { if (e.target === e.currentTarget && !loading) onClose(); }}>
      <section className="sale-dialog" role="dialog" aria-modal="true" aria-labelledby="sale-title">
        <header className="sale-header">
          <div><h2 id="sale-title">{mode === 'reservation' ? 'Reservar filhote' : 'Vender filhote'}</h2><p>{puppy?.name || 'Filhote sem nome'} · Dados para o contrato</p></div>
          <button type="button" className="sale-close" onClick={onClose} disabled={loading} aria-label="Fechar">×</button>
        </header>
        <nav className="sale-steps" aria-label="Etapas do formulário">
          {steps.map((name, index) => <button key={name} type="button" className={step === index ? 'sale-step active' : 'sale-step'} disabled={loading} onClick={() => { setError(''); setStep(index); }}>{index + 1}. {name}</button>)}
        </nav>
        <form className="sale-form" onSubmit={submitSale} noValidate>
          {step === 0 && <>
            <h3>Identificação do cliente</h3>
            <label className="sale-switch"><input type="checkbox" checked={creatingClient} onChange={e => { setCreatingClient(e.target.checked); setClientId(''); setClient({ ...emptyClient }); setMatchedClient(null); }} /> Cadastrar novo cliente</label>
            {!creatingClient && <>
              <label>Buscar cliente<input value={clientSearch} onChange={e => setClientSearch(e.target.value)} placeholder="Nome, CPF ou telefone" /></label>
              <label>Cliente existente *<select value={clientId} onChange={e => selectClient(e.target.value)}><option value="">Selecione um cliente</option>{filteredClients.map(c => <option key={c.id} value={c.id}>{c.full_name}{c.cpf ? ` — ${c.cpf}` : ''}</option>)}</select></label>
            </>}
            {(creatingClient || clientId) && <div className="sale-grid">
              {field('Nome completo *', 'full_name', { wide: true })}
              {field('RG', 'rg')}{field('CPF', 'cpf')}
              {creatingClient && <div className="sale-wide">
                {checkingCpf && <p className="sale-help" role="status">Verificando CPF...</p>}
                {cpfLookupError && <p className="sale-help" role="alert">{cpfLookupError}</p>}
                {matchedClient && <p className="sale-help">CPF já cadastrado para {matchedClient.full_name}. O cadastro existente será reutilizado nesta venda. Os dados cadastrais anteriores não serão alterados.</p>}
              </div>}
              {field('E-mail', 'email', { type: 'email' })}{field('WhatsApp / telefone', 'phone')}
              {field('Nacionalidade', 'nationality')}{field('Estado civil', 'marital_status')}
              {field('Profissão', 'profession')}{field('Instagram', 'instagram')}
            </div>}
          </>}
          {step === 1 && <>
            <h3>Endereço do cliente</h3>
            <div className="sale-grid">
              {field('Rua', 'address', { wide: true })}
              {field('Número', 'address_number')}{field('Bairro', 'neighborhood')}
              {field('Complemento', 'address_complement')}{field('CEP', 'postal_code')}
              {field('Cidade', 'city')}{field('Estado (UF)', 'state')}
            </div>
          </>}
          {step === 2 && <>
            <h3>Informações do animal</h3>
            <p className="sale-help">Dados preenchidos a partir do cadastro do filhote podem ser conferidos e complementados para este contrato.</p>
            <div className="sale-grid">
              {animalField('Nome *', 'name')}
              <label>Sexo *<select value={animal.gender} onChange={e => changeAnimal('gender', e.target.value)}><option value="macho">Macho</option><option value="femea">Fêmea</option></select></label>
              {animalField('Raça *', 'breed')}{animalField('Cor', 'color')}
              {animalField('Pai', 'father')}{animalField('Mãe', 'mother')}
              {animalField('Data de nascimento', 'birth_date', { type: 'date' })}
              {animalField('Número do pedigree', 'pedigree_number')}
              {animalField('Número do microchip', 'microchip_number')}
              {animalField('Quantidade de vacinas', 'vaccine_count', { type: 'number', min: 0 })}
              <label>Dias de vida na data da venda<input readOnly value={ageAt(animal.birth_date, saleDate)} placeholder="Calculado automaticamente" /></label>
            </div>
          </>}
          {step === 3 && <>
            <h3>Valores e condições da venda</h3>
            {sellerProfile?.role === 'gestao' && (
              <label className="sale-wide">
                Vendedor responsável
                <select value={selectedSeller} onChange={e => setSelectedSeller(e.target.value)}>
                  <option value="">Eu mesmo(a) — {sellerProfile.full_name}</option>
                  {sellerOptions.map(v => (
                    <option key={v.user_id} value={v.user_id}>{v.full_name}</option>
                  ))}
                </select>
              </label>
            )}
            {sellerProfile?.role === 'vendedor' && (
              <p className="sale-help">Vendedor responsável: {sellerProfile.full_name} (automático)</p>
            )}
            <div className="sale-grid">
              <label>Valor total (R$) *<input type="number" min="0.01" step="0.01" value={price} onChange={e => setPrice(e.target.value)} /></label>
              <label>Valor adiantado (R$) *<input type="number" min="0" step="0.01" value={advance} onChange={e => setAdvance(e.target.value)} /></label>
              <label>Valor na entrega (R$)<input readOnly value={remaining >= 0 ? money(remaining) : 'Adiantamento maior que o total'} /></label>
              {mode === 'reservation' ? <label>Previsão de entrega *<input type="date" min={localDate()} value={expectedDelivery} onChange={e => setExpectedDelivery(e.target.value)} /></label> : <label>Data da venda / comissão<input type="date" readOnly value={localDate()} /></label>}
              <label className="sale-wide">Valor total por extenso<input readOnly value={amountWords(price)} /></label>
              <label className="sale-wide">Valor adiantado por extenso<input readOnly value={amountWords(advance)} /></label>
              <label className="sale-wide">Valor na entrega por extenso<input readOnly value={remaining >= 0 ? amountWords(remaining) : ''} /></label>
              <label className="sale-wide">Fornecedor<input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Nome do fornecedor" /></label>
              <label>Forma de pagamento<select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}><option value="pix">Pix</option><option value="cartao">Cartão</option><option value="transferencia">Transferência</option><option value="dinheiro">Dinheiro</option><option value="misto">Misto</option></select></label>
              {paymentMethod === 'cartao' && <label>Parcelas *<input type="number" min="1" step="1" value={installments} onChange={e => setInstallments(e.target.value)} /></label>}
              <label className="sale-wide">Observações<textarea rows="3" value={notes} onChange={e => setNotes(e.target.value)} /></label>
            </div>
            <p className="sale-help">Ao confirmar, a venda será registrada e o filhote passará para Vendido. O contrato poderá ser gerado como minuta na página Vendas, após o registro.</p>
          </>}
          {error && <p className="sale-error" role="alert">{error}</p>}
          <footer className="sale-actions">
            <button type="button" className="sale-cancel" onClick={step === 0 ? onClose : () => { setStep(s => s - 1); setError(''); }} disabled={loading}>{step === 0 ? 'Cancelar' : 'Voltar'}</button>
            {step < 3 ? <button type="button" className="sale-submit" onClick={next} disabled={loading}>Continuar</button> : <button type="submit" className="sale-submit" disabled={loading || sellerLoading || !sellerProfile}>{loading ? 'Registrando...' : mode === 'reservation' ? 'Confirmar reserva' : 'Confirmar venda'}</button>}
          </footer>
        </form>
      </section>
    </div>
  );
}

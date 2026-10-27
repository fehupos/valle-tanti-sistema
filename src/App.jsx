import { useEffect, useMemo, useRef, useState } from 'react';
import Cropper from 'cropperjs';
import 'cropperjs/dist/cropper.css';
import { supabase } from './supabase';
import './App.css';
import Login from './Login';
import SaleModal from './SaleModal';
import SalesPage from './SalesPage';

const LOGO = 'https://lhinolmdpaonyuxbgzbw.supabase.co/storage/v1/object/public/puppy-photos/site/2.svg';
const BUCKET = 'puppy-photos';
const PAGE_SIZE = 8;
const initialForm = { name:'', gender:'macho', coat:'curto', coat_color:'', price:'', status:'disponivel', pedigree:false, birth_date:'', description:'', image:'' };
const statuses = { disponivel:'Disponível', reservado:'Reservado', vendido:'Vendido' };
const labels = { macho:'Macho', femea:'Fêmea', curto:'Curto', longo:'Longo' };
const pretty = (value) => labels[value] || statuses[value] || value || 'Não informado';
const priceText = (value) => value === null || value === undefined || value === '' ? 'Preço não informado' : Number(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

export default function App() {
  const [puppyToSell, setPuppyToSell] = useState(null);
  const [operationMode, setOperationMode] = useState('sale');
  const [activePage, setActivePage] = useState('puppies');
  const [authUser, setAuthUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const isManagement = userProfile?.role === 'gestao';
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [puppies,setPuppies] = useState([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [filters,setFilters] = useState({status:'',gender:'',coat:'',coat_color:''});
  const [search,setSearch] = useState('');
  const [page,setPage] = useState(1);
  const [open,setOpen] = useState(false);
  const [editing,setEditing] = useState(null);
  const [form,setForm] = useState(initialForm);
  const [saving,setSaving] = useState(false);
  const [photo,setPhoto] = useState(null);
  const [preview,setPreview] = useState('');
  const [photoError,setPhotoError] = useState('');
  const imageRef = useRef(null);
  const cropperRef = useRef(null);

useEffect(() => {
  let active = true;

  async function checkAuthentication() {
    const { data: { user }, error: authError } =
      await supabase.auth.getUser();

    if (!active) return;

    if (!authError && user) {
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('user_id, full_name, role, active')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!active) return;
      if (!profileError && profile?.active && ['gestao', 'vendedor'].includes(profile.role)) {
        setUserProfile(profile);
        setAuthUser(user);
      } else {
        await supabase.auth.signOut();
        if (active) { setAuthUser(null); setUserProfile(null); }
      }
    } else {
      setAuthUser(null);
      setUserProfile(null);
    }

    if (active) setCheckingAuth(false);
  }

  checkAuthentication();

  return () => {
    active = false;
  };
}, []);

async function handleLogout() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    setError(error.message);
    return;
  }

  setAuthUser(null);
  setUserProfile(null);
  setActivePage('puppies');
}

  async function loadPuppies() {
    setLoading(true);
    const {data,error:queryError} = await supabase.from('puppies').select('*').order('created_at',{ascending:false});
    if(queryError) setError(queryError.message);
    else {setPuppies(data || []);setError('');}
    setLoading(false);
  }
  useEffect(()=>{loadPuppies();},[]);
  useEffect(()=>{setPage(1);},[filters,search,activePage]);
  useEffect(()=>()=>{cropperRef.current?.destroy();if(preview)URL.revokeObjectURL(preview);},[preview]);

  const colors = useMemo(()=>[...new Set(puppies.filter(p => activePage === 'history' ? p.status === 'vendido' : p.status !== 'vendido').map(p=>(p.coat_color||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR')),[puppies,activePage]);
  const filtered = useMemo(()=>puppies.filter(p=>{
    if(activePage === 'history' ? p.status !== 'vendido' : p.status === 'vendido')return false;
    if(filters.status && p.status !== filters.status)return false;
    if(filters.gender && p.gender !== filters.gender)return false;
    if(filters.coat && p.coat !== filters.coat)return false;
    if(filters.coat_color && (p.coat_color||'') !== filters.coat_color)return false;
    const q=search.trim().toLocaleLowerCase('pt-BR');
    return !q || [p.name,p.coat_color,p.status].some(v=>(v||'').toLocaleLowerCase('pt-BR').includes(q));
  }),[puppies,filters,search,activePage]);
  const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  const visible=filtered.slice((Math.min(page,pages)-1)*PAGE_SIZE,Math.min(page,pages)*PAGE_SIZE);
  const setField=(key,value)=>setForm(f=>({...f,[key]:value}));
  function closeModal(){setOpen(false);setPhoto(null);setPreview('');setPhotoError('');cropperRef.current?.destroy();cropperRef.current=null;}
  function showModal(p=null){
    setEditing(p);setForm(p?{
      name:p.name||'',gender:p.gender||'macho',coat:p.coat||'curto',coat_color:p.coat_color||'',
      price:p.price??'',status:p.status||'disponivel',pedigree:!!p.pedigree,
      birth_date:p.birth_date||'',description:p.description||'',image:p.image||''
    }:{...initialForm});
    setPhoto(null);setPreview('');setPhotoError('');setNotice('');setOpen(true);
  }
  function choosePhoto(event){
    const file=event.target.files?.[0];if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){setPhotoError('Selecione uma imagem JPEG, PNG ou WebP.');event.target.value='';return;}
    if(file.size>5*1024*1024){setPhotoError('A imagem deve ter no máximo 5 MB.');event.target.value='';return;}
    cropperRef.current?.destroy();cropperRef.current=null;
    setPhoto(file);setPhotoError('');setPreview(URL.createObjectURL(file));
  }
  function imageLoaded(){
    if(!imageRef.current || !photo)return;
    cropperRef.current?.destroy();
    cropperRef.current=new Cropper(imageRef.current,{aspectRatio:4/3,viewMode:1,dragMode:'move',autoCropArea:.9,responsive:true});
  }
  function croppedBlob(){
    return new Promise((resolve,reject)=>{
      const canvas=cropperRef.current?.getCroppedCanvas({maxWidth:1200,maxHeight:900,imageSmoothingQuality:'high'});
      if(!canvas){reject(new Error('Aguarde o carregamento da foto para recortar.'));return;}
      canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Não foi possível gerar o recorte.')),'image/jpeg',.9);
    });
  }
  async function save(event){
    event.preventDefault();
    if (!isManagement) { setError('Somente a Gestão pode cadastrar ou editar filhotes.'); return; }
    setSaving(true);setError('');setNotice('');
    let uploadedPath='';
    try {
      const {data:{user},error:authError}=await supabase.auth.getUser();
      if(authError || !user)throw new Error('Entre com uma conta administrativa antes de cadastrar ou editar filhotes. Precisamos configurar o login neste sistema.');
      const payload={...form,name:form.name.trim(),coat_color:form.coat_color.trim()||null,description:form.description.trim()||null,
        birth_date:form.birth_date||null,price:form.price===''?null:Number(form.price),image:form.image||null};
      if(photo){
        const blob=await croppedBlob();
        uploadedPath=`puppies/${crypto.randomUUID()}.jpg`;
        const {error:uploadError}=await supabase.storage.from(BUCKET).upload(uploadedPath,blob,{contentType:'image/jpeg',upsert:false});
        if(uploadError)throw uploadError;
        payload.image=supabase.storage.from(BUCKET).getPublicUrl(uploadedPath).data.publicUrl;
      }
      const query=editing?supabase.from('puppies').update(payload).eq('id',editing.id):supabase.from('puppies').insert(payload);
      const {error:saveError}=await query;
      if(saveError)throw saveError;
      closeModal();await loadPuppies();setNotice(editing?'Filhote atualizado com sucesso.':'Filhote cadastrado com sucesso.');
    }catch(err){
      if(uploadedPath)await supabase.storage.from(BUCKET).remove([uploadedPath]);
      setError(err.message||'Não foi possível salvar o filhote.');
    }finally{setSaving(false);}
  }
  
  if (checkingAuth) {
    return (
      <div className="login-page">
        <p>Verificando acesso ao sistema...</p>
      </div>
    );
  }

  if (!authUser) {
    return <Login onLogin={async (user) => {
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('user_id, full_name, role, active')
        .eq('user_id', user.id)
        .maybeSingle();
      if (profileError || !profile?.active || !['gestao', 'vendedor'].includes(profile.role)) {
        await supabase.auth.signOut();
        setAuthUser(null);
        setUserProfile(null);
        return;
      }
      setUserProfile(profile);
      setAuthUser(user);
    }} />;
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="sidebar-brand"><img src={LOGO} alt="Valle Tanti Auguri"/><p>Sistema administrativo</p></div>
      <nav>
      <button
  type="button"
  className={activePage === 'puppies' ? 'nav-active' : 'nav-disabled'}
  onClick={() => setActivePage('puppies')}
>
  <svg
    width="19"
    height="19"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <ellipse cx="12" cy="17" rx="5" ry="3.5" />
    <ellipse cx="5.5" cy="10" rx="1.5" ry="2" />
    <ellipse cx="9.5" cy="6.5" rx="1.5" ry="2" />
    <ellipse cx="14.5" cy="6.5" rx="1.5" ry="2" />
    <ellipse cx="18.5" cy="10" rx="1.5" ry="2" />
  </svg>
  <span>Filhotes</span>
</button>

<button
  type="button"
  className={activePage === 'sales' ? 'nav-active' : 'nav-disabled'}
  onClick={() => setActivePage('sales')}
>
          <svg
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M8 3h8l3 3v15H5V3h3Z" />
            <path d="M8 10h8M8 14h8M8 18h5" />
            <path d="M16 3v4h3" />
          </svg>
          <span>Vendas</span>
        </button>
        <button
          type="button"
          className={activePage === 'history' ? 'nav-active' : 'nav-disabled'}
          onClick={() => {
            setActivePage('history');
            setFilters({
              status: '',
              gender: '',
              coat: '',
              coat_color: ''
            });
            setSearch('');
          }}
        >
          <svg
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
            <path d="M3 12h3" />
          </svg>

          <span>Histórico de Filhotes</span>
        </button>
        <div className="nav-disabled">Clientes (em breve)</div>
        <div className="nav-disabled">Relatórios (em breve)</div>
      </nav>
      <div className="sidebar-footer">
        <div className="sidebar-user" aria-label="Usuário conectado">
          <div className="sidebar-avatar" aria-hidden="true">{(userProfile?.full_name || authUser?.email || 'U').trim().charAt(0).toUpperCase()}</div>
          <div className="sidebar-user-details"><strong title={userProfile?.full_name || authUser?.email}>{userProfile?.full_name || authUser?.email || 'Usuário'}</strong><span>{isManagement ? 'Gestão' : 'Vendedor'}</span></div>
        </div>
      <button
        type="button"
        className="logout-button"
        onClick={handleLogout}
      >
        Sair do sistema
      </button>
      </div>
    </aside>
    {activePage === 'sales' ? (
      <main className="content">
        <SalesPage />
      </main>
    ) : <main className="content">
      <header className="page-header"><div><h1>{activePage === 'history' ? 'Histórico de Filhotes' : 'Filhotes'}</h1><p>{activePage === 'history' ? 'Consulte os filhotes vendidos pelo canil.' : (isManagement ? 'Gerencie os filhotes cadastrados no canil.' : 'Consulte os filhotes e registre vendas.')}</p></div>{isManagement && activePage !== 'history' && <button className="primary-button" onClick={()=>showModal()}>+ Novo filhote</button>}</header>
      {error && <div className="alert error" role="alert">{error}</div>}
      {notice && <div className="alert success">{notice}</div>}
      <div className="stats"><div className="stat-card"><span>{activePage === 'history' ? 'Total vendidos' : 'Filhotes ativos'}</span><strong>{puppies.filter(p => activePage === 'history' ? p.status === 'vendido' : p.status !== 'vendido').length}</strong></div><div className="stat-card"><span>{activePage === 'history' ? 'No resultado' : 'Disponíveis'}</span><strong>{activePage === 'history' ? filtered.length : puppies.filter(p=>p.status==='disponivel').length}</strong></div></div>
      <section className="panel">
        <input className="search-input" aria-label="Buscar filhotes" placeholder="Buscar por nome, cor ou status..." value={search} onChange={e=>setSearch(e.target.value)}/>
        <div className="filters">
          {activePage !== 'history' && <label>Status<select value={filters.status} onChange={e=>setFilters(f=>({...f,status:e.target.value}))}><option value="">Todos os status</option><option value="disponivel">Disponível</option><option value="reservado">Reservado</option></select></label>}
          <label>Sexo<select value={filters.gender} onChange={e=>setFilters(f=>({...f,gender:e.target.value}))}><option value="">Todos os sexos</option><option value="macho">Macho</option><option value="femea">Fêmea</option></select></label>
          <label>Pelagem<select value={filters.coat} onChange={e=>setFilters(f=>({...f,coat:e.target.value}))}><option value="">Todas as pelagens</option><option value="curto">Pelo curto</option><option value="longo">Pelo longo</option></select></label>
          <label>Cor<select value={filters.coat_color} onChange={e=>setFilters(f=>({...f,coat_color:e.target.value}))}><option value="">Todas as cores</option>{colors.map(c=><option key={c} value={c}>{c}</option>)}</select></label>
        </div>
        <div className="list-summary">{filtered.length} filhote(s) encontrado(s)</div>
        {loading?<p>Carregando filhotes...</p>:visible.length===0?<p>Nenhum filhote encontrado.</p>:<div className="puppy-grid">{visible.map(p=><article className="puppy-card" key={p.id}>
          {p.image?<img src={p.image} alt={p.name||'Filhote'} loading="lazy"/>:<div className="image-placeholder">🐶</div>}
          <div className="puppy-info"><h3>{p.name||'Sem nome'}</h3><span className={`status status-${p.status||'unknown'}`}>{pretty(p.status)}</span><p>{pretty(p.gender)} · Pelo {pretty(p.coat).toLowerCase()}</p><p>{p.coat_color||'Cor não informada'}</p><strong>{priceText(p.price)}</strong>{isManagement && activePage !== 'history' && <button type="button" className="edit-button" onClick={()=>showModal(p)}>Editar filhote</button>}</div>

          {activePage !== 'history' && p.status === 'disponivel' && (
            <div style={{display:'flex',gap:8,padding:10}}>
              <button type="button" className="sell-puppy-button" onClick={() => {setOperationMode('sale');setPuppyToSell(p);}}>Vender</button>
              <button type="button" className="sell-puppy-button" onClick={() => {setOperationMode('reservation');setPuppyToSell(p);}}>Reservar</button>
            </div>
          )}
          {activePage !== 'history' && p.status === 'reservado' && <p style={{padding:'0 12px'}}>Reserva ativa — confirmar entrega na página Vendas.</p>}

        </article>)}</div>}
        {pages>1&&<div className="pagination"><button disabled={page<=1} onClick={()=>setPage(n=>n-1)}>Anterior</button><span>Página {page} de {pages}</span><button disabled={page>=pages} onClick={()=>setPage(n=>n+1)}>Próxima</button></div>}
      </section>
    </main>}
    {isManagement && open&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)closeModal();}}><div className="modal" role="dialog" aria-modal="true" aria-label={editing?'Alterar filhote':'Cadastrar novo filhote'}>
      <div className="modal-heading"><h2>{editing?'Alterar Filhote':'Cadastrar Novo Filhote'}</h2><button type="button" onClick={closeModal} disabled={saving} aria-label="Fechar">✕</button></div>
      <form onSubmit={save} className="dog-form">
        <div className="form-grid">
          <label>Nome *<input required value={form.name} onChange={e=>setField('name',e.target.value)} placeholder="Ex: Bella, Thor"/></label>
          <label>Sexo *<select required value={form.gender} onChange={e=>setField('gender',e.target.value)}><option value="macho">Macho</option><option value="femea">Fêmea</option></select></label>
          <label>Tipo de pelo *<select required value={form.coat} onChange={e=>setField('coat',e.target.value)}><option value="curto">Curto</option><option value="longo">Longo</option></select></label>
          <label>Preço (R$)<input type="number" min="0" step="0.01" value={form.price} onChange={e=>setField('price',e.target.value)} placeholder="Ex: 3500.00"/></label>
          <label>Cor da pelagem<input value={form.coat_color} onChange={e=>setField('coat_color',e.target.value)} placeholder="Ex: Creme, Chocolate e Tan"/></label>
          <label>Pedigree<select value={form.pedigree?'sim':'nao'} onChange={e=>setField('pedigree',e.target.value==='sim')}><option value="nao">Não</option><option value="sim">Sim</option></select></label>
          <label>Status *<select required value={form.status} onChange={e=>setField('status',e.target.value)}><option value="disponivel">Disponível para entrega</option><option value="reservado">Reservado</option><option value="vendido">Vendido</option></select></label>
          <label>Data de nascimento<input type="date" value={form.birth_date} onChange={e=>setField('birth_date',e.target.value)}/></label>
        </div>
        <label className="photo-label">Foto do filhote<input type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto}/><small>JPEG, PNG ou WebP. Máximo de 5 MB. Recorte em 4:3.</small></label>
        {photoError&&<div className="alert error">{photoError}</div>}
        {preview&&<div className="crop-area"><div className="crop-stage"><img ref={imageRef} src={preview} onLoad={imageLoaded} alt="Ajuste o recorte da foto"/></div><div className="crop-controls"><span>Arraste a foto para posicionar e ajuste o zoom.</span><div><button type="button" onClick={()=>cropperRef.current?.zoom(-.1)}>−</button><button type="button" onClick={()=>cropperRef.current?.zoom(.1)}>+</button><button type="button" onClick={()=>{setPhoto(null);setPreview('');}}>Cancelar foto</button></div></div></div>}
        {!preview&&form.image&&<div className="current-photo"><img src={form.image} alt="Foto atual"/><span>Foto atual do filhote</span></div>}
        <label>Descrição<textarea rows="3" value={form.description} onChange={e=>setField('description',e.target.value)} placeholder="Informações adicionais sobre o filhote"/></label>
        <div className="form-actions"><button type="button" className="secondary-button" disabled={saving} onClick={closeModal}>Cancelar</button><button className="primary-button" disabled={saving} type="submit">{saving?'Salvando...':'Salvar filhote'}</button></div>
      </form>

    </div></div>}

    {puppyToSell && (
      <SaleModal
        puppy={puppyToSell}
        mode={operationMode}
        onClose={() => setPuppyToSell(null)}
        onSold={() => { loadPuppies(); }}
  />
)}
</div>;

  
}

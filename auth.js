(() => {
  const cfg = window.NXTGEN_CONFIG || {};
  const setup = document.getElementById('setupScreen');
  const app = document.getElementById('appRoot');
  const authForm = document.getElementById('authForm');
  const orgForm = document.getElementById('orgForm');
  const toggle = document.getElementById('authToggle');
  const title = document.getElementById('authTitle');
  const subtitle = document.getElementById('authSubtitle');
  const message = document.getElementById('authMessage');
  if (!cfg.supabaseUrl || !cfg.supabasePublishableKey || !window.supabase) {
    setup.classList.remove('hidden');
    return;
  }
  const db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  window.NXTGEN_DB = db;
  let registerMode = false;
  const showAuth = () => {
    setup.classList.remove('hidden'); app.classList.add('hidden'); authForm.classList.remove('hidden'); orgForm.classList.add('hidden'); toggle.classList.remove('hidden');
    title.textContent = registerMode ? 'NXTGEN Account erstellen' : 'Bei NXTGEN anmelden';
    subtitle.textContent = registerMode ? 'Erstelle deinen internen Administratorzugang.' : 'Melde dich in deinem Company OS an.';
  };
  const showApp = () => { setup.classList.add('hidden'); app.classList.remove('hidden'); window.dispatchEvent(new CustomEvent('nxtgen:ready')); };
  const checkOrg = async () => {
    const { data, error } = await db.rpc('my_organizations');
    if (error || !data?.length) {
      authForm.classList.add('hidden'); toggle.classList.add('hidden'); orgForm.classList.remove('hidden');
      title.textContent='Interne Organisation anlegen'; subtitle.textContent='Lege NXTGEN als zentrale Betreiberorganisation an.'; return;
    }
    window.NXTGEN_ORG_ID = data[0].organization_id; showApp();
  };
  toggle.onclick=()=>{registerMode=!registerMode;showAuth();toggle.textContent=registerMode?'Bereits registriert? Anmelden':'Noch kein Konto? Registrieren'};
  authForm.onsubmit=async e=>{e.preventDefault();message.textContent='';const email=document.getElementById('authEmail').value.trim();const password=document.getElementById('authPassword').value;const fullName=document.getElementById('authName').value.trim();const result=registerMode?await db.auth.signUp({email,password,options:{data:{full_name:fullName}}}):await db.auth.signInWithPassword({email,password});if(result.error){message.className='auth-message';message.textContent=result.error.message;return;}await checkOrg();};
  orgForm.onsubmit=async e=>{e.preventDefault();message.textContent='';const {data,error}=await db.rpc('create_internal_organization',{p_name:document.getElementById('orgName').value.trim(),p_slug:document.getElementById('orgSlug').value.trim()});if(error){message.className='auth-message';message.textContent=error.message;return;}window.NXTGEN_ORG_ID=data;showApp();};
  db.auth.getSession().then(({data})=>data.session?checkOrg():showAuth());
})();
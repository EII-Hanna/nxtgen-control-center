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
  const appUrl = `${window.location.origin}${window.location.pathname}`;

  const showApp = () => {
    setup.classList.add('hidden');
    app.classList.remove('hidden');
    window.dispatchEvent(new CustomEvent('nxtgen:ready'));
  };

  if (!cfg.supabaseUrl || !cfg.supabasePublishableKey || !window.supabase) {
    window.NXTGEN_DEMO_MODE = true;
    window.NXTGEN_ORG_ID = 'demo-organization';
    const banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:9999;padding:10px 14px;border:1px solid #5d4d1c;border-radius:10px;background:#1d190c;color:#ffd65b;font:700 11px Inter,system-ui;box-shadow:0 12px 30px rgba(0,0,0,.3)';
    banner.textContent = 'DEMO-MODUS · Supabase noch nicht aktiviert';
    document.body.appendChild(banner);
    showApp();
    return;
  }

  const db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
    auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:true }
  });
  window.NXTGEN_DB = db;
  let registerMode = false;

  const setMessage = (text = '', type = '') => {
    message.className = type ? `auth-message ${type}` : 'auth-message';
    message.textContent = text;
  };

  const showAuth = (notice = '') => {
    setup.classList.remove('hidden');
    app.classList.add('hidden');
    authForm.classList.remove('hidden');
    orgForm.classList.add('hidden');
    toggle.classList.remove('hidden');
    title.textContent = registerMode ? 'NXTGEN Account erstellen' : 'Bei NXTGEN anmelden';
    subtitle.textContent = registerMode ? 'Erstelle deinen internen Administratorzugang.' : 'Melde dich in deinem Company OS an.';
    if (notice) setMessage(notice, 'success');
  };

  const showOrgSetup = () => {
    setup.classList.remove('hidden');
    app.classList.add('hidden');
    authForm.classList.add('hidden');
    toggle.classList.add('hidden');
    orgForm.classList.remove('hidden');
    title.textContent = 'Interne Organisation anlegen';
    subtitle.textContent = 'Lege NXTGEN als zentrale Betreiberorganisation an.';
    setMessage('');
  };

  const checkOrg = async () => {
    const { data: sessionData } = await db.auth.getSession();
    if (!sessionData.session) {
      registerMode = false;
      showAuth('Deine E-Mail ist bestätigt. Bitte melde dich jetzt einmal an.');
      return;
    }

    const { data, error } = await db.rpc('my_organizations');
    if (error) {
      if (/jwt|session|not authenticated|nicht angemeldet/i.test(error.message || '')) {
        await db.auth.signOut();
        showAuth('Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.');
        return;
      }
      setMessage(error.message || 'Organisation konnte nicht geprüft werden.', 'error');
      return;
    }
    if (!data?.length) {
      showOrgSetup();
      return;
    }
    window.NXTGEN_ORG_ID = data[0].organization_id;
    showApp();
  };

  toggle.onclick = () => {
    registerMode = !registerMode;
    showAuth();
    toggle.textContent = registerMode ? 'Bereits registriert? Anmelden' : 'Noch kein Konto? Registrieren';
  };

  authForm.onsubmit = async e => {
    e.preventDefault();
    setMessage('');
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const fullName = document.getElementById('authName').value.trim();

    if (registerMode) {
      const { data, error } = await db.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: appUrl
        }
      });
      if (error) {
        setMessage(error.message, 'error');
        return;
      }
      if (!data.session) {
        registerMode = false;
        toggle.textContent = 'Noch kein Konto? Registrieren';
        showAuth('Bestätigungs-E-Mail versendet. Nach der Bestätigung bitte hier anmelden.');
        return;
      }
      await checkOrg();
      return;
    }

    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(error.message, 'error');
      return;
    }
    await checkOrg();
  };

  orgForm.onsubmit = async e => {
    e.preventDefault();
    setMessage('');
    const { data: sessionData } = await db.auth.getSession();
    if (!sessionData.session) {
      registerMode = false;
      showAuth('Bitte melde dich zuerst an.');
      return;
    }

    const { data, error } = await db.rpc('create_internal_organization', {
      p_name: document.getElementById('orgName').value.trim(),
      p_slug: document.getElementById('orgSlug').value.trim()
    });
    if (error) {
      setMessage(error.message, 'error');
      return;
    }
    window.NXTGEN_ORG_ID = data;
    showApp();
  };

  db.auth.onAuthStateChange((event, session) => {
    if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
      window.setTimeout(checkOrg, 0);
    }
    if (event === 'SIGNED_OUT') {
      registerMode = false;
      showAuth();
    }
  });

  db.auth.getSession().then(({ data, error }) => {
    if (error) {
      setMessage(error.message, 'error');
      showAuth();
      return;
    }
    data.session ? checkOrg() : showAuth();
  });
})();
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

  const setMessage = (text = '', type = '') => {
    message.textContent = text;
    message.className = type ? `auth-message ${type}` : 'auth-message';
  };

  const showApp = () => {
    setup.classList.add('hidden');
    app.classList.remove('hidden');
    window.dispatchEvent(new CustomEvent('nxtgen:ready'));
  };

  if (!cfg.supabaseUrl || !cfg.supabasePublishableKey || !window.supabase) {
    window.NXTGEN_DEMO_MODE = true;
    window.NXTGEN_ORG_ID = 'demo-organization';
    showApp();
    return;
  }

  const db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  window.NXTGEN_DB = db;
  let registerMode = false;

  const showAuth = () => {
    setup.classList.remove('hidden');
    app.classList.add('hidden');
    authForm.classList.remove('hidden');
    orgForm.classList.add('hidden');
    toggle.classList.remove('hidden');
    title.textContent = registerMode ? 'NXTGEN Account erstellen' : 'Bei NXTGEN anmelden';
    subtitle.textContent = registerMode
      ? 'Registriere deinen Administratorzugang. Nach Bestätigung genügt die normale Anmeldung.'
      : 'Melde dich mit deiner bestätigten E-Mail-Adresse an.';
    toggle.textContent = registerMode ? 'Bereits registriert? Anmelden' : 'Noch kein Konto? Registrieren';
  };

  const bootstrapAndOpen = async () => {
    const { data: sessionData } = await db.auth.getSession();
    if (!sessionData.session) {
      showAuth();
      return;
    }

    setMessage('NXTGEN wird geöffnet …');
    const { data, error } = await db.rpc('ensure_internal_organization');
    if (error) {
      setMessage(error.message || 'Organisation konnte nicht vorbereitet werden.', 'error');
      showAuth();
      return;
    }

    if (!data?.length) {
      setMessage('Organisation konnte nicht geladen werden.', 'error');
      showAuth();
      return;
    }

    window.NXTGEN_ORG_ID = data[0].organization_id;
    showApp();
  };

  toggle.onclick = () => {
    registerMode = !registerMode;
    setMessage('');
    showAuth();
  };

  authForm.onsubmit = async event => {
    event.preventDefault();
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
          emailRedirectTo: window.location.origin + window.location.pathname
        }
      });

      if (error) {
        setMessage(error.message, 'error');
        return;
      }

      if (data.session) {
        await bootstrapAndOpen();
      } else {
        registerMode = false;
        showAuth();
        setMessage('E-Mail bestätigt? Dann jetzt einfach anmelden.', 'success');
      }
      return;
    }

    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(error.message, 'error');
      return;
    }

    await bootstrapAndOpen();
  };

  if (orgForm) orgForm.classList.add('hidden');

  db.auth.onAuthStateChange((_event, session) => {
    if (session) bootstrapAndOpen();
  });

  db.auth.getSession().then(({ data }) => {
    if (data.session) bootstrapAndOpen();
    else showAuth();
  });
})();

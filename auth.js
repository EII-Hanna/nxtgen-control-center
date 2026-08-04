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
  const nameInput = document.getElementById('authName');
  const emailInput = document.getElementById('authEmail');
  const passwordInput = document.getElementById('authPassword');
  const submitButton = authForm?.querySelector('button[type="submit"]');
  const nameLabel = nameInput?.previousElementSibling;

  let registerMode = false;
  let appOpen = false;

  const setMessage = (text = '', type = '') => {
    if (!message) return;
    message.textContent = text;
    message.className = type ? `auth-message ${type}` : 'auth-message';
  };

  const setLoading = (loading, text = '') => {
    if (!submitButton) return;
    submitButton.disabled = loading;
    submitButton.textContent = loading ? text : (registerMode ? 'Account erstellen' : 'NXTGEN öffnen');
  };

  const showApp = () => {
    appOpen = true;
    setup?.classList.add('hidden');
    app?.classList.remove('hidden');
    window.dispatchEvent(new CustomEvent('nxtgen:ready'));
  };

  const showAuth = () => {
    appOpen = false;
    setup?.classList.remove('hidden');
    app?.classList.add('hidden');
    authForm?.classList.remove('hidden');
    orgForm?.classList.add('hidden');
    toggle?.classList.remove('hidden');

    if (nameInput) {
      nameInput.classList.toggle('hidden', !registerMode);
      nameInput.required = registerMode;
    }
    nameLabel?.classList.toggle('hidden', !registerMode);

    if (title) title.textContent = registerMode ? 'NXTGEN Account erstellen' : 'Bei NXTGEN anmelden';
    if (subtitle) subtitle.textContent = registerMode
      ? 'Registriere deinen Administratorzugang.'
      : 'Melde dich mit deinem bestehenden NXTGEN-Administratorzugang an.';
    if (toggle) toggle.textContent = registerMode ? 'Bereits registriert? Anmelden' : 'Noch kein Konto? Registrieren';
    setLoading(false);
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

  const openForSession = async session => {
    if (!session || appOpen) return;
    setMessage('NXTGEN wird geöffnet …');

    const { data, error } = await db.rpc('ensure_internal_organization');
    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.organization_id) throw new Error('Organisation konnte nicht geladen werden.');

    window.NXTGEN_ORG_ID = row.organization_id;
    setMessage('');
    showApp();
  };

  toggle?.addEventListener('click', () => {
    registerMode = !registerMode;
    setMessage('');
    showAuth();
  });

  authForm?.addEventListener('submit', async event => {
    event.preventDefault();
    setMessage('');

    const email = emailInput?.value.trim() || '';
    const password = passwordInput?.value || '';
    const fullName = nameInput?.value.trim() || '';

    try {
      if (!email || !password) throw new Error('E-Mail und Passwort sind erforderlich.');
      setLoading(true, registerMode ? 'Account wird erstellt …' : 'Anmeldung läuft …');

      if (registerMode) {
        if (!fullName) throw new Error('Bitte deinen vollständigen Namen eintragen.');
        const { data, error } = await db.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: window.location.origin + window.location.pathname
          }
        });
        if (error) throw error;
        if (data.session) await openForSession(data.session);
        else {
          registerMode = false;
          showAuth();
          setMessage('Bestätige deine E-Mail und melde dich danach an.', 'success');
        }
        return;
      }

      const { data, error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.session) throw new Error('Supabase hat keine gültige Sitzung zurückgegeben.');
      await openForSession(data.session);
    } catch (error) {
      console.error('NXTGEN auth failed', error);
      setMessage(error.message || 'Anmeldung fehlgeschlagen.', 'error');
      showAuth();
    } finally {
      setLoading(false);
    }
  });

  orgForm?.classList.add('hidden');

  db.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') showAuth();
    if (event === 'SIGNED_IN' && session && !appOpen) {
      setTimeout(() => openForSession(session).catch(error => {
        console.error('NXTGEN session open failed', error);
        setMessage(error.message || 'NXTGEN konnte nicht geöffnet werden.', 'error');
        showAuth();
      }), 0);
    }
  });

  db.auth.getSession().then(({ data, error }) => {
    if (error) {
      setMessage(error.message || 'Sitzung konnte nicht geprüft werden.', 'error');
      showAuth();
      return;
    }
    if (data.session) openForSession(data.session).catch(error => {
      console.error('NXTGEN initial session failed', error);
      setMessage(error.message || 'NXTGEN konnte nicht geöffnet werden.', 'error');
      showAuth();
    });
    else showAuth();
  });
})();

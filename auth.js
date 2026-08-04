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

  let registerMode = false;
  let bootstrapPromise = null;
  let db = null;

  const setMessage = (text = '', type = '') => {
    if (!message) return;
    message.innerHTML = text;
    message.className = type ? `auth-message ${type}` : 'auth-message';
  };

  const withTimeout = (promise, ms, label) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} hat zu lange gedauert.`)), ms))
  ]);

  const showApp = () => {
    setup?.classList.add('hidden');
    app?.classList.remove('hidden');
    window.dispatchEvent(new CustomEvent('nxtgen:ready'));
  };

  const showAuth = () => {
    setup?.classList.remove('hidden');
    app?.classList.add('hidden');
    authForm?.classList.remove('hidden');
    orgForm?.classList.add('hidden');
    toggle?.classList.remove('hidden');
    if (title) title.textContent = registerMode ? 'NXTGEN Account erstellen' : 'Bei NXTGEN anmelden';
    if (subtitle) {
      subtitle.textContent = registerMode
        ? 'Registriere deinen Administratorzugang. Nach Bestätigung genügt die normale Anmeldung.'
        : 'Melde dich mit deiner bestätigten E-Mail-Adresse an.';
    }
    if (toggle) toggle.textContent = registerMode ? 'Bereits registriert? Anmelden' : 'Noch kein Konto? Registrieren';
  };

  const showRecovery = error => {
    setup?.classList.remove('hidden');
    app?.classList.add('hidden');
    authForm?.classList.add('hidden');
    orgForm?.classList.add('hidden');
    toggle?.classList.add('hidden');
    if (title) title.textContent = 'Verbindung konnte nicht abgeschlossen werden';
    if (subtitle) subtitle.textContent = 'Die Sitzung ist vorhanden, aber der Organisationszugriff konnte nicht rechtzeitig geladen werden.';
    setMessage(
      `<div>${String(error?.message || 'Unbekannter Startfehler')}</div>` +
      '<div class="auth-recovery-actions">' +
      '<button type="button" class="auth-primary" id="authRetry">Erneut versuchen</button>' +
      '<button type="button" class="auth-secondary" id="authReset">Abmelden & neu anmelden</button>' +
      '</div>',
      'error'
    );
    document.getElementById('authRetry')?.addEventListener('click', () => {
      bootstrapPromise = null;
      bootstrapAndOpen();
    });
    document.getElementById('authReset')?.addEventListener('click', async () => {
      try { await withTimeout(db.auth.signOut(), 8000, 'Abmeldung'); } catch (_) {}
      bootstrapPromise = null;
      registerMode = false;
      setMessage('');
      showAuth();
    });
  };

  if (!cfg.supabaseUrl || !cfg.supabasePublishableKey || !window.supabase) {
    window.NXTGEN_DEMO_MODE = true;
    window.NXTGEN_ORG_ID = 'demo-organization';
    showApp();
    return;
  }

  db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  window.NXTGEN_DB = db;

  const resolveOrganization = async session => {
    const membershipResult = await withTimeout(
      db.from('organization_members')
        .select('organization_id,role')
        .eq('user_id', session.user.id)
        .limit(1)
        .maybeSingle(),
      10000,
      'Organisationsprüfung'
    );

    if (membershipResult.error) throw membershipResult.error;
    if (membershipResult.data?.organization_id) return membershipResult.data.organization_id;

    const bootstrapResult = await withTimeout(
      db.rpc('ensure_internal_organization'),
      12000,
      'Organisationseinrichtung'
    );

    if (bootstrapResult.error) throw bootstrapResult.error;
    const row = Array.isArray(bootstrapResult.data) ? bootstrapResult.data[0] : bootstrapResult.data;
    if (!row?.organization_id) throw new Error('Organisation konnte nicht geladen werden.');
    return row.organization_id;
  };

  const bootstrapAndOpen = () => {
    if (bootstrapPromise) return bootstrapPromise;

    bootstrapPromise = (async () => {
      try {
        setMessage('NXTGEN wird geöffnet …');
        const sessionResult = await withTimeout(db.auth.getSession(), 8000, 'Sitzungsprüfung');
        if (sessionResult.error) throw sessionResult.error;
        const session = sessionResult.data?.session;
        if (!session) {
          setMessage('');
          showAuth();
          return;
        }

        const organizationId = await resolveOrganization(session);
        window.NXTGEN_ORG_ID = organizationId;
        setMessage('');
        showApp();
      } catch (error) {
        console.error('NXTGEN bootstrap failed', error);
        showRecovery(error);
      } finally {
        bootstrapPromise = null;
      }
    })();

    return bootstrapPromise;
  };

  if (toggle) {
    toggle.onclick = () => {
      registerMode = !registerMode;
      setMessage('');
      showAuth();
    };
  }

  if (authForm) {
    authForm.onsubmit = async event => {
      event.preventDefault();
      setMessage('');

      const email = document.getElementById('authEmail').value.trim();
      const password = document.getElementById('authPassword').value;
      const fullName = document.getElementById('authName').value.trim();

      try {
        if (registerMode) {
          const { data, error } = await withTimeout(db.auth.signUp({
            email,
            password,
            options: {
              data: { full_name: fullName },
              emailRedirectTo: window.location.origin + window.location.pathname
            }
          }), 12000, 'Registrierung');

          if (error) throw error;
          if (data.session) await bootstrapAndOpen();
          else {
            registerMode = false;
            showAuth();
            setMessage('E-Mail bestätigt? Dann jetzt einfach anmelden.', 'success');
          }
          return;
        }

        const { error } = await withTimeout(
          db.auth.signInWithPassword({ email, password }),
          12000,
          'Anmeldung'
        );
        if (error) throw error;
        await bootstrapAndOpen();
      } catch (error) {
        setMessage(error.message || 'Anmeldung fehlgeschlagen.', 'error');
      }
    };
  }

  orgForm?.classList.add('hidden');

  db.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
      setTimeout(() => bootstrapAndOpen(), 0);
    }
    if (event === 'SIGNED_OUT') {
      bootstrapPromise = null;
      showAuth();
    }
  });

  bootstrapAndOpen();
})();

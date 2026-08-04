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
  let bootstrapPromise = null;
  let db = null;
  let opening = false;

  const setMessage = (text = '', type = '') => {
    if (!message) return;
    message.innerHTML = text;
    message.className = type ? `auth-message ${type}` : 'auth-message';
  };

  const withTimeout = (promise, ms, label) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} hat zu lange gedauert.`)), ms))
  ]);

  const setLoading = (loading, text = '') => {
    if (!submitButton) return;
    submitButton.disabled = loading;
    submitButton.textContent = loading ? text : (registerMode ? 'Account erstellen' : 'NXTGEN öffnen');
  };

  const showApp = () => {
    opening = true;
    setup?.classList.add('hidden');
    app?.classList.remove('hidden');
    window.dispatchEvent(new CustomEvent('nxtgen:ready'));
  };

  const ensureRecoveryButton = () => {
    if (!authForm || document.getElementById('authForgot')) return;
    const button = document.createElement('button');
    button.id = 'authForgot';
    button.type = 'button';
    button.className = 'auth-link';
    button.textContent = 'Passwort vergessen?';
    button.addEventListener('click', async () => {
      const email = emailInput?.value.trim();
      if (!email) {
        setMessage('Trage zuerst deine E-Mail-Adresse ein.', 'error');
        emailInput?.focus();
        return;
      }
      button.disabled = true;
      button.textContent = 'Reset-Link wird gesendet …';
      try {
        const { error } = await withTimeout(
          db.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + window.location.pathname
          }),
          12000,
          'Passwort-Reset'
        );
        if (error) throw error;
        setMessage('Reset-Link wurde gesendet. Prüfe auch den Spam-Ordner.', 'success');
      } catch (error) {
        setMessage(error.message || 'Reset-Link konnte nicht gesendet werden.', 'error');
      } finally {
        button.disabled = false;
        button.textContent = 'Passwort vergessen?';
      }
    });
    authForm.appendChild(button);
  };

  const showAuth = () => {
    opening = false;
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
    if (subtitle) {
      subtitle.textContent = registerMode
        ? 'Registriere deinen Administratorzugang. Nach Bestätigung genügt die normale Anmeldung.'
        : 'Melde dich mit deinem bestehenden NXTGEN-Administratorzugang an.';
    }
    if (toggle) toggle.textContent = registerMode ? 'Bereits registriert? Anmelden' : 'Noch kein Konto? Registrieren';

    ensureRecoveryButton();
    document.getElementById('authForgot')?.classList.toggle('hidden', registerMode);
    setLoading(false);
  };

  const showRecovery = error => {
    opening = false;
    setup?.classList.remove('hidden');
    app?.classList.add('hidden');
    authForm?.classList.add('hidden');
    orgForm?.classList.add('hidden');
    toggle?.classList.add('hidden');
    if (title) title.textContent = 'NXTGEN konnte nicht geöffnet werden';
    if (subtitle) subtitle.textContent = 'Die Anmeldung war erfolgreich, aber der Organisationszugriff konnte nicht geladen werden.';
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
    if (opening) return Promise.resolve();
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
          setMessage('Bestätige deine E-Mail und melde dich danach an.', 'success');
        }
        return;
      }

      const { data, error } = await withTimeout(
        db.auth.signInWithPassword({ email, password }),
        12000,
        'Anmeldung'
      );
      if (error) throw error;
      if (!data.session) throw new Error('Supabase hat keine gültige Sitzung zurückgegeben.');
      await bootstrapAndOpen();
    } catch (error) {
      setMessage(error.message || 'Anmeldung fehlgeschlagen.', 'error');
    } finally {
      setLoading(false);
    }
  });

  orgForm?.classList.add('hidden');

  db.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') {
      opening = false;
      bootstrapPromise = null;
      showAuth();
    }
  });

  bootstrapAndOpen();
})();

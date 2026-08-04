(() => {
  const state = { connection: null, runs: [], loading: false, error: null };
  const db = () => window.NXTGEN_DB;
  const org = () => window.NXTGEN_ORG_ID;
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const stamp = value => value ? new Intl.DateTimeFormat('de-DE',{dateStyle:'short',timeStyle:'short'}).format(new Date(value)) : 'Noch nie';
  const timeout = (promise, ms, label) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} reagiert nicht. Bitte erneut versuchen.`)), ms))
  ]);

  function toast(text, type='success') {
    document.querySelector('.automation-toast')?.remove();
    const node = document.createElement('div');
    node.className = `automation-toast ${type}`;
    node.textContent = text;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 3500);
  }

  function webhookUrl() {
    const base = window.NXTGEN_CONFIG?.supabaseUrl || '';
    const token = state.connection?.endpoint_token || '';
    return base && token ? `${base}/functions/v1/lead-intake?token=${token}` : '';
  }

  function ensureView() {
    const main = document.querySelector('.main');
    if (!main) return null;
    let section = document.getElementById('automations');
    if (!section) {
      section = document.createElement('section');
      section.id = 'automations';
      section.className = 'view ui-core-view';
      main.appendChild(section);
    }
    return section;
  }

  function installNavigation() {
    const nav = document.querySelector('.nav');
    if (!nav || nav.querySelector('[data-automation-view]')) return;
    const settings = nav.querySelector('[data-core-view="settings"]');
    const button = document.createElement('button');
    button.dataset.automationView = 'automations';
    button.innerHTML = '⚡ &nbsp;Automationen';
    settings ? nav.insertBefore(button, settings) : nav.appendChild(button);
    button.addEventListener('click', activate);
  }

  function activate() {
    ensureView();
    document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-automation-view]')?.classList.add('active');
    document.querySelectorAll('.ui-core-view').forEach(v => v.classList.toggle('active', v.id === 'automations'));
    const title = document.getElementById('title');
    if (title) title.textContent = 'Automationen';
    render();
    load();
  }

  async function ensureConnection() {
    if (!db() || !org()) throw new Error('Supabase oder Organisation ist noch nicht verfügbar.');
    const result = await timeout(db().rpc('ensure_lead_intake_connection'), 8000, 'Automation-Verbindung');
    if (result.error) throw result.error;
    state.connection = Array.isArray(result.data) ? result.data[0] : result.data;
    if (!state.connection) throw new Error('Lead-Intake-Verbindung wurde nicht angelegt. Migration 018 prüfen.');
  }

  async function loadRuns() {
    const result = await timeout(
      db().from('automation_run_log').select('*').eq('organization_id', org()).order('started_at',{ascending:false}).limit(20),
      8000,
      'Ausführungsprotokoll'
    );
    if (result.error) throw result.error;
    state.runs = result.data || [];
  }

  async function load() {
    if (state.loading) return;
    state.loading = true;
    state.error = null;
    render();
    try {
      await ensureConnection();
      await loadRuns();
    } catch (error) {
      console.error('Automation Hub konnte nicht geladen werden', error);
      state.error = error?.message || String(error);
    } finally {
      state.loading = false;
      render();
    }
  }

  function statusLabel(status) {
    return {processed:'Erfolgreich',duplicate:'Duplikat erkannt',failed:'Fehler',received:'Empfangen'}[status] || status || 'Unbekannt';
  }

  function render() {
    const el = ensureView();
    if (!el) return;
    const connection = state.connection;
    const url = webhookUrl();
    const success = state.runs.filter(r => r.status === 'processed').length;
    const failed = state.runs.filter(r => r.status === 'failed').length;

    el.innerHTML = `<div class="ui-page automation-page">
      <div class="ui-head"><div><span class="eyebrow">WORKFLOW OPERATIONS</span><h2>Automations Hub</h2><p>Formulareingänge, Webhooks und n8n-Workflows werden hier verbunden, getestet und überwacht.</p></div><div class="ui-actions"><button class="ui-btn ghost" id="automationRefresh" ${state.loading?'disabled':''}>${state.loading?'Lädt …':'Aktualisieren'}</button></div></div>

      ${state.error ? `<div class="automation-error"><div><b>Automations Hub noch nicht vollständig verfügbar</b><span>${esc(state.error)}</span></div><button class="ui-btn primary" id="automationRetry">Erneut laden</button></div>` : ''}

      <div class="ui-grid metrics">
        <article class="ui-card ui-metric"><span>Aktive Workflows</span><strong>${connection?.status === 'active' ? 1 : 0}</strong></article>
        <article class="ui-card ui-metric"><span>Erfolgreiche Läufe</span><strong>${success}</strong></article>
        <article class="ui-card ui-metric"><span>Fehler</span><strong>${failed}</strong></article>
        <article class="ui-card ui-metric"><span>Letzter Lauf</span><strong class="automation-date">${stamp(connection?.last_run_at)}</strong></article>
      </div>

      <article class="ui-card automation-workflow-card">
        <div class="automation-workflow-head"><div><span class="automation-icon">↗</span><div><h3>Lead Intake</h3><p>Website-Formular, Landingpage oder n8n überträgt einen Lead direkt in das Sales Cockpit.</p></div></div><span class="automation-status ${connection?.status || 'pending'}">${state.loading?'Wird verbunden':connection?.status === 'active'?'Aktiv':connection?'Pausiert':'Noch nicht aktiviert'}</span></div>
        <div class="automation-flow"><span>Formular</span><i>→</i><span>Webhook</span><i>→</i><span>Duplikatprüfung</span><i>→</i><span>Sales Lead</span><i>→</i><span>Follow-up</span></div>
        <div class="automation-config-grid">
          <div><label>WEBHOOK-URL</label><div class="automation-copy"><input readonly id="leadWebhookUrl" value="${esc(url)}" placeholder="Wird nach Aktivierung erzeugt"><button class="ui-btn ghost" data-copy="#leadWebhookUrl" ${!url?'disabled':''}>Kopieren</button></div></div>
          <div><label>STATUS</label><button class="ui-btn ${connection?.status === 'active'?'ghost':'primary'}" id="toggleLeadWorkflow" ${!connection?'disabled':''}>${connection?.status === 'active'?'Workflow pausieren':'Workflow aktivieren'}</button></div>
        </div>
      </article>

      <div class="automation-layout">
        <article class="ui-card"><h3>Workflow testen</h3><p class="automation-muted">Der Test verwendet denselben Endpunkt wie dein echtes Website-Formular.</p>
          <form id="automationTestForm" class="automation-form">
            <label>Unternehmen<input name="company_name" required placeholder="Muster GmbH"></label>
            <div class="automation-two"><label>Ansprechpartner<input name="contact_name" placeholder="Max Mustermann"></label><label>E-Mail<input name="email" type="email" placeholder="max@muster.de"></label></div>
            <label>Bedarf / Nachricht<textarea name="message" placeholder="Wir möchten unsere Leadbearbeitung automatisieren."></textarea></label>
            <button class="ui-btn primary" type="submit" ${!url?'disabled':''}>Test-Lead senden</button>
          </form>
        </article>
        <article class="ui-card"><h3>Formular & n8n anbinden</h3><pre class="automation-code">POST ${esc(url || 'WEBHOOK_WIRD_NACH_AKTIVIERUNG_ANGEZEIGT')}
Content-Type: application/json

{
  "company_name": "Muster GmbH",
  "contact_name": "Max Mustermann",
  "email": "max@muster.de",
  "message": "Beratungsanfrage",
  "source": "website",
  "submission_id": "form-123"
}</pre></article>
      </div>

      <article class="ui-card"><div class="automation-log-head"><div><h3>Letzte Ausführungen</h3><p>Jeder Eingang bleibt inklusive Duplikaten und Fehlern nachvollziehbar.</p></div></div>
        ${state.loading && !state.runs.length ? '<div class="ui-empty"><h3>Ausführungen werden geladen …</h3></div>' : state.runs.length ? `<div class="ui-list">${state.runs.map(run => `<div class="ui-row"><div><b>Lead Intake</b><small>${stamp(run.started_at)}${run.error_message?` · ${esc(run.error_message)}`:''}</small></div><span>${esc(run.external_reference || 'Webhook')}</span><span class="ui-pill ${run.status === 'failed'?'danger':run.status === 'duplicate'?'warn':''}">${statusLabel(run.status)}</span><button class="ui-btn ghost" data-open-sales>Sales öffnen</button></div>`).join('')}</div>` : '<div class="ui-empty"><h3>Noch keine Läufe</h3><p>Nach der Aktivierung kannst du oben direkt einen Test-Lead senden.</p></div>'}
      </article>
    </div>`;
    bind();
  }

  function bind() {
    document.getElementById('automationRefresh')?.addEventListener('click', load);
    document.getElementById('automationRetry')?.addEventListener('click', load);
    document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
      const input = document.querySelector(button.dataset.copy);
      if (!input?.value) return;
      await navigator.clipboard.writeText(input.value);
      toast('Webhook-URL kopiert.');
    }));
    document.getElementById('toggleLeadWorkflow')?.addEventListener('click', async () => {
      if (!state.connection) return;
      const next = state.connection.status === 'active' ? 'paused' : 'active';
      const result = await timeout(db().from('automation_connections').update({status:next,updated_at:new Date().toISOString()}).eq('id',state.connection.id), 8000, 'Workflow-Status');
      if (result.error) return toast(result.error.message, 'error');
      state.connection.status = next;
      toast(next === 'active' ? 'Workflow aktiviert.' : 'Workflow pausiert.');
      render();
    });
    document.getElementById('automationTestForm')?.addEventListener('submit', async event => {
      event.preventDefault();
      const button = event.submitter;
      const original = button.textContent;
      button.disabled = true;
      button.textContent = 'Workflow läuft …';
      try {
        const payload = Object.fromEntries(new FormData(event.target).entries());
        payload.source = 'website';
        payload.submission_id = `test-${Date.now()}`;
        const response = await timeout(fetch(webhookUrl(), {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}), 12000, 'Lead-Webhook');
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || 'Workflow fehlgeschlagen');
        toast(result.duplicate ? 'Duplikat erkannt — kein zweiter Lead angelegt.' : 'Lead und Follow-up wurden angelegt.');
        event.target.reset();
        await load();
      } catch (error) {
        toast(error.message, 'error');
      } finally {
        button.disabled = false;
        button.textContent = original;
      }
    });
    document.querySelectorAll('[data-open-sales]').forEach(button => button.addEventListener('click', () => document.querySelector('[data-core-view="sales"]')?.click()));
  }

  function boot() {
    installNavigation();
    ensureView();
  }

  window.addEventListener('nxtgen:ready', () => setTimeout(boot, 50));
  setTimeout(boot, 250);
})();

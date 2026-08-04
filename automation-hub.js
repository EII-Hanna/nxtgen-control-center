(() => {
  const state = { connection: null, runs: [] };
  const db = () => window.NXTGEN_DB;
  const org = () => window.NXTGEN_ORG_ID;
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const stamp = value => value ? new Intl.DateTimeFormat('de-DE',{dateStyle:'short',timeStyle:'short'}).format(new Date(value)) : 'Noch nie';

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

  async function ensureConnection() {
    if (!db() || !org()) return;
    const { data, error } = await db().rpc('ensure_lead_intake_connection');
    if (error) throw error;
    state.connection = Array.isArray(data) ? data[0] : data;
  }

  async function loadRuns() {
    if (!db() || !org()) return;
    const { data, error } = await db().from('automation_run_log')
      .select('*').eq('organization_id', org()).order('started_at',{ascending:false}).limit(20);
    if (error) throw error;
    state.runs = data || [];
  }

  async function load() {
    try {
      await ensureConnection();
      await loadRuns();
      render();
    } catch (error) {
      console.error('Automation Hub konnte nicht geladen werden', error);
      const el = document.getElementById('automations');
      if (el) el.innerHTML = `<div class="ui-page"><div class="ui-empty"><h3>Automationen konnten nicht geladen werden</h3><p>${esc(error.message)}</p></div></div>`;
    }
  }

  function installNavigation() {
    const nav = document.querySelector('.nav');
    if (!nav || nav.querySelector('[data-automation-view]')) return;
    const settings = nav.querySelector('[data-core-view="settings"]');
    const button = document.createElement('button');
    button.dataset.automationView = 'automations';
    button.innerHTML = '⚡ &nbsp;Automationen';
    settings ? nav.insertBefore(button, settings.previousElementSibling || settings) : nav.appendChild(button);
    button.addEventListener('click', () => activate());
  }

  function ensureView() {
    const main = document.querySelector('.main');
    if (!main || document.getElementById('automations')) return;
    const section = document.createElement('section');
    section.id = 'automations';
    section.className = 'view ui-core-view';
    main.appendChild(section);
  }

  function activate() {
    document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-automation-view]')?.classList.add('active');
    document.querySelectorAll('.ui-core-view').forEach(v => v.classList.toggle('active', v.id === 'automations'));
    const title = document.getElementById('title');
    if (title) title.textContent = 'Automationen';
    load();
  }

  function statusLabel(status) {
    return {processed:'Erfolgreich',duplicate:'Duplikat erkannt',failed:'Fehler',received:'Empfangen'}[status] || status;
  }

  function render() {
    const el = document.getElementById('automations');
    if (!el) return;
    const connection = state.connection;
    const url = webhookUrl();
    const success = state.runs.filter(r=>r.status==='processed').length;
    const failed = state.runs.filter(r=>r.status==='failed').length;

    el.innerHTML = `<div class="ui-page automation-page">
      <div class="ui-head"><div><span class="eyebrow">WORKFLOW OPERATIONS</span><h2>Automations Hub</h2><p>Echte Trigger, echte Läufe und sichtbare Ergebnisse. Der erste produktive Workflow bringt Formulareingänge direkt ins Sales Cockpit.</p></div><div class="ui-actions"><button class="ui-btn ghost" id="automationRefresh">Aktualisieren</button></div></div>

      <div class="ui-grid metrics">
        <article class="ui-card ui-metric"><span>Aktive Workflows</span><strong>${connection?.status==='active'?1:0}</strong></article>
        <article class="ui-card ui-metric"><span>Erfolgreiche Läufe</span><strong>${success}</strong></article>
        <article class="ui-card ui-metric"><span>Fehler</span><strong>${failed}</strong></article>
        <article class="ui-card ui-metric"><span>Letzter Lauf</span><strong class="automation-date">${stamp(connection?.last_run_at)}</strong></article>
      </div>

      <article class="ui-card automation-workflow-card">
        <div class="automation-workflow-head"><div><span class="automation-icon">↗</span><div><h3>Lead Intake</h3><p>Formular, Landingpage oder n8n sendet einen Datensatz. NXTGEN legt Lead, Aktivität und Follow-up-Aufgabe an.</p></div></div><span class="automation-status ${connection?.status||'error'}">${connection?.status==='active'?'Aktiv':'Pausiert'}</span></div>
        <div class="automation-flow"><span>Formular</span><i>→</i><span>Webhook</span><i>→</i><span>Duplikatprüfung</span><i>→</i><span>Sales Lead</span><i>→</i><span>Follow-up</span></div>
        <div class="automation-config-grid">
          <div><label>WEBHOOK-URL</label><div class="automation-copy"><input readonly id="leadWebhookUrl" value="${esc(url)}"><button class="ui-btn ghost" data-copy="#leadWebhookUrl">Kopieren</button></div></div>
          <div><label>STATUS</label><button class="ui-btn ${connection?.status==='active'?'ghost':'primary'}" id="toggleLeadWorkflow">${connection?.status==='active'?'Workflow pausieren':'Workflow aktivieren'}</button></div>
        </div>
        ${connection?.last_error?`<div class="automation-error"><b>Letzter Fehler</b><span>${esc(connection.last_error)}</span></div>`:''}
      </article>

      <div class="automation-layout">
        <article class="ui-card"><h3>Workflow testen</h3><p class="automation-muted">Dieser Test verwendet denselben Webhook wie ein echtes Website-Formular.</p>
          <form id="automationTestForm" class="automation-form">
            <label>Unternehmen<input name="company_name" required placeholder="Muster GmbH"></label>
            <div class="automation-two"><label>Ansprechpartner<input name="contact_name" placeholder="Max Mustermann"></label><label>E-Mail<input name="email" type="email" placeholder="max@muster.de"></label></div>
            <label>Bedarf / Nachricht<textarea name="message" placeholder="Wir möchten unsere Leadbearbeitung automatisieren."></textarea></label>
            <button class="ui-btn primary" type="submit">Test-Lead senden</button>
          </form>
        </article>
        <article class="ui-card"><h3>Für Formulare & n8n</h3><pre class="automation-code">POST ${esc(url || 'WEBHOOK_URL')}
Content-Type: application/json

{
  "company_name": "Muster GmbH",
  "contact_name": "Max Mustermann",
  "email": "max@muster.de",
  "phone": "+49 ...",
  "message": "Beratungsanfrage",
  "source": "website",
  "submission_id": "form-123"
}</pre></article>
      </div>

      <article class="ui-card"><div class="automation-log-head"><div><h3>Letzte Ausführungen</h3><p>Jeder Eingang bleibt nachvollziehbar — inklusive Duplikaten und Fehlern.</p></div></div>
        ${state.runs.length?`<div class="ui-list">${state.runs.map(run=>`<div class="ui-row"><div><b>Lead Intake</b><small>${stamp(run.started_at)}${run.error_message?` · ${esc(run.error_message)}`:''}</small></div><span>${run.external_reference?esc(run.external_reference):'Webhook'}</span><span class="ui-pill ${run.status==='failed'?'danger':run.status==='duplicate'?'warn':''}">${statusLabel(run.status)}</span><button class="ui-btn ghost" data-open-sales>Sales öffnen</button></div>`).join('')}</div>`:`<div class="ui-empty"><h3>Noch keine Läufe</h3><p>Sende oben einen Test-Lead. Danach erscheint der Lauf hier und der Lead im Sales Cockpit.</p></div>`}
      </article>
    </div>`;

    bind();
  }

  function bind() {
    document.getElementById('automationRefresh')?.addEventListener('click', load);
    document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
      const input = document.querySelector(button.dataset.copy);
      await navigator.clipboard.writeText(input?.value || '');
      toast('Webhook-URL kopiert.');
    }));

    document.getElementById('toggleLeadWorkflow')?.addEventListener('click', async () => {
      const next = state.connection.status === 'active' ? 'paused' : 'active';
      const { error } = await db().from('automation_connections').update({status:next,updated_at:new Date().toISOString()}).eq('id',state.connection.id);
      if (error) return toast(error.message,'error');
      state.connection.status = next;
      toast(next==='active'?'Workflow aktiviert.':'Workflow pausiert.');
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
        payload.source = 'nxtgen-test';
        payload.submission_id = `test-${Date.now()}`;
        const response = await fetch(webhookUrl(), {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || 'Workflow fehlgeschlagen');
        toast(result.duplicate?'Duplikat erkannt — kein zweiter Lead angelegt.':'Lead und Follow-up wurden angelegt.');
        event.target.reset();
        await load();
      } catch (error) {
        toast(error.message,'error');
      } finally {
        button.disabled = false;
        button.textContent = original;
      }
    });

    document.querySelectorAll('[data-open-sales]').forEach(button => button.addEventListener('click', () => {
      document.querySelector('[data-core-view="sales"]')?.click();
    }));
  }

  function boot() {
    installNavigation();
    ensureView();
  }

  window.addEventListener('nxtgen:ready', () => setTimeout(boot, 150));
  if (document.getElementById('appRoot') && !document.getElementById('appRoot').classList.contains('hidden')) setTimeout(boot, 150);
})();

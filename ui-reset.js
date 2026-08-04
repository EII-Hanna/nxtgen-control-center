(() => {
  const stages = [
    { key: 'new', label: 'Neu' },
    { key: 'contacted', label: 'Kontaktiert' },
    { key: 'meeting_booked', label: 'Termin gebucht' },
    { key: 'won', label: 'Gewonnen' }
  ];

  const state = { leads: [], clients: [], projects: [], invoices: [], activeView: 'overview' };
  const db = () => window.NXTGEN_DB;
  const org = () => window.NXTGEN_ORG_ID;
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const money = value => new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(value||0));
  const date = value => value ? new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(value)) : '—';

  const toast = text => {
    document.querySelector('.ui-toast')?.remove();
    const el = document.createElement('div');
    el.className = 'ui-toast';
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  };

  const safeQuery = async (table, select = '*', modify = q => q) => {
    try {
      if (!db() || !org() || window.NXTGEN_DEMO_MODE) return [];
      let query = db().from(table).select(select).eq('organization_id', org());
      query = modify(query);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.warn(`NXTGEN UI reset: ${table} konnte nicht geladen werden`, error);
      return [];
    }
  };

  async function loadData() {
    const [leads, clients, invoices] = await Promise.all([
      safeQuery('leads','*',q=>q.order('created_at',{ascending:false}).limit(100)),
      safeQuery('clients','*',q=>q.order('created_at',{ascending:false}).limit(100)),
      safeQuery('backoffice_invoices','*',q=>q.order('created_at',{ascending:false}).limit(100))
    ]);
    state.leads = leads;
    state.clients = clients;
    state.invoices = invoices;

    try {
      if (!db() || !org() || window.NXTGEN_DEMO_MODE) state.projects = [];
      else {
        const { data, error } = await db().from('projects').select('*,client:clients(company_name,organization_id)').eq('client.organization_id',org()).order('created_at',{ascending:false}).limit(100);
        if (error) throw error;
        state.projects = data || [];
      }
    } catch (error) {
      console.warn('NXTGEN UI reset: projects konnten nicht geladen werden', error);
      state.projects = [];
    }
    renderActive();
  }

  function setNav() {
    const nav = document.querySelector('.nav');
    if (!nav) return;
    nav.innerHTML = `
      <button class="active" data-core-view="overview">⌂ &nbsp;Übersicht</button>
      <button data-core-view="sales">↗ &nbsp;Sales</button>
      <button data-core-view="customers">◎ &nbsp;Kunden</button>
      <button data-core-view="delivery">▦ &nbsp;Delivery</button>
      <button data-core-view="finance">€ &nbsp;Finanzen</button>
      <div style="height:10px"></div>
      <button data-core-view="settings">⚙ &nbsp;Einstellungen</button>`;
    nav.querySelectorAll('button').forEach(button => button.addEventListener('click', () => activate(button.dataset.coreView)));
  }

  function ensureViews() {
    const main = document.querySelector('.main');
    if (!main) return;
    ['overview','sales','customers','delivery','finance','settings'].forEach(id => {
      let section = document.getElementById(id);
      if (!section) {
        section = document.createElement('section');
        section.id = id;
        main.appendChild(section);
      }
      section.className = `view ui-core-view${id==='overview'?' active':''}`;
      section.innerHTML = '<div class="ui-page"><div class="ui-empty"><h3>Wird geladen …</h3></div></div>';
    });
  }

  function activate(view) {
    state.activeView = view;
    document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.coreView===view));
    document.querySelectorAll('.ui-core-view').forEach(v=>v.classList.toggle('active',v.id===view));
    const titles = {overview:'Übersicht',sales:'Sales',customers:'Kunden',delivery:'Delivery',finance:'Finanzen',settings:'Einstellungen'};
    const title = document.getElementById('title'); if (title) title.textContent = titles[view];
    renderActive();
  }

  function renderActive() {
    const renderers = {overview:renderOverview,sales:renderSales,customers:renderCustomers,delivery:renderDelivery,finance:renderFinance,settings:renderSettings};
    renderers[state.activeView]?.();
  }

  function renderOverview() {
    const el = document.getElementById('overview'); if (!el) return;
    const openLeads = state.leads.filter(l=>!['won','lost'].includes(l.stage)).length;
    const blocked = state.projects.filter(p=>String(p.status).includes('block')).length;
    const overdue = state.invoices.filter(i=>i.status!=='paid' && i.due_date && new Date(i.due_date)<new Date());
    const due = state.leads.filter(l=>l.meeting_at && new Date(l.meeting_at)>new Date()).slice(0,5);
    el.innerHTML = `<div class="ui-page">
      <div class="ui-head"><div><span class="eyebrow">OPERATIONS TODAY</span><h2>Was heute Aufmerksamkeit braucht</h2><p>Keine Demos, keine Systemspielerei — nur Sales, Kunden, Delivery und Cashflow.</p></div><div class="ui-actions"><button class="ui-btn primary" data-action="new-client">+ Kunde anlegen</button></div></div>
      <div class="ui-grid metrics">
        <article class="ui-card ui-metric"><span>Offene Leads</span><strong>${openLeads}</strong></article>
        <article class="ui-card ui-metric"><span>Aktive Kunden</span><strong>${state.clients.length}</strong></article>
        <article class="ui-card ui-metric"><span>Aktive Projekte</span><strong>${state.projects.length}</strong></article>
        <article class="ui-card ui-metric"><span>Überfällige Rechnungen</span><strong>${overdue.length}</strong></article>
      </div>
      <div class="ui-layout">
        <article class="ui-card"><h3>Nächste Termine</h3>${due.length?`<div class="ui-list">${due.map(l=>`<div class="ui-row"><div><b>${esc(l.company_name||'Unbekannt')}</b><small>${esc(l.contact_name||l.email||'')}</small></div><span>${date(l.meeting_at)}</span><span class="ui-pill">Termin</span><button class="ui-btn ghost" data-lead="${l.id}">Öffnen</button></div>`).join('')}</div>`:`<div class="ui-empty"><h3>Keine anstehenden Termine</h3><p>Neue Termine erscheinen automatisch aus Sales.</p></div>`}</article>
        <aside class="ui-card"><h3>Entscheidungen</h3><div class="ui-list"><div class="ui-row"><div><b>${blocked} blockierte Projekte</b><small>Delivery prüfen</small></div><span class="ui-pill ${blocked?'danger':''}">${blocked?'Aktion':'Sauber'}</span></div><div class="ui-row"><div><b>${overdue.length} offene Forderungen</b><small>Finanzen prüfen</small></div><span class="ui-pill ${overdue.length?'warn':''}">${overdue.length?'Fällig':'Sauber'}</span></div></div></aside>
      </div></div>`;
    bindCommon(el);
  }

  function normalizeStage(stage) {
    const s = String(stage||'new');
    if (['won'].includes(s)) return 'won';
    if (['meeting_booked','booked','first_call','discovery','appointment'].includes(s)) return 'meeting_booked';
    if (['contacted','response','interest','qualified'].includes(s)) return 'contacted';
    return 'new';
  }

  function renderSales() {
    const el = document.getElementById('sales'); if (!el) return;
    el.innerHTML = `<div class="ui-page"><div class="ui-head"><div><span class="eyebrow">SALES WORKSPACE</span><h2>Pipeline statt leerem Cockpit</h2><p>Lead anklicken, Gespräch öffnen, nächsten Schritt setzen. Fireflies-Auswertung erscheint in der Lead-Akte.</p></div><div class="ui-actions"><button class="ui-btn primary" data-action="new-lead">+ Lead anlegen</button></div></div>
      <div class="ui-pipeline">${stages.map(stage=>{const rows=state.leads.filter(l=>normalizeStage(l.stage)===stage.key);return `<section class="ui-column"><div class="ui-column-head"><b>${stage.label}</b><span class="ui-count">${rows.length}</span></div>${rows.length?rows.map(lead=>`<article class="ui-lead" data-lead="${lead.id}"><h4>${esc(lead.company_name||'Ohne Unternehmen')}</h4><p>${esc(lead.contact_name||lead.email||'Kein Ansprechpartner')}</p><div class="ui-lead-footer"><span>${esc(lead.next_step||'Nächsten Schritt setzen')}</span><span>${date(lead.meeting_at||lead.next_follow_up_at)}</span></div></article>`).join(''):`<div class="ui-empty"><p>Keine Leads</p></div>`}</section>`}).join('')}</div></div>`;
    bindCommon(el);
  }

  function renderCustomers() {
    const el = document.getElementById('customers'); if (!el) return;
    el.innerHTML = `<div class="ui-page"><div class="ui-head"><div><span class="eyebrow">CLIENT ACCOUNTS</span><h2>Kunden</h2><p>Jeder Kunde hat eine Akte. Produkte, Verträge und Delivery gehören dorthin — nicht in eigene Hauptmenüs.</p></div><div class="ui-actions"><button class="ui-btn primary" data-action="new-client">+ Kunde anlegen</button></div></div>
      <article class="ui-card">${state.clients.length?`<div class="ui-list">${state.clients.map(c=>`<div class="ui-row"><div><b>${esc(c.company_name||c.name||'Unbenannter Kunde')}</b><small>${esc(c.industry||c.website||'Kundenkonto')}</small></div><span>${esc(c.status||'active')}</span><span class="ui-pill">Kunde</span><button class="ui-btn ghost" data-client="${c.id}">Akte öffnen</button></div>`).join('')}</div>`:`<div class="ui-empty"><h3>Noch keine Kunden</h3><p>Lege den ersten Kunden an oder wandle einen gewonnenen Deal um.</p><button class="ui-btn primary" data-action="new-client">Kunde anlegen</button></div>`}</article></div>`;
    bindCommon(el);
  }

  function renderDelivery() {
    const el = document.getElementById('delivery'); if (!el) return;
    el.innerHTML = `<div class="ui-page"><div class="ui-head"><div><span class="eyebrow">DELIVERY</span><h2>Aktive Projekte</h2><p>Keine zehn Systeme auf einer Seite. Erst Projekt wählen, dann aktuelle Phase bearbeiten.</p></div></div>
      <article class="ui-card">${state.projects.length?`<div class="ui-list">${state.projects.map(p=>`<div class="ui-row"><div><b>${esc(p.name||p.title||p.client?.company_name||'Projekt')}</b><small>${esc(p.client?.company_name||'Kunde')} · Nächster Meilenstein: ${esc(p.next_milestone||'nicht gesetzt')}</small><div class="ui-project-phase"><span class="ui-phase ${String(p.status).includes('onboard')?'active':''}">Onboarding</span><span class="ui-phase ${String(p.status).includes('kick')?'active':''}">Kick-off</span><span class="ui-phase ${String(p.status).includes('delivery')||String(p.status).includes('active')?'active':''}">Umsetzung</span><span class="ui-phase ${String(p.status).includes('qa')?'active':''}">QA</span><span class="ui-phase ${String(p.status).includes('live')?'active':''}">Go-live</span></div></div><span>${esc(p.status||'active')}</span><span class="ui-pill">${Number(p.progress||0)}%</span><button class="ui-btn ghost" data-project="${p.id}">Workspace öffnen</button></div>`).join('')}</div>`:`<div class="ui-empty"><h3>Noch keine aktiven Projekte</h3><p>Ein bezahlter und freigegebener Kunde wird hier als Delivery-Projekt sichtbar.</p></div>`}</article></div>`;
    bindCommon(el);
  }

  function renderFinance() {
    const el = document.getElementById('finance'); if (!el) return;
    const open = state.invoices.filter(i=>i.status!=='paid');
    const paid = state.invoices.filter(i=>i.status==='paid').reduce((s,i)=>s+Number(i.total_amount||i.amount||0),0);
    el.innerHTML = `<div class="ui-page"><div class="ui-head"><div><span class="eyebrow">FINANCE</span><h2>Verträge, Rechnungen und Zahlungen</h2><p>Cashflow sichtbar, ohne Analytics-Mischmasch.</p></div></div>
      <div class="ui-grid metrics"><article class="ui-card ui-metric"><span>Offene Rechnungen</span><strong>${open.length}</strong></article><article class="ui-card ui-metric"><span>Bezahlter Umsatz</span><strong>${money(paid)}</strong></article><article class="ui-card ui-metric"><span>Überfällig</span><strong>${open.filter(i=>i.due_date&&new Date(i.due_date)<new Date()).length}</strong></article><article class="ui-card ui-metric"><span>Gesamt Rechnungen</span><strong>${state.invoices.length}</strong></article></div>
      <article class="ui-card">${state.invoices.length?`<div class="ui-list">${state.invoices.map(i=>`<div class="ui-row"><div><b>${esc(i.invoice_number||'Rechnung')}</b><small>Fällig ${date(i.due_date)}</small></div><span>${money(i.total_amount||i.amount)}</span><span class="ui-pill ${i.status==='paid'?'':(i.due_date&&new Date(i.due_date)<new Date()?'danger':'warn')}">${esc(i.status||'open')}</span><button class="ui-btn ghost">Öffnen</button></div>`).join('')}</div>`:`<div class="ui-empty"><h3>Noch keine Rechnungen</h3><p>Rechnungen erscheinen nach Vertrag und Finance-Provisionierung.</p></div>`}</article></div>`;
  }

  function renderSettings() {
    const el = document.getElementById('settings'); if (!el) return;
    el.innerHTML = `<div class="ui-page"><div class="ui-head"><div><span class="eyebrow">SYSTEM</span><h2>Einstellungen</h2><p>Technische Themen sind hier gebündelt und verschwinden aus der täglichen Navigation.</p></div></div><div class="ui-settings-grid">
      <article class="ui-card ui-setting-card"><h3>Integrationen</h3><p>Fireflies, Slack, n8n, Google, Microsoft, Stripe und CopeCart.</p><ul><li>Fireflies verbinden</li><li>Zahlungsanbieter</li><li>Kalender und Kommunikation</li></ul></article>
      <article class="ui-card ui-setting-card"><h3>Automationen</h3><p>Ausführungsstatus und technische Schlüssel — nur für Administratoren.</p><ul><li>n8n Workflows</li><li>Webhook-Status</li><li>Fehlerprotokolle</li></ul></article>
      <article class="ui-card ui-setting-card"><h3>Produkte & Lizenzen</h3><p>Zentrale Produktdefinitionen. Kundenspezifische Lizenzen erscheinen in der Kundenakte.</p><ul><li>RecruitingOS</li><li>Recruiting Ads</li><li>Voice AI</li><li>Fulfillment OS</li></ul></article>
      <article class="ui-card ui-setting-card"><h3>Organisation & Benutzer</h3><p>Rollen, Rechte und Organisationsdaten.</p><ul><li>Teammitglieder</li><li>Berechtigungen</li><li>Unternehmensdaten</li></ul></article>
    </div></div>`;
  }

  function bindCommon(root) {
    root.querySelectorAll('[data-action="new-client"]').forEach(b=>b.addEventListener('click',openClientModal));
    root.querySelectorAll('[data-action="new-lead"]').forEach(b=>b.addEventListener('click',openLeadModal));
    root.querySelectorAll('[data-lead]').forEach(b=>b.addEventListener('click',()=>openLeadRecord(b.dataset.lead)));
    root.querySelectorAll('[data-client]').forEach(b=>b.addEventListener('click',()=>openClientRecord(b.dataset.client)));
    root.querySelectorAll('[data-project]').forEach(b=>b.addEventListener('click',()=>openProjectRecord(b.dataset.project)));
  }

  function modal(content) {
    const wrap = document.createElement('div'); wrap.className='ui-modal-backdrop'; wrap.innerHTML=`<div class="ui-modal">${content}</div>`;
    wrap.addEventListener('click',e=>{if(e.target===wrap)wrap.remove()});
    wrap.querySelector('.ui-close')?.addEventListener('click',()=>wrap.remove());
    document.body.appendChild(wrap); return wrap;
  }

  function openClientModal() {
    const m = modal(`<div class="ui-modal-head"><div><span class="eyebrow">NEUER KUNDE</span><h2>Kunde anlegen</h2></div><button class="ui-close">×</button></div><form class="ui-form" id="newClientForm"><label>Unternehmen<input name="company_name" required></label><label>Status<select name="status"><option value="active">Aktiv</option><option value="onboarding">Onboarding</option><option value="prospect">Interessent</option></select></label><label>Website<input name="website"></label><label>Branche<input name="industry"></label><label class="full">Notizen<textarea name="notes"></textarea></label><div class="full ui-note">Produkte, Vertrag und Delivery werden später in der Kundenakte ergänzt.</div><button class="ui-btn primary full" type="submit">Kunde speichern</button></form>`);
    m.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const values=Object.fromEntries(new FormData(e.currentTarget));try{if(!db()||window.NXTGEN_DEMO_MODE)throw new Error('Keine Datenbankverbindung');const {error}=await db().from('clients').insert({...values,organization_id:org()});if(error)throw error;m.remove();toast('Kunde wurde angelegt');await loadData();activate('customers')}catch(err){toast(err.message||'Kunde konnte nicht angelegt werden')}});
  }

  function openLeadModal() {
    const m = modal(`<div class="ui-modal-head"><div><span class="eyebrow">NEUER LEAD</span><h2>Lead anlegen</h2></div><button class="ui-close">×</button></div><form class="ui-form"><label>Unternehmen<input name="company_name" required></label><label>Ansprechpartner<input name="contact_name"></label><label>E-Mail<input type="email" name="email"></label><label>Telefon<input name="phone"></label><label class="full">Nächster Schritt<input name="next_step"></label><button class="ui-btn primary full" type="submit">Lead speichern</button></form>`);
    m.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const values=Object.fromEntries(new FormData(e.currentTarget));try{if(!db()||window.NXTGEN_DEMO_MODE)throw new Error('Keine Datenbankverbindung');const {error}=await db().from('leads').insert({...values,organization_id:org(),stage:'new'});if(error)throw error;m.remove();toast('Lead wurde angelegt');await loadData();activate('sales')}catch(err){toast(err.message||'Lead konnte nicht angelegt werden')}});
  }

  function openLeadRecord(id) {
    const lead=state.leads.find(l=>l.id===id); if(!lead)return;
    modal(`<div class="ui-modal-head"><div><span class="eyebrow">LEAD-AKTE</span><h2>${esc(lead.company_name||'Lead')}</h2><p>${esc(lead.contact_name||lead.email||'')}</p></div><button class="ui-close">×</button></div><div class="ui-tabs"><button class="ui-tab active">Übersicht</button><button class="ui-tab">Aktivitäten</button><button class="ui-tab">Gespräch</button><button class="ui-tab">Commercial</button></div><div class="ui-grid"><article class="ui-card"><h3>Nächster Schritt</h3><p>${esc(lead.next_step||'Noch nicht gesetzt')}</p></article><article class="ui-card"><h3>Fireflies</h3><p>Gespräch wird nach Verbindung automatisch transkribiert, zugeordnet und als KI-Akte zusammengefasst.</p><span class="ui-pill">Integration in Einstellungen</span></article><article class="ui-card"><h3>Commercial Status</h3><p>Angebot und Vertrag laufen im Hintergrund. Sichtbar bleibt nur der Freigabestatus.</p><span class="ui-pill warn">Noch nicht vorbereitet</span></article></div>`);
  }

  function openClientRecord(id) {
    const c=state.clients.find(x=>x.id===id); if(!c)return;
    modal(`<div class="ui-modal-head"><div><span class="eyebrow">KUNDENAKTE</span><h2>${esc(c.company_name||c.name||'Kunde')}</h2></div><button class="ui-close">×</button></div><div class="ui-tabs"><button class="ui-tab active">Übersicht</button><button class="ui-tab">Onboarding</button><button class="ui-tab">Delivery</button><button class="ui-tab">Ergebnisse</button><button class="ui-tab">Dokumente</button><button class="ui-tab">Finanzen</button></div><div class="ui-layout"><article class="ui-card"><h3>Account</h3><p>Status: ${esc(c.status||'active')}</p><p>Website: ${esc(c.website||'—')}</p><p>Branche: ${esc(c.industry||'—')}</p></article><article class="ui-card"><h3>Produkte & Lizenzen</h3><p>Produkte werden kundenspezifisch hier verwaltet.</p><span class="ui-pill">Keine aktiven Produkte geladen</span></article></div>`);
  }

  function openProjectRecord(id) {
    const p=state.projects.find(x=>x.id===id); if(!p)return;
    modal(`<div class="ui-modal-head"><div><span class="eyebrow">PROJEKT-WORKSPACE</span><h2>${esc(p.name||p.title||'Projekt')}</h2><p>${esc(p.client?.company_name||'')}</p></div><button class="ui-close">×</button></div><div class="ui-tabs"><button class="ui-tab active">Onboarding</button><button class="ui-tab">Kick-off</button><button class="ui-tab">Blueprint</button><button class="ui-tab">Umsetzung</button><button class="ui-tab">QA</button><button class="ui-tab">Go-live</button><button class="ui-tab">Ergebnisse</button></div><div class="ui-card"><h3>Aktuelle Phase</h3><p>${esc(p.status||'active')}</p><div class="ui-note">n8n, Slack, Fireflies und Value Story erscheinen künftig nur im passenden Tab — nicht mehr alle gleichzeitig.</div></div>`);
  }

  function init() {
    const shell=document.querySelector('.shell'); if(!shell)return;
    shell.classList.add('ui-reset');
    setNav();
    ensureViews();
    activate('overview');
    loadData();
  }

  window.addEventListener('nxtgen:ready',init,{once:true});
  if (!document.getElementById('appRoot')?.classList.contains('hidden')) init();
})();
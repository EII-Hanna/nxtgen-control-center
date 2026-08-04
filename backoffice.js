(() => {
  const host=document.getElementById('analytics'); if(!host)return;
  const dbReady=()=>Boolean(window.NXTGEN_DB&&window.NXTGEN_ORG_ID&&!window.NXTGEN_DEMO_MODE);
  const esc=v=>{const d=document.createElement('div');d.textContent=v??'';return d.innerHTML};
  const money=v=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(v||0));
  let invoices=[],contracts=[],approvals=[],members=[],timeEntries=[],activeTab='finance';

  function mount(){
    host.classList.remove('empty');
    host.innerHTML=`<section class="bo-shell"><header class="bo-head"><div><p class="eyebrow">NXTGEN BACKOFFICE</p><h2>Finance & People Operations</h2><p>Verträge, Cashflow, Forderungen, Freigaben und Teamkapazität in einem operativen Cockpit.</p></div><button class="btn primary" id="boNewInvoice">+ Rechnung</button></header><nav class="bo-tabs"><button class="active" data-bo-tab="finance">Finance</button><button data-bo-tab="contracts">Verträge</button><button data-bo-tab="approvals">Freigaben</button><button data-bo-tab="people">People Ops</button></nav><div id="boBody" class="bo-loading">Backoffice wird geladen …</div></section>`;
  }

  async function load(){
    if(!dbReady()) return renderMessage('Live-Supabase-Verbindung erforderlich.');
    const db=window.NXTGEN_DB,org=window.NXTGEN_ORG_ID;
    const [i,c,a,m,t]=await Promise.all([
      db.from('backoffice_invoices').select('*,client:clients(company_name),dunning:backoffice_dunning_cases(level,status)').eq('organization_id',org).order('due_date',{ascending:true}),
      db.from('backoffice_contracts').select('*,client:clients(company_name)').eq('organization_id',org).order('created_at',{ascending:false}),
      db.from('backoffice_approvals').select('*').eq('organization_id',org).order('created_at',{ascending:false}),
      db.from('team_members').select('*').eq('organization_id',org).order('display_name'),
      db.from('team_time_entries').select('*').eq('organization_id',org).gte('work_date',new Date(Date.now()-6*86400000).toISOString().slice(0,10))
    ]);
    invoices=i.data||[];contracts=c.data||[];approvals=a.data||[];members=m.data||[];timeEntries=t.data||[];render();
  }

  function renderMessage(text){document.getElementById('boBody').innerHTML=`<div class="bo-message"><h3>Backoffice</h3><p>${esc(text)}</p></div>`}
  const outstanding=i=>Math.max(0,Number(i.total_amount||0)-Number(i.paid_amount||0));
  function render(){
    document.querySelectorAll('[data-bo-tab]').forEach(b=>b.classList.toggle('active',b.dataset.boTab===activeTab));
    const body=document.getElementById('boBody');
    if(activeTab==='finance') body.innerHTML=financeView();
    if(activeTab==='contracts') body.innerHTML=contractsView();
    if(activeTab==='approvals') body.innerHTML=approvalsView();
    if(activeTab==='people') body.innerHTML=peopleView();
    bind();
  }

  function financeView(){
    const open=invoices.filter(i=>['approved','sent','partially_paid','overdue'].includes(i.status));
    const overdue=invoices.filter(i=>i.status==='overdue');
    const openValue=open.reduce((s,i)=>s+outstanding(i),0);
    const overdueValue=overdue.reduce((s,i)=>s+outstanding(i),0);
    const paidMonth=invoices.filter(i=>i.status==='paid'&&i.paid_at&&new Date(i.paid_at).getMonth()===new Date().getMonth()).reduce((s,i)=>s+Number(i.paid_amount||0),0);
    return `<div class="bo-hero"><article><span>FINANCE CONTROL</span><h3>Cashflow im Blick. Forderungen unter Kontrolle.</h3><p>NXTGEN bündelt Rechnungslauf, Zahlungseingänge und Mahnstufen in einer klaren operativen Sicht.</p></article><div class="bo-cash"><small>OFFENE FORDERUNGEN</small><strong>${money(openValue)}</strong><span>${open.length} Rechnungen</span></div></div><div class="bo-kpis"><article><span>Bezahlt diesen Monat</span><strong>${money(paidMonth)}</strong></article><article><span>Überfällig</span><strong>${money(overdueValue)}</strong><small>${overdue.length} Fälle</small></article><article><span>Aktive Verträge</span><strong>${contracts.filter(c=>c.status==='active').length}</strong></article><article><span>Offene Freigaben</span><strong>${approvals.filter(a=>a.status==='pending').length}</strong></article></div><div class="bo-grid"><section class="bo-card bo-wide"><div class="bo-title"><div><small>RECEIVABLES</small><h3>Rechnungen & Zahlungen</h3></div><button id="boRefreshDunning">Mahnstufen aktualisieren</button></div><div class="bo-table">${invoices.length?invoices.map(invoiceRow).join(''):'<p class="bo-muted">Noch keine Rechnungen vorhanden.</p>'}</div></section><aside class="bo-card"><small>COLLECTION PRIORITY</small><h3>Forderungsrisiko</h3>${overdue.slice(0,5).map(i=>`<div class="bo-risk"><div><b>${esc(i.client?.company_name||'Kunde')}</b><span>${esc(i.invoice_number)}</span></div><strong>${money(outstanding(i))}</strong><em>Stufe ${i.dunning?.[0]?.level||1}</em></div>`).join('')||'<p class="bo-muted">Keine überfälligen Forderungen.</p>'}</aside></div>`;
  }

  function invoiceRow(i){return `<article class="bo-row"><div><b>${esc(i.invoice_number)}</b><span>${esc(i.client?.company_name||'Kunde')}</span></div><div><small>FÄLLIG</small><b>${new Date(i.due_date).toLocaleDateString('de-DE')}</b></div><div><small>STATUS</small><span class="bo-status ${i.status}">${esc(i.status)}</span></div><div><small>OFFEN</small><b>${money(outstanding(i))}</b></div><div class="bo-actions">${i.status!=='paid'?`<button data-bo-paid="${i.id}">Bezahlt</button>`:''}</div></article>`}

  function contractsView(){return `<div class="bo-grid"><section class="bo-card bo-wide"><div class="bo-title"><div><small>CONTRACT PORTFOLIO</small><h3>Verträge & Billing</h3></div></div>${contracts.map(c=>`<article class="bo-contract"><div><span class="bo-status ${c.status}">${esc(c.status)}</span><h3>${esc(c.title)}</h3><p>${esc(c.client?.company_name||'Kunde')} · ${esc(c.contract_number)}</p></div><div><small>Recurring</small><strong>${money(c.recurring_fee)}</strong><span>${esc(c.billing_cycle)}</span></div><div><small>Nächste Abrechnung</small><strong>${c.next_billing_date?new Date(c.next_billing_date).toLocaleDateString('de-DE'):'—'}</strong></div></article>`).join('')||'<p class="bo-muted">Noch keine Verträge vorhanden.</p>'}</section><aside class="bo-card"><small>PORTFOLIO</small><h3>Recurring Revenue Basis</h3><div class="bo-big-number">${money(contracts.filter(c=>c.status==='active').reduce((s,c)=>s+Number(c.recurring_fee||0),0))}</div><p class="bo-muted">Monatlich aktiver Vertragswert.</p></aside></div>`}

  function approvalsView(){return `<section class="bo-card"><div class="bo-title"><div><small>CONTROL QUEUE</small><h3>Interne Freigaben</h3></div></div><div class="bo-approval-grid">${approvals.map(a=>`<article class="bo-approval"><div><span>${esc(a.approval_type)}</span><h3>${esc(a.title)}</h3><p>${esc(a.description||'')}</p></div><strong>${a.amount!=null?money(a.amount):'—'}</strong><div class="bo-actions">${a.status==='pending'?`<button data-bo-decision="approved" data-id="${a.id}">Freigeben</button><button data-bo-decision="rejected" data-id="${a.id}">Ablehnen</button>`:`<span class="bo-status ${a.status}">${esc(a.status)}</span>`}</div></article>`).join('')||'<p class="bo-muted">Keine Freigaben vorhanden.</p>'}</div></section>`}

  function peopleView(){
    const hoursByMember=Object.fromEntries(members.map(m=>[m.id,timeEntries.filter(t=>t.team_member_id===m.id).reduce((s,t)=>s+Number(t.hours||0),0)]));
    return `<div class="bo-grid"><section class="bo-card bo-wide"><div class="bo-title"><div><small>PEOPLE OPERATIONS</small><h3>Teamkapazität</h3></div><button id="boAddMember">+ Teammitglied</button></div><div class="bo-team-grid">${members.map(m=>{const h=hoursByMember[m.id]||0,p=Math.min(100,Math.round(h/Number(m.weekly_capacity_hours||40)*100));return `<article class="bo-person"><div class="bo-avatar">${esc(m.display_name.slice(0,2).toUpperCase())}</div><div><h3>${esc(m.display_name)}</h3><p>${esc(m.role_name||'Team')}</p><div class="bo-capacity"><i style="width:${p}%"></i></div><span>${h.toFixed(1)}h / ${Number(m.weekly_capacity_hours||40).toFixed(0)}h</span></div></article>`}).join('')||'<p class="bo-muted">Noch keine Teammitglieder vorhanden.</p>'}</div></section><aside class="bo-card"><small>WEEKLY CAPACITY</small><h3>Auslastung</h3><div class="bo-big-number">${members.length?Math.round(Object.values(hoursByMember).reduce((a,b)=>a+b,0)/members.reduce((s,m)=>s+Number(m.weekly_capacity_hours||40),0)*100):0}%</div><p class="bo-muted">Erfasste Zeit der letzten sieben Tage.</p></aside></div>`}

  function bind(){
    document.querySelectorAll('[data-bo-paid]').forEach(b=>b.onclick=()=>markPaid(b.dataset.boPaid));
    document.querySelectorAll('[data-bo-decision]').forEach(b=>b.onclick=()=>decide(b.dataset.id,b.dataset.boDecision));
    document.getElementById('boRefreshDunning')?.addEventListener('click',refreshDunning);
    document.getElementById('boAddMember')?.addEventListener('click',addMember);
  }
  async function markPaid(id){const {error}=await window.NXTGEN_DB.rpc('mark_backoffice_invoice_paid',{p_invoice_id:id});if(error)return alert(error.message);await load()}
  async function refreshDunning(){const {error}=await window.NXTGEN_DB.rpc('refresh_backoffice_dunning');if(error)return alert(error.message);await load()}
  async function decide(id,decision){const note=prompt(decision==='approved'?'Freigabekommentar':'Ablehnungsgrund')||'';const {error}=await window.NXTGEN_DB.rpc('decide_backoffice_approval',{p_approval_id:id,p_decision:decision,p_note:note});if(error)return alert(error.message);await load()}
  async function addMember(){const name=prompt('Name');if(!name)return;const role=prompt('Rolle')||'';const capacity=Number(prompt('Wochenkapazität in Stunden','40')||40);const {error}=await window.NXTGEN_DB.from('team_members').insert({organization_id:window.NXTGEN_ORG_ID,display_name:name,role_name:role,weekly_capacity_hours:capacity});if(error)return alert(error.message);await load()}
  async function newInvoice(){
    const db=window.NXTGEN_DB,org=window.NXTGEN_ORG_ID;const {data:clients,error}=await db.from('clients').select('id,company_name').eq('organization_id',org).order('company_name');if(error)return alert(error.message);if(!clients?.length)return alert('Noch keine Kunden vorhanden.');
    const pick=Number(prompt(clients.map((c,i)=>`${i+1}: ${c.company_name}`).join('\n')));const client=clients[pick-1];if(!client)return;
    const amount=Number(prompt('Netto-Betrag','1000')||0);const due=new Date(Date.now()+14*86400000).toISOString().slice(0,10);const number=`INV-${new Date().toISOString().replace(/\D/g,'').slice(0,14)}`;
    const {data:invoice,error:ie}=await db.from('backoffice_invoices').insert({organization_id:org,client_id:client.id,invoice_number:number,status:'draft',due_date:due}).select('*').single();if(ie)return alert(ie.message);
    const {error:itemError}=await db.from('backoffice_invoice_items').insert({organization_id:org,invoice_id:invoice.id,title:'NXTGEN Leistung',quantity:1,unit_price:amount,tax_rate:19});if(itemError)return alert(itemError.message);
    await db.rpc('recalculate_backoffice_invoice',{p_invoice_id:invoice.id});await load();
  }

  mount();document.querySelectorAll('[data-bo-tab]').forEach(b=>b.onclick=()=>{activeTab=b.dataset.boTab;render()});document.getElementById('boNewInvoice').onclick=newInvoice;window.addEventListener('nxtgen:ready',load);setTimeout(load,1400);
})();
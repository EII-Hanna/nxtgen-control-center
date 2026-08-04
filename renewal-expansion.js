(() => {
  const host=document.getElementById('delivery'); if(!host)return;
  const esc=v=>{const d=document.createElement('div');d.textContent=v??'';return d.innerHTML};
  const money=v=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(v||0));
  const dbReady=()=>Boolean(window.NXTGEN_DB&&window.NXTGEN_ORG_ID&&!window.NXTGEN_DEMO_MODE);
  let workspaces=[],active=null,story=null,opportunities=[],cycles=[];

  function mount(){
    const shell=document.createElement('section');shell.className='renewal-shell';shell.id='renewalExpansion';
    shell.innerHTML=`<div class="renewal-head"><div><div class="renewal-eyebrow">NXTGEN RETENTION & EXPANSION</div><h3>Value Story in Verlängerung und Wachstum übersetzen.</h3><p>Aus belegten Ergebnissen entsteht ein strukturierter Review, ein vorkonfiguriertes Angebot und nach Abschluss direkt die nächste Delivery-Phase.</p></div><span class="renewal-pill">VALUE LED · HUMAN CLOSED</span></div><div id="renewalBody" class="renewal-empty">Expansion Workflow wird geladen …</div>`;
    host.appendChild(shell);
  }

  async function load(){
    if(!dbReady())return empty('Live-Supabase-Verbindung erforderlich.');
    const {data,error}=await window.NXTGEN_DB.from('client_workspaces').select('*,client:clients(id,company_name,status)').eq('organization_id',window.NXTGEN_ORG_ID).order('updated_at',{ascending:false});
    if(error)return empty(error.message);workspaces=data||[];
    if(!workspaces.length)return empty('Noch keine Kunden-Workspaces vorhanden.');
    active=active?workspaces.find(w=>w.id===active.id)||workspaces[0]:workspaces[0];
    await loadActive();
  }

  async function loadActive(){
    const [s,o,c]=await Promise.all([
      window.NXTGEN_DB.from('client_value_stories').select('*').eq('workspace_id',active.id).order('created_at',{ascending:false}).limit(1).maybeSingle(),
      window.NXTGEN_DB.from('client_opportunities').select('*').eq('workspace_id',active.id).order('confidence',{ascending:false}),
      window.NXTGEN_DB.from('client_expansion_cycles').select('*,offer:commercial_offers(id,offer_number,status,title)').eq('workspace_id',active.id).order('created_at',{ascending:false})
    ]);
    story=s.data||null;opportunities=o.data||[];cycles=c.data||[];render();
  }

  function empty(text){const el=document.getElementById('renewalBody');if(el){el.className='renewal-empty';el.innerHTML=`<h4>Retention & Expansion</h4><p>${esc(text)}</p>`}}

  function render(){
    const body=document.getElementById('renewalBody');body.className='renewal-layout';
    const openOpps=opportunities.filter(o=>!['won','lost','dismissed'].includes(o.status));
    const openValue=openOpps.reduce((s,o)=>s+Number(o.estimated_value||0),0);
    body.innerHTML=`<aside class="renewal-clients"><h4>KUNDEN</h4>${workspaces.map(w=>`<button class="renewal-client ${w.id===active.id?'active':''}" data-renewal-client="${w.id}"><b>${esc(w.client?.company_name||'Kunde')}</b><span>${esc(w.status)} · Health ${w.health_score||0}%</span></button>`).join('')}</aside><main class="renewal-main"><div class="renewal-hero"><section class="renewal-panel"><div class="renewal-eyebrow">${esc(active.client?.company_name||'Kunde')}</div><h2>${story?'Nächste Wachstumsphase vorbereiten':'Noch keine freigegebene Value Story'}</h2><p class="renewal-muted">${story?esc(story.next_chapter||story.outcome_summary||'Ergebnisse und offene Engpässe bilden die Grundlage für den nächsten Schritt.'):'Erzeuge und prüfe zuerst die Value Story. Danach kann NXTGEN daraus Renewal- und Expansion-Vorschläge ableiten.'}</p><div class="renewal-actions">${story?`<button class="primary" data-start-renewal>Renewal Cycle starten</button>`:''}</div></section><section class="renewal-panel renewal-score"><strong>${story?.executive_score||0}</strong><small>Executive Value Score</small></section></div><div class="renewal-kpis"><article class="renewal-kpi"><span>OFFENE CHANCEN</span><strong>${openOpps.length}</strong><small>Renewal & Expansion</small></article><article class="renewal-kpi"><span>POTENZIAL</span><strong>${money(openValue)}</strong><small>geschätzter Wert</small></article><article class="renewal-kpi"><span>AKTIVE CYCLES</span><strong>${cycles.filter(c=>!['won','lost'].includes(c.status)).length}</strong><small>in Bearbeitung</small></article><article class="renewal-kpi"><span>VALUE STORY</span><strong>${story?story.status:'—'}</strong><small>${story?.evidence_strength||0}% Evidenz</small></article></div><div class="renewal-grid"><section class="renewal-card"><div class="renewal-eyebrow">ACTIVE CYCLES</div><h4>Review → Angebot → Abschluss</h4>${cycles.map(cycleCard).join('')||'<p class="renewal-muted">Noch kein Renewal- oder Expansion-Cycle gestartet.</p>'}</section><aside class="renewal-card"><div class="renewal-eyebrow">EXPANSION SIGNALS</div><h4>Der nächste logische Schritt</h4>${openOpps.map(opportunityCard).join('')||'<p class="renewal-muted">Keine qualifizierten Chancen vorhanden.</p>'}</aside></div></main>`;
    body.querySelectorAll('[data-renewal-client]').forEach(b=>b.onclick=async()=>{active=workspaces.find(w=>w.id===b.dataset.renewalClient);await loadActive()});
    body.querySelector('[data-start-renewal]')?.addEventListener('click',()=>startCycle(null));
    body.querySelectorAll('[data-start-opportunity]').forEach(b=>b.onclick=()=>startCycle(b.dataset.startOpportunity));
    body.querySelectorAll('[data-schedule-review]').forEach(b=>b.onclick=()=>scheduleReview(b.dataset.scheduleReview));
    body.querySelectorAll('[data-prepare-offer]').forEach(b=>b.onclick=()=>prepareOffer(b.dataset.prepareOffer));
    body.querySelectorAll('[data-mark-sent]').forEach(b=>b.onclick=()=>setStatus(b.dataset.markSent,'proposal_sent','Angebot versendet'));
    body.querySelectorAll('[data-mark-won]').forEach(b=>b.onclick=()=>winCycle(b.dataset.markWon));
    body.querySelectorAll('[data-mark-lost]').forEach(b=>b.onclick=()=>setStatus(b.dataset.markLost,'lost','Chance verloren'));
  }

  function opportunityCard(o){return `<div class="renewal-opportunity"><b>${esc(o.title)}</b><p>${esc(o.rationale||'')}</p><footer><span>${money(o.estimated_value)} · ${o.confidence}%</span><button data-start-opportunity="${o.id}">Cycle starten</button></footer></div>`}

  function cycleCard(c){
    const agenda=Array.isArray(c.review_agenda)?c.review_agenda:[];
    return `<article class="renewal-cycle"><div class="renewal-cycle-top"><div><span class="renewal-status">${esc(c.cycle_type)} · ${esc(c.status)}</span><h4>${esc(c.title)}</h4></div><strong>${money(c.estimated_contract_value)}</strong></div><p>${esc(c.rationale||'')}</p>${c.review_at?`<div class="renewal-agenda"><div>Review: ${new Date(c.review_at).toLocaleString('de-DE')}</div>${agenda.slice(0,3).map(a=>`<div>${esc(a)}</div>`).join('')}</div>`:''}<div class="renewal-actions">${c.status==='draft'?`<button data-schedule-review="${c.id}">Review planen</button>`:''}${['draft','review_planned','review_held'].includes(c.status)?`<button class="primary" data-prepare-offer="${c.id}">Angebot vorbereiten</button>`:''}${c.status==='proposal_ready'?`<button data-mark-sent="${c.id}">Als versendet markieren</button>`:''}${['proposal_ready','proposal_sent','negotiation'].includes(c.status)?`<button class="primary" data-mark-won="${c.id}">Gewonnen</button><button data-mark-lost="${c.id}">Verloren</button>`:''}${c.offer?`<span class="renewal-status">${esc(c.offer.offer_number)} · ${esc(c.offer.status)}</span>`:''}</div></article>`
  }

  async function startCycle(opportunityId){
    const {error}=await window.NXTGEN_DB.rpc('start_expansion_cycle',{p_workspace_id:active.id,p_opportunity_id:opportunityId||null,p_value_story_id:story?.id||null});
    if(error)return alert(error.message);await loadActive();
  }
  async function scheduleReview(id){
    const raw=prompt('Review-Termin (YYYY-MM-DD HH:MM)','');if(!raw)return;
    const date=new Date(raw.replace(' ','T'));if(Number.isNaN(date.getTime()))return alert('Ungültiger Termin.');
    const {error}=await window.NXTGEN_DB.from('client_expansion_cycles').update({status:'review_planned',review_at:date.toISOString(),next_action:'Kundenreview durchführen',updated_at:new Date().toISOString()}).eq('id',id);
    if(error)return alert(error.message);await window.NXTGEN_DB.from('client_expansion_events').insert({organization_id:window.NXTGEN_ORG_ID,cycle_id:id,event_type:'review_scheduled',message:'Kundenreview geplant.',metadata:{review_at:date.toISOString()}});await loadActive();
  }
  async function prepareOffer(id){
    const setup=Number(prompt('Setup-Gebühr in €','0')||0);const monthly=Number(prompt('Monatliche Gebühr in €','0')||0);const months=Number(prompt('Laufzeit in Monaten','12')||12);
    const {error:u}=await window.NXTGEN_DB.from('client_expansion_cycles').update({proposed_setup_fee:setup,proposed_monthly_fee:monthly,proposed_term_months:months,estimated_contract_value:setup+monthly*months,updated_at:new Date().toISOString()}).eq('id',id);if(u)return alert(u.message);
    const {error}=await window.NXTGEN_DB.rpc('prepare_expansion_offer',{p_cycle_id:id});if(error)return alert(error.message);await loadActive();
  }
  async function setStatus(id,status,message){
    const {error}=await window.NXTGEN_DB.from('client_expansion_cycles').update({status,next_action:status==='proposal_sent'?'Entscheidung und Verhandlung':'Auswertung dokumentieren',updated_at:new Date().toISOString(),lost_at:status==='lost'?new Date().toISOString():null}).eq('id',id);if(error)return alert(error.message);
    await window.NXTGEN_DB.from('client_expansion_events').insert({organization_id:window.NXTGEN_ORG_ID,cycle_id:id,event_type:status==='proposal_sent'?'proposal_sent':status,message});await loadActive();
  }
  async function winCycle(id){
    const {error}=await window.NXTGEN_DB.rpc('win_expansion_cycle',{p_cycle_id:id});if(error)return alert(error.message);window.dispatchEvent(new CustomEvent('nxtgen:delivery-updated'));await loadActive();
  }

  mount();window.addEventListener('nxtgen:ready',load);window.addEventListener('nxtgen:value-updated',load);setTimeout(load,1350);
})();
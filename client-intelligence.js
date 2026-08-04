(() => {
  const host=document.getElementById('delivery'); if(!host)return;
  let workspaces=[],active=null,sections=[],assets=[],recommendations=[],snapshot=null;
  const dbReady=()=>Boolean(window.NXTGEN_DB&&window.NXTGEN_ORG_ID&&!window.NXTGEN_DEMO_MODE);
  const esc=v=>{const d=document.createElement('div');d.textContent=v??'';return d.innerHTML};
  const money=v=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(v||0));
  const phaseLabels={overview:'Overview',sales:'Sales & Discovery',briefing:'Auto-Briefing',onboarding:'Onboarding',kickoff:'Kick-off',roadmap:'Roadmap',weekly:'Weekly Accountability',assistant:'Client AI Assistant',deliverables:'Deliverables',value_story:'Value Story & Expansion'};

  function mount(){
    const existing=host.querySelector('.lifecycle');
    const wrapper=document.createElement('section'); wrapper.className='ci-shell'; wrapper.id='clientIntelligence';
    wrapper.innerHTML=`<div class="ci-head"><div><p class="eyebrow">NXTGEN CLIENT INTELLIGENCE</p><h3>Ein Kunden-Workspace. Voller Kontext. Geführte Entscheidungen.</h3><p>Fireflies, Sales, Onboarding, Roadmap, Delivery und Expansion laufen in einem AI-lesbaren Kundenkontext zusammen.</p></div><span class="ci-badge">AI FIRST · HUMAN APPROVED</span></div><div id="ciBody" class="ci-empty"><div><h3>Kundenkontext wird geladen …</h3><p>Der Workspace wird mit den vorhandenen NXTGEN-Daten verbunden.</p></div></div>`;
    if(existing) existing.prepend(wrapper); else host.prepend(wrapper);
  }

  async function load(){
    if(!dbReady()){renderEmpty('Live-Supabase-Verbindung erforderlich','Der Client Intelligence Workspace arbeitet mit echten Kunden-, Gesprächs- und Delivery-Daten.');return}
    const {data,error}=await window.NXTGEN_DB.from('client_workspaces').select('*,client:clients(id,company_name,status,industry,website,metadata)').eq('organization_id',window.NXTGEN_ORG_ID).order('created_at',{ascending:false});
    if(error){renderEmpty('Workspaces konnten nicht geladen werden',error.message);return}
    workspaces=data||[];
    if(!workspaces.length){renderEmpty('Noch kein Kunden-Workspace vorhanden','Starte zuerst ein Onboarding oder lege im Delivery-Bereich einen Kunden-Workspace an.');return}
    active=active?workspaces.find(w=>w.id===active.id)||workspaces[0]:workspaces[0];
    await loadActive();
  }

  async function loadActive(){
    await window.NXTGEN_DB.rpc('initialize_client_repo',{p_workspace_id:active.id});
    const [s,a,r,ss]=await Promise.all([
      window.NXTGEN_DB.from('client_repo_sections').select('*').eq('workspace_id',active.id).order('section_order'),
      window.NXTGEN_DB.from('client_context_assets').select('*').eq('workspace_id',active.id).order('created_at',{ascending:false}),
      window.NXTGEN_DB.from('client_module_recommendations').select('*').eq('workspace_id',active.id).order('score',{ascending:false}),
      window.NXTGEN_DB.from('client_intelligence_snapshots').select('*').eq('workspace_id',active.id).order('created_at',{ascending:false}).limit(1).maybeSingle()
    ]);
    sections=s.data||[]; assets=a.data||[]; recommendations=r.data||[]; snapshot=ss.data||null;
    if(!recommendations.length) await generateLocalRecommendations();
    render();
  }

  function combinedText(){
    const parts=[active.client?.company_name,active.client?.industry,active.strategic_goal,active.next_milestone];
    assets.forEach(a=>parts.push(a.title,a.content));
    return parts.filter(Boolean).join(' ').toLowerCase();
  }

  function recommendationRules(text){
    const rules=[
      {product_code:'recruiting-os',title:'RecruitingOS',type:'primary',words:['recruiting','personalberater','kandidat','bewerber','vakanz','placement','talentpool'],outcome:'Mehr Placements durch zentrale Kandidaten-, Kunden- und Prozesssteuerung.',setup:5000,monthly:1490},
      {product_code:'recruiting-ads',title:'Recruiting Ads',type:'add_on',words:['bewerbermangel','stellenanzeige','meta ads','fachkräfte','kandidatengewinnung','lead ads'],outcome:'Planbare Kandidatengewinnung über Kampagnen, Funnel und automatisierte Qualifizierung.',setup:3500,monthly:990},
      {product_code:'voice-ai',title:'Voice AI',type:'add_on',words:['telefon','anruf','qualifizierung','erreichbarkeit','rezeption','call volumen','voicebot'],outcome:'Anrufe und Vorqualifizierung automatisieren, ohne zusätzliche Mitarbeiter.',setup:4500,monthly:1290},
      {product_code:'fulfillment-os',title:'Fulfillment OS',type:'primary',words:['onboarding','delivery','projekt','fulfillment','kundenbetreuung','chaos','übergabe','account management'],outcome:'Sales-Handover, Onboarding und Delivery als geführten Prozess standardisieren.',setup:5000,monthly:1490},
      {product_code:'sales-cockpit',title:'Sales Cockpit',type:'primary',words:['crm','pipeline','follow-up','leads','vertrieb','closing','angebot','sales'],outcome:'Keine Leads und Follow-ups verlieren und Umsatzchancen transparent steuern.',setup:4000,monthly:990},
      {product_code:'automation-layer',title:'Automation Layer',type:'add_on',words:['manuell','automatisierung','schnittstelle','n8n','workflow','datenübertragung','api'],outcome:'Manuelle Arbeitsschritte und Medienbrüche über zentrale Workflows reduzieren.',setup:4500,monthly:790},
      {product_code:'knowledge-ai',title:'Knowledge & Client AI',type:'later',words:['wissen','sop','support','fragen','knowledge','assistent','dokumente','notion'],outcome:'Kunden- und Teamwissen rund um die Uhr kontextbezogen verfügbar machen.',setup:3000,monthly:690}
    ];
    return rules.map(rule=>{
      const hits=rule.words.filter(w=>text.includes(w));
      const base=hits.length?Math.min(96,55+hits.length*10):28;
      return {...rule,hits,score:base};
    }).filter(x=>x.score>=45).sort((a,b)=>b.score-a.score).slice(0,5).map((x,i)=>({...x,recommendation_type:i===0?'primary':x.type,suggested_phase:i===0?'quick_win':i<3?'phase_2':'phase_3'}));
  }

  async function generateLocalRecommendations(){
    const text=combinedText(); const generated=recommendationRules(text);
    const detectedPains=[];
    [['manuell','Viele manuelle Abläufe'],['follow-up','Follow-ups gehen verloren'],['chaos','Operative Übergaben sind unklar'],['support','Wiederkehrende Supportlast'],['kandidat','Kandidatenprozess benötigt System'],['daten','Daten sind verteilt']].forEach(([key,label])=>{if(text.includes(key))detectedPains.push(label)});
    const snapPayload={organization_id:window.NXTGEN_ORG_ID,workspace_id:active.id,source_summary:`Aus ${assets.length} Kontext-Assets und dem Kundenprofil erzeugt.`,detected_pains:detectedPains,detected_goals:[active.strategic_goal].filter(Boolean),qualification_score:Math.min(100,45+assets.length*5),confidence:Math.min(95,55+assets.length*4),model_provider:'nxtgen-rules',model_name:'module-matcher-v1'};
    const {data:snap,error:snapError}=await window.NXTGEN_DB.from('client_intelligence_snapshots').insert(snapPayload).select('*').single();
    if(snapError){console.error(snapError);return}
    snapshot=snap;
    if(!generated.length)return;
    const rows=generated.map(x=>({organization_id:window.NXTGEN_ORG_ID,workspace_id:active.id,snapshot_id:snap.id,product_code:x.product_code,recommendation_type:x.recommendation_type,title:x.title,rationale:x.hits.length?`Erkannt aus Kundenkontext: ${x.hits.join(', ')}.`:'Passend zum strategischen Ziel und aktuellen Prozessbild.',pain_match:x.hits,expected_outcome:x.outcome,suggested_phase:x.suggested_phase,score:x.score,suggested_setup_fee:x.setup,suggested_monthly_fee:x.monthly,suggested_term_months:12}));
    const {data,error}=await window.NXTGEN_DB.from('client_module_recommendations').insert(rows).select('*');
    if(!error) recommendations=data||[];
  }

  function renderEmpty(title,text){const body=document.getElementById('ciBody');if(body)body.innerHTML=`<div><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`}

  function render(){
    const body=document.getElementById('ciBody'); body.className='ci-layout';
    const pains=Array.isArray(snapshot?.detected_pains)?snapshot.detected_pains:[];
    const approved=recommendations.filter(r=>r.status==='approved').length;
    const nav=sections.map((s,i)=>`<button class="${i===0?'active':''}" data-ci-section="${s.section_key}"><span>${String(s.section_order).padStart(2,'0')}</span><div><b>${esc(s.title)}</b><small class="${s.human_review_required?'ci-human':'ci-ai'}">${s.human_review_required?'Mensch prüft':'AI unterstützt'}</small></div></button>`).join('');
    body.innerHTML=`<aside class="ci-nav"><div class="ci-nav-title">CLIENT LIFECYCLE</div>${nav}</aside><main class="ci-main"><section class="ci-section-view active" data-view="overview"><div class="ci-overview-grid"><article class="ci-panel"><p class="eyebrow">SINGLE SOURCE OF TRUTH</p><h4>${esc(active.client?.company_name||'Kunde')} Workspace</h4><p class="ci-intro">Alle Sales-, Gesprächs-, Onboarding-, Delivery- und Erfolgsdaten liegen in einem strukturierten Workspace. Die KI liest den freigegebenen Kontext und erzeugt daraus Briefings, Roadmaps und Empfehlungen.</p><div class="ci-context-path">${sections.slice(0,6).map(s=>`<div class="ci-context-row"><b>${String(s.section_order).padStart(2,'0')} · ${esc(s.title)}</b><small class="${s.human_review_required?'ci-human':'ci-ai'}">${s.human_review_required?'Freigabe':'automatisierbar'}</small></div>`).join('')}</div></article><article class="ci-panel"><div class="ci-score-row"><div><p class="eyebrow">CLIENT INTELLIGENCE</p><h4>Kontextqualität</h4></div><strong class="ci-score">${snapshot?.confidence||0}%</strong></div><div class="ci-snapshot">${esc(snapshot?.source_summary||'Noch keine Intelligence-Auswertung vorhanden.')}</div><div class="ci-chip-wrap">${pains.map(p=>`<span class="ci-chip">${esc(p)}</span>`).join('')||'<span class="ci-chip">Kontext wird laufend erweitert</span>'}</div></article></div><div class="ci-panel" style="margin-top:14px"><div class="ci-score-row"><div><p class="eyebrow">AI MODULE MATCHING</p><h4>Empfohlene Lösung statt manueller Produktrecherche</h4></div><span class="ci-chip">${approved} freigegeben</span></div><div class="ci-recommendations">${recommendations.map(recCard).join('')||'<p class="ci-intro">Noch keine Empfehlung erzeugt.</p>'}</div></div></section>${sections.filter(s=>s.section_key!=='overview').map(s=>`<section class="ci-section-view" data-view="${s.section_key}"><article class="ci-panel"><p class="eyebrow">${String(s.section_order).padStart(2,'0')} · CLIENT REPO</p><h3>${esc(s.title)}</h3><p class="ci-intro">${esc(s.description||'')}</p><div class="ci-snapshot">${s.human_review_required?'Die KI bereitet diesen Bereich vor. Ein Mensch prüft, priorisiert und gibt die nächste Aktion frei.':'Dieser Bereich kann aus verbundenen Datenquellen automatisch aktuell gehalten werden.'}</div></article></section>`).join('')}</main><aside class="ci-side"><p class="eyebrow">NEXT BEST ACTION</p><div class="ci-next-action"><span>AI EMPFEHLUNG</span><b>${recommendations.find(r=>r.status==='recommended')?'Top-Modul prüfen und freigeben':'Roadmap aus freigegebenen Modulen starten'}</b><p>${recommendations.find(r=>r.status==='recommended')?'NXTGEN hat den Kundenkontext analysiert. Du bestätigst nur noch Fit, Preis und Reihenfolge.':'Die freigegebenen Empfehlungen wurden in die strategische Roadmap überführt.'}</p></div><h4>Steuerungsprinzip</h4><div class="ci-rule"><b>KI analysiert</b><p>Transkripte, Kontext, Ziele, Prozesse und Signale werden zusammengeführt.</p></div><div class="ci-rule"><b>Mensch entscheidet</b><p>Modul, Preis, Roadmap und Kundenversprechen brauchen Freigabe.</p></div><div class="ci-rule"><b>NXTGEN führt aus</b><p>Angebot, Onboarding, Provisioning, Delivery und Value Story folgen dem bestätigten Plan.</p></div></aside>`;
    body.querySelectorAll('[data-ci-section]').forEach(btn=>btn.onclick=()=>switchSection(btn.dataset.ciSection,btn));
    body.querySelectorAll('[data-approve-rec]').forEach(btn=>btn.onclick=()=>approve(btn.dataset.approveRec));
    body.querySelectorAll('[data-reject-rec]').forEach(btn=>btn.onclick=()=>reject(btn.dataset.rejectRec));
  }

  function recCard(r){
    return `<article class="ci-rec"><div class="ci-rec-top"><div><span class="ci-rec-type">${esc(r.recommendation_type)} · ${esc(r.suggested_phase)}</span><h4>${esc(r.title)}</h4></div><strong class="ci-rec-score">${r.score}</strong></div><p>${esc(r.rationale||'')}</p><p class="ci-rec-outcome">${esc(r.expected_outcome||'')}</p><div class="ci-rec-footer"><span class="ci-price">${money(r.suggested_setup_fee)} Setup · ${money(r.suggested_monthly_fee)}/Monat · ${r.suggested_term_months} Monate</span><div class="ci-rec-actions">${r.status==='recommended'?`<button data-reject-rec="${r.id}">Ablehnen</button><button class="primary" data-approve-rec="${r.id}">Freigeben</button>`:`<span class="ci-chip">${esc(r.status)}</span>`}</div></div></article>`;
  }

  function switchSection(key,btn){document.querySelectorAll('#ciBody [data-ci-section]').forEach(x=>x.classList.remove('active'));document.querySelectorAll('#ciBody .ci-section-view').forEach(x=>x.classList.remove('active'));btn.classList.add('active');document.querySelector(`#ciBody [data-view="${key}"]`)?.classList.add('active')}

  async function approve(id){
    const {data,error}=await window.NXTGEN_DB.rpc('approve_module_recommendation',{p_recommendation_id:id}); if(error)return alert(error.message);
    const rec=recommendations.find(x=>x.id===id); if(rec)Object.assign(rec,data); render(); window.dispatchEvent(new CustomEvent('nxtgen:roadmap-updated'));
  }
  async function reject(id){
    const {error}=await window.NXTGEN_DB.from('client_module_recommendations').update({status:'rejected',updated_at:new Date().toISOString()}).eq('id',id);if(error)return alert(error.message);const rec=recommendations.find(x=>x.id===id);if(rec)rec.status='rejected';render();
  }

  mount();
  window.addEventListener('nxtgen:ready',load);
  window.addEventListener('nxtgen:client-workspace-changed',e=>{active=workspaces.find(w=>w.id===e.detail?.workspaceId)||active;loadActive()});
  setTimeout(load,700);
})();
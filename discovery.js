(() => {
  const sales=document.getElementById('sales');
  if(!sales)return;
  sales.classList.add('sales-ai-mode');

  const esc=value=>{const div=document.createElement('div');div.textContent=value??'';return div.innerHTML};
  const dbReady=()=>Boolean(window.NXTGEN_DB&&window.NXTGEN_ORG_ID&&!window.NXTGEN_DEMO_MODE);
  const fmt=value=>value?new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'—';
  const asArray=value=>Array.isArray(value)?value:[];
  const textOf=value=>typeof value==='string'?value:(value?.title||value?.name||value?.label||'');
  let leads=[];
  let activeLead=null;
  let meeting=null;

  const shell=document.createElement('section');
  shell.className='discovery-shell discovery-ai-shell';
  shell.innerHTML=`
    <div class="discovery-head discovery-ai-head">
      <div><p class="eyebrow">SALES · SCHRITT 2 VON 5</p><h2>Erstgespräch & Lösungsfindung</h2><p>Fireflies transkribiert, strukturiert und qualifiziert das Gespräch. Dein Team prüft nur noch die entscheidenden Erkenntnisse.</p></div>
      <div class="discovery-readiness"><span>DEAL READINESS</span><strong id="dcPageScore">0%</strong></div>
    </div>
    <div class="discovery-ai-grid">
      <section class="discovery-ai-card discovery-lead-card">
        <div class="discovery-card-icon">⌁</div>
        <div><span class="eyebrow">GESPRÄCHSAKTE</span><h3>Alle Erkenntnisse aus dem Erstgespräch.</h3><p>Prozess, Kernproblem, Zielbild, Budget, Entscheider und nächste Schritte werden automatisch aus Fireflies übernommen.</p></div>
        <select id="dcLead"><option value="">Lead auswählen …</option></select>
        <button class="btn primary" id="dcOpen" disabled>Gesprächsakte öffnen</button>
      </section>
      <section class="discovery-ai-card discovery-activity-card">
        <div class="discovery-card-title"><div><span class="eyebrow">LIVE PIPELINE</span><h3>Letzte Aktivitäten</h3></div><span class="ai-live"><i></i> AI ACTIVE</span></div>
        <div id="dcActivities" class="discovery-activities"><p>Noch keinen Lead ausgewählt.</p></div>
      </section>
    </div>
    <div id="dcMessage" class="discovery-message"></div>
    <div id="dcModal" class="discovery-modal" aria-hidden="true">
      <div class="discovery-modal-backdrop" data-close-modal></div>
      <section class="discovery-modal-panel" role="dialog" aria-modal="true" aria-labelledby="dcModalTitle">
        <button class="discovery-modal-close" data-close-modal aria-label="Schließen">×</button>
        <header class="discovery-modal-head">
          <div><p class="eyebrow">GESPRÄCHSINTELLIGENZ</p><h2 id="dcModalTitle">Gesprächsakte</h2><div class="fireflies-pill">✦ Fireflies AI · automatisch transkribiert & ausgewertet</div></div>
          <div class="modal-score"><div><span>QUALIFIZIERUNG</span><b>Deal Readiness</b><small id="dcPhase">Frühe Phase</small></div><strong id="dcScore">0%</strong></div>
        </header>
        <div id="dcModalBody" class="discovery-modal-body"><div class="discovery-modal-loading">Gesprächsdaten werden geladen …</div></div>
        <footer class="discovery-modal-footer"><span>✦ Powered by Fireflies AI</span><div><small id="dcUpdated">Noch nicht aktualisiert</small><a id="dcTranscript" class="btn hidden" target="_blank" rel="noopener">Transkript öffnen</a><button class="btn primary" id="dcApprove">Akte prüfen & fortsetzen</button></div></footer>
      </section>
    </div>`;
  sales.prepend(shell);

  const $=id=>document.getElementById(id);
  const message=(text,type='info')=>{const el=$('dcMessage');el.textContent=text||'';el.dataset.type=type};

  function scoreFor(record){
    const q=record?.qualification_signals||{};
    if(Number.isFinite(Number(q.score)))return Math.max(0,Math.min(100,Number(q.score)));
    let score=0;
    if(asArray(record?.extracted_pain_points).length)score+=20;
    if(asArray(record?.extracted_goals).length)score+=20;
    if(asArray(record?.extracted_next_steps).length)score+=15;
    if(asArray(record?.recommended_modules).length)score+=15;
    if(q.budget||q.budget_range)score+=15;
    if(q.decision_maker||q.authority)score+=15;
    return Math.min(100,score);
  }

  function phaseFor(score){
    if(score>=80)return 'Abschlussreif';
    if(score>=60)return 'Qualifiziert';
    if(score>=35)return 'Vertiefung erforderlich';
    return 'Frühe Phase';
  }

  async function loadLeads(){
    if(dbReady()){
      const {data,error}=await window.NXTGEN_DB.from('leads')
        .select('id,company_name,contact_name,email,stage,estimated_value,updated_at')
        .eq('organization_id',window.NXTGEN_ORG_ID)
        .in('stage',['meeting_booked','meeting_prepared','meeting_completed','need_confirmed','solution_configured','offer_open','negotiation','contract_sent'])
        .order('updated_at',{ascending:false});
      if(error){message(error.message,'error');return}
      leads=data||[];
    }else{
      leads=JSON.parse(localStorage.getItem('nxtgen_demo_leads')||'[]').filter(item=>['meeting_booked','meeting_prepared','meeting_completed','need_confirmed','solution_configured','offer_open','negotiation','contract_sent'].includes(item.stage));
    }
    $('dcLead').innerHTML='<option value="">Lead auswählen …</option>'+leads.map(lead=>`<option value="${lead.id}">${esc(lead.company_name||'Unbenannter Lead')}</option>`).join('');
  }

  async function selectLead(id){
    activeLead=leads.find(item=>String(item.id)===String(id))||null;
    meeting=null;
    $('dcOpen').disabled=!activeLead;
    if(!activeLead){$('dcActivities').innerHTML='<p>Noch keinen Lead ausgewählt.</p>';$('dcPageScore').textContent='0%';return}
    $('dcActivities').innerHTML='<p>Fireflies-Daten werden geladen …</p>';
    if(dbReady()){
      const {data,error}=await window.NXTGEN_DB.from('meeting_intelligence_records')
        .select('id,title,started_at,updated_at,analysis_status,analysis_model,analysis_error,lead_id,transcript_url,summary,auto_briefing,extracted_pain_points,extracted_goals,extracted_objections,extracted_next_steps,recommended_modules,qualification_signals,participants')
        .eq('organization_id',window.NXTGEN_ORG_ID)
        .eq('lead_id',activeLead.id)
        .order('started_at',{ascending:false})
        .limit(1)
        .maybeSingle();
      if(error)message(error.message,'error');
      meeting=data||null;
    }
    renderActivities();
    $('dcPageScore').textContent=`${scoreFor(meeting)}%`;
  }

  function renderActivities(){
    const rows=[];
    rows.push({title:'Erstgespräch',meta:meeting?.started_at?fmt(meeting.started_at):'Termin bzw. Zuordnung offen',done:Boolean(meeting)});
    rows.push({title:'Transkript verarbeitet',meta:meeting?.analysis_status==='completed'||meeting?.analysis_status==='fallback'?fmt(meeting.updated_at||meeting.started_at):'Wartet auf Fireflies',done:Boolean(meeting?.transcript_url)});
    rows.push({title:'KI-Analyse',meta:meeting?.analysis_model||meeting?.analysis_status||'Noch nicht ausgeführt',done:['completed','fallback'].includes(meeting?.analysis_status)});
    rows.push({title:'Hintergrundprozess',meta:activeLead?.stage==='solution_configured'?'Qualifizierung übernommen':'Nach menschlicher Freigabe',done:activeLead?.stage==='solution_configured'});
    $('dcActivities').innerHTML=rows.map(row=>`<div class="discovery-activity"><i class="${row.done?'done':''}">${row.done?'✓':'·'}</i><div><b>${esc(row.title)}</b><small>${esc(row.meta)}</small></div></div>`).join('');
  }

  function chips(values){
    const list=asArray(values).map(textOf).filter(Boolean);
    return list.length?`<div class="modal-chips">${list.slice(0,5).map(value=>`<span>${esc(value)}</span>`).join('')}</div>`:'<p class="modal-empty">Noch keine Daten erkannt.</p>';
  }

  function getSummary(){
    if(typeof meeting?.summary==='string')return meeting.summary;
    if(typeof meeting?.auto_briefing==='string')return meeting.auto_briefing;
    if(meeting?.auto_briefing?.executive_summary)return meeting.auto_briefing.executive_summary;
    return 'Fireflies hat für dieses Gespräch noch keine belastbare Zusammenfassung geliefert.';
  }

  function renderModal(){
    const score=scoreFor(meeting);
    const q=meeting?.qualification_signals||{};
    const pain=asArray(meeting?.extracted_pain_points).map(textOf).filter(Boolean).join(' · ');
    const goals=asArray(meeting?.extracted_goals).map(textOf).filter(Boolean).join(' · ');
    const objections=asArray(meeting?.extracted_objections).map(textOf).filter(Boolean).join(' · ');
    const next=asArray(meeting?.extracted_next_steps).map(textOf).filter(Boolean);
    $('dcScore').textContent=`${score}%`;
    $('dcPhase').textContent=phaseFor(score);
    $('dcUpdated').textContent=`Zuletzt aktualisiert: ${fmt(meeting?.updated_at||meeting?.started_at)}`;
    $('dcTranscript').classList.toggle('hidden',!meeting?.transcript_url);
    if(meeting?.transcript_url)$('dcTranscript').href=meeting.transcript_url;
    $('dcModalBody').innerHTML=`
      <section class="modal-company"><div><span>LEAD / UNTERNEHMEN</span><h3>${esc(activeLead?.company_name||'Lead')}</h3><p>${esc(activeLead?.contact_name||'Ansprechpartner offen')} · ${esc(activeLead?.email||'E-Mail offen')}</p></div><div class="modal-company-meta"><div><span>Phase</span><b>${esc(activeLead?.stage||'—')}</b></div><div><span>Wert</span><b>${activeLead?.estimated_value?new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(activeLead.estimated_value):'—'}</b></div><div><span>Analyse</span><b>${esc(meeting?.analysis_model||'Fireflies')}</b></div></div></section>
      <div class="modal-insight-grid">
        <article><span>✦ GESPRÄCHSZUSAMMENFASSUNG</span><p>${esc(getSummary())}</p></article>
        <article><span>⌁ AKTUELLER PROZESS</span><p>${esc(q.current_process||q.process_summary||'Der aktuelle Prozess wird aus dem Gesprächskontext abgeleitet.')}</p></article>
        <article><span>△ KERNPROBLEM</span><p>${esc(pain||'Noch kein eindeutiges Kernproblem erkannt.')}</p></article>
        <article><span>◎ ZIELBILD</span><p>${esc(goals||'Noch kein eindeutiges Zielbild erkannt.')}</p></article>
      </div>
      <div class="modal-facts">
        <article><span>ENTSCHEIDER</span><b>${esc(q.decision_maker||q.authority||activeLead?.contact_name||'Offen')}</b></article>
        <article><span>DRINGLICHKEIT</span><b>${esc(q.urgency||q.timeline||'Offen')}</b></article>
        <article><span>BUDGETRAHMEN</span><b>${esc(q.budget_range||q.budget||'Offen')}</b></article>
        <article><span>NÄCHSTER SCHRITT</span><b>${esc(next[0]||'Follow-up definieren')}</b></article>
      </div>
      <div class="modal-lower-grid">
        <section><span class="modal-label">WESENTLICHE ACTION ITEMS</span>${next.length?`<ul class="modal-actions">${next.slice(0,5).map(item=>`<li>✓ ${esc(item)}</li>`).join('')}</ul>`:'<p class="modal-empty">Keine Action Items erkannt.</p>'}</section>
        <section class="modal-ai-note"><span>✦ KI-HINWEIS</span><p>${esc(objections?`Einwände/Risiken: ${objections}`:'Fireflies empfiehlt, offene Punkte im nächsten Gespräch gezielt zu validieren.')}</p><div><small>ERKANNTE MODULE</small>${chips(meeting?.recommended_modules)}</div></section>
      </div>`;
  }

  function openModal(){
    if(!activeLead)return;
    renderModal();
    $('dcModal').classList.add('open');
    $('dcModal').setAttribute('aria-hidden','false');
    document.body.classList.add('modal-open');
  }

  function closeModal(){
    $('dcModal').classList.remove('open');
    $('dcModal').setAttribute('aria-hidden','true');
    document.body.classList.remove('modal-open');
  }

  async function approve(){
    if(!activeLead) return;
    const btn=$('dcApprove');
    btn.disabled=true;btn.textContent='Wird übernommen …';
    try{
      const q=meeting?.qualification_signals||{};
      const pains=asArray(meeting?.extracted_pain_points).map(textOf).filter(Boolean);
      const goals=asArray(meeting?.extracted_goals).map(textOf).filter(Boolean);
      const modules=asArray(meeting?.recommended_modules).map(value=>typeof value==='string'?{name:value}:{name:value?.title||value?.product_code||value?.name||'Modul',...value});
      const assessment={
        organization_id:window.NXTGEN_ORG_ID,
        lead_id:activeLead.id,
        current_process:q.current_process||q.process_summary||null,
        core_problem:pains.join(' · ')||null,
        desired_outcome:goals.join(' · ')||null,
        urgency:String(q.urgency||'medium').toLowerCase(),
        budget_range:q.budget_range||q.budget||null,
        decision_maker:q.decision_maker||q.authority||activeLead.contact_name||null,
        objections:asArray(meeting?.extracted_objections),
        qualification_score:scoreFor(meeting),
        status:'completed',
        summary:getSummary(),
        updated_at:new Date().toISOString()
      };
      const solution={
        organization_id:window.NXTGEN_ORG_ID,
        lead_id:activeLead.id,
        status:'recommended',
        package_name:modules.map(item=>item.name).join(' + ')||'KI-empfohlene Lösung',
        selected_products:modules,
        selected_modules:modules,
        scope_items:goals,
        rationale:`Automatisch aus Fireflies Meeting Intelligence abgeleitet. Deal Readiness ${assessment.qualification_score}%.`,
        updated_at:new Date().toISOString()
      };
      if(dbReady()){
        const {data,error}=await window.NXTGEN_DB.from('discovery_assessments').upsert(assessment,{onConflict:'lead_id'}).select('id').single();
        if(error)throw error;
        solution.assessment_id=data.id;
        const {error:solutionError}=await window.NXTGEN_DB.from('solution_configurations').upsert(solution,{onConflict:'lead_id'});
        if(solutionError)throw solutionError;
        await window.NXTGEN_DB.rpc('advance_lead_stage',{p_lead_id:activeLead.id,p_stage:'solution_configured'});
      }else{
        localStorage.setItem(`nxtgen_discovery_${activeLead.id}`,JSON.stringify({assessment,solution}));
      }
      activeLead.stage='solution_configured';
      window.dispatchEvent(new CustomEvent('nxtgen:discovery-approved',{detail:{leadId:activeLead.id,assessment,solution,backgroundCommercial:true}}));
      renderActivities();
      message('Gesprächsakte freigegeben. Angebot und Vertrag werden im Hintergrund vorbereitet.','success');
      closeModal();
    }catch(error){
      message(error.message||'Freigabe fehlgeschlagen.','error');
    }finally{
      btn.disabled=false;btn.textContent='Akte prüfen & fortsetzen';
    }
  }

  $('dcLead').addEventListener('change',event=>selectLead(event.target.value));
  $('dcOpen').addEventListener('click',openModal);
  $('dcApprove').addEventListener('click',approve);
  shell.querySelectorAll('[data-close-modal]').forEach(node=>node.addEventListener('click',closeModal));
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeModal()});
  window.addEventListener('nxtgen:ready',loadLeads);
  setTimeout(loadLeads,500);
})();
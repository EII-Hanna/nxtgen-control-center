(() => {
  const customers=document.getElementById('customers'); if(!customers)return;
  const acquisition=[['new','Neu'],['contacted','Kontaktiert'],['responded','Reaktion'],['qualified','Qualifiziert'],['meeting_offered','Termin angeboten'],['meeting_booked','Termin gebucht']];
  const closing=[['meeting_booked','Termin gebucht'],['meeting_prepared','Vorbereitet'],['meeting_completed','Erstgespräch'],['need_confirmed','Bedarf bestätigt'],['solution_configured','Lösung'],['offer_open','Angebot'],['negotiation','Closing'],['contract_sent','Vertrag'],['won','Deal gewonnen']];
  let leads=[]; let mode='acquisition'; let activeLead=null; let activities=[];

  customers.classList.remove('empty');
  customers.innerHTML=`<div class="lead-cockpit"><div class="lead-head"><div><p class="eyebrow">NXTGEN SALES V1</p><h2>Zwei Prozesse. Eine saubere Übergabe.</h2><p>Prozess 1 erzeugt Termine. Prozess 2 verwandelt Termine in gewonnenen Umsatz.</p></div><button class="btn primary" id="focusLeadForm">+ Interessent</button></div>
  <div class="sales-process-map"><div class="process-step active"><span>01</span><b>Lead → Termin</b><small>Akquise & Qualifizierung</small></div><i>→</i><div class="process-handoff"><b>Termin gebucht</b><small>automatische Übergabe</small></div><i>→</i><div class="process-step"><span>02</span><b>Termin → Deal</b><small>Gespräch, Angebot & Closing</small></div><i>→</i><div class="process-step"><span>03</span><b>Onboarding</b><small>Start nach Deal Won</small></div></div>
  <div class="pipeline-tabs"><button class="active" data-mode="acquisition">Lead → Termin</button><button data-mode="closing">Termin → Deal gewonnen</button></div>
  <div class="lead-kpis"><article class="lead-kpi"><span>OFFENE LEADS</span><strong id="leadKpiOpen">0</strong><small>Prozess 1</small></article><article class="lead-kpi"><span>GEBUCHTE TERMINE</span><strong id="leadKpiMeetings">0</strong><small>Übergaben an Closing</small></article><article class="lead-kpi"><span>CLOSING-PIPELINE</span><strong id="leadKpiValue">0 €</strong><small>offenes Potenzial</small></article><article class="lead-kpi"><span>DEALS GEWONNEN</span><strong id="leadKpiWon">0</strong><small>Vertrag + Zahlung</small></article></div>
  <div class="lead-layout"><section><div class="pipeline-context" id="pipelineContext"></div><div class="pipeline-board" id="pipelineBoard"></div></section><aside class="lead-side"><h3>Interessent erfassen</h3><form class="lead-form" id="leadForm"><div><label>UNTERNEHMEN</label><input id="leadCompany" required></div><div><label>ANSPRECHPARTNER</label><input id="leadContact"></div><div><label>E-MAIL</label><input id="leadEmail" type="email"></div><div><label>QUELLE</label><select id="leadSource"><option value="linkedin">LinkedIn</option><option value="email">E-Mail</option><option value="website">Website</option><option value="whatsapp">WhatsApp</option><option value="referral">Empfehlung</option><option value="manual">Manuell</option></select></div><div><label>POTENZIAL NETTO</label><input id="leadValue" type="number" min="0" value="0"></div><div><label>BEDARF</label><textarea id="leadNeed"></textarea></div><div><label>NÄCHSTER SCHRITT</label><input id="leadNext"></div><div><label>FOLLOW-UP</label><input id="leadFollowup" type="datetime-local"></div><div class="lead-actions"><button type="reset" class="btn">Leeren</button><button type="submit" class="btn primary">Speichern</button></div></form><div class="followup-list"><p class="eyebrow">PROZESSREGEL</p><p class="rule-copy">„Termin gebucht“ erzeugt automatisch die Closing-Chance. „Deal gewonnen“ startet anschließend das Kunden-Onboarding.</p></div></aside></div></div>
  <div class="lead-drawer-backdrop" id="leadDrawerBackdrop"></div><aside class="lead-drawer" id="leadDrawer"><div class="lead-drawer-head"><div><p class="eyebrow">LEAD-AKTE</p><h2 id="drawerCompany">Interessent</h2><span id="drawerMeta"></span></div><button class="drawer-close" id="drawerClose">×</button></div><div class="drawer-grid"><section class="drawer-card"><h3>Kontakt & Bedarf</h3><label>Ansprechpartner<input id="drawerContact"></label><label>E-Mail<input id="drawerEmail" type="email"></label><label>Bedarf<textarea id="drawerNeed"></textarea></label><label>Nächster Schritt<input id="drawerNext"></label><label>Follow-up<input id="drawerFollowup" type="datetime-local"></label><button class="btn primary" id="saveLeadDetail">Lead aktualisieren</button></section><section class="drawer-card"><h3>Termin</h3><label>Datum & Uhrzeit<input id="drawerMeetingAt" type="datetime-local"></label><label>Meeting-Link<input id="drawerMeetingUrl" placeholder="https://meet.google.com/…"></label><label>Anbieter<select id="drawerMeetingProvider"><option value="manual">Manuell</option><option value="google_calendar">Google Calendar</option><option value="calendly">Calendly</option><option value="zoom">Zoom</option></select></label><div class="meeting-actions"><button class="btn" id="saveMeeting">Termin speichern</button><button class="btn primary" id="bookMeeting">Termin gebucht</button></div><div class="meeting-actions"><button class="btn" id="markNoShow">No-Show</button><button class="btn" id="markCompleted">Gespräch erledigt</button></div></section></div><section class="drawer-card timeline-card"><div class="timeline-head"><h3>Aktivitäten</h3><select id="activityType"><option value="note">Notiz</option><option value="call">Anruf</option><option value="email">E-Mail</option><option value="whatsapp">WhatsApp</option><option value="linkedin">LinkedIn</option><option value="meeting">Meeting</option></select></div><textarea id="activityBody" placeholder="Aktivität, Gesprächsnotiz oder Ergebnis dokumentieren …"></textarea><button class="btn" id="addActivity">Aktivität speichern</button><div id="activityTimeline" class="activity-timeline"></div></section></aside>`;

  const $=id=>document.getElementById(id); const money=v=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(v||0)); const esc=v=>{const d=document.createElement('div');d.textContent=v??'';return d.innerHTML};
  const dbReady=()=>Boolean(window.NXTGEN_DB&&window.NXTGEN_ORG_ID&&!window.NXTGEN_DEMO_MODE);
  const localActivities=()=>JSON.parse(localStorage.getItem('nxtgen_demo_activities')||'[]');
  const saveLocalActivities=rows=>localStorage.setItem('nxtgen_demo_activities',JSON.stringify(rows));
  const toInputDate=v=>v?new Date(v).toISOString().slice(0,16):'';

  async function persistStage(lead,stage){
    if(dbReady()){
      const {data,error}=await window.NXTGEN_DB.rpc('advance_lead_stage',{p_lead_id:lead.id,p_stage:stage});
      if(error){alert(error.message);return}
      Object.assign(lead,data);
    }else{
      const old=lead.stage; lead.stage=stage; lead.updated_at=new Date().toISOString();
      if(stage==='meeting_booked'){lead.meeting_status='booked';lead.closing_started_at=lead.closing_started_at||new Date().toISOString()}
      const rows=localActivities(); rows.unshift({id:crypto.randomUUID(),lead_id:lead.id,activity_type:'stage_change',subject:'Pipeline-Status geändert',body:`${old} → ${stage}`,created_at:new Date().toISOString()}); saveLocalActivities(rows);
      localStorage.setItem('nxtgen_demo_leads',JSON.stringify(leads));
    }
    render(); if(activeLead?.id===lead.id){activeLead=lead;await loadActivities();fillDrawer()}
  }

  async function load(){
    if(!dbReady()){leads=JSON.parse(localStorage.getItem('nxtgen_demo_leads')||'[]');render();return}
    const {data,error}=await window.NXTGEN_DB.from('leads').select('*').eq('organization_id',window.NXTGEN_ORG_ID).order('created_at',{ascending:false});
    if(error){console.error(error);return} leads=data||[]; render();
  }

  function render(){
    const stages=mode==='acquisition'?acquisition:closing;
    $('pipelineContext').innerHTML=mode==='acquisition'?'<b>Ziel:</b> Aus einem Interessenten wird ein verbindlich gebuchter Termin.':'<b>Ziel:</b> Aus einem gebuchten Termin wird ein unterschriebener und bezahlter Deal.';
    $('pipelineBoard').style.gridTemplateColumns=`repeat(${stages.length},minmax(220px,1fr))`;
    $('pipelineBoard').innerHTML=stages.map(([key,label],idx)=>{const cards=leads.filter(x=>x.stage===key);return `<div class="pipeline-column"><div class="pipeline-column-head"><b>${label}</b><span>${cards.length}</span></div>${cards.map(c=>`<article class="lead-card" data-open-lead="${c.id}"><div class="lead-card-top"><strong>${esc(c.company_name)}</strong><span class="lead-source">${esc(c.source)}</span></div><p>${esc(c.need_summary||c.next_step||'Noch keine Notiz')}</p><div class="lead-card-meta"><span>${esc(c.contact_name||'Ohne Kontakt')}</span><b class="lead-value">${money(c.estimated_value)}</b></div>${c.meeting_at?`<div class="lead-meeting-badge">◷ ${new Intl.DateTimeFormat('de-DE',{dateStyle:'short',timeStyle:'short'}).format(new Date(c.meeting_at))}</div>`:''}${idx<stages.length-1?`<button class="stage-next" data-id="${c.id}" data-next="${stages[idx+1][0]}">Weiter → ${stages[idx+1][1]}</button>`:''}</article>`).join('')}</div>`}).join('');
    $('leadKpiOpen').textContent=leads.filter(x=>acquisition.some(s=>s[0]===x.stage)&&x.stage!=='meeting_booked').length;
    $('leadKpiMeetings').textContent=leads.filter(x=>closing.some(s=>s[0]===x.stage)).length;
    $('leadKpiValue').textContent=money(leads.filter(x=>closing.some(s=>s[0]===x.stage)&&x.stage!=='won').reduce((s,x)=>s+Number(x.estimated_value||0),0));
    $('leadKpiWon').textContent=leads.filter(x=>x.stage==='won').length;
    customers.querySelectorAll('.stage-next').forEach(b=>b.onclick=e=>{e.stopPropagation();const lead=leads.find(x=>String(x.id)===b.dataset.id);if(lead)persistStage(lead,b.dataset.next)});
    customers.querySelectorAll('[data-open-lead]').forEach(card=>card.onclick=()=>openDrawer(card.dataset.openLead));
  }

  async function openDrawer(id){activeLead=leads.find(x=>String(x.id)===String(id));if(!activeLead)return;fillDrawer();$('leadDrawer').classList.add('open');$('leadDrawerBackdrop').classList.add('open');await loadActivities()}
  function closeDrawer(){$('leadDrawer').classList.remove('open');$('leadDrawerBackdrop').classList.remove('open');activeLead=null;activities=[]}
  function fillDrawer(){if(!activeLead)return;$('drawerCompany').textContent=activeLead.company_name;$('drawerMeta').textContent=`${activeLead.source||'manual'} · ${money(activeLead.estimated_value)}`;$('drawerContact').value=activeLead.contact_name||'';$('drawerEmail').value=activeLead.email||'';$('drawerNeed').value=activeLead.need_summary||'';$('drawerNext').value=activeLead.next_step||'';$('drawerFollowup').value=toInputDate(activeLead.next_follow_up_at);$('drawerMeetingAt').value=toInputDate(activeLead.meeting_at);$('drawerMeetingUrl').value=activeLead.meeting_url||'';$('drawerMeetingProvider').value=activeLead.meeting_provider||'manual'}

  async function loadActivities(){
    if(!activeLead)return;
    if(dbReady()){
      const {data,error}=await window.NXTGEN_DB.from('sales_activities').select('*').eq('lead_id',activeLead.id).order('created_at',{ascending:false});
      if(error){console.error(error);activities=[]}else activities=data||[];
    }else activities=localActivities().filter(x=>String(x.lead_id)===String(activeLead.id));
    $('activityTimeline').innerHTML=activities.length?activities.map(a=>`<div class="activity-item"><span>${esc(a.activity_type)}</span><b>${esc(a.subject||'Aktivität')}</b><p>${esc(a.body||'')}</p><small>${new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeStyle:'short'}).format(new Date(a.created_at))}</small></div>`).join(''):'<p class="timeline-empty">Noch keine Aktivitäten dokumentiert.</p>';
  }

  async function updateLead(payload){
    if(!activeLead)return;
    if(dbReady()){
      const {data,error}=await window.NXTGEN_DB.from('leads').update({...payload,updated_at:new Date().toISOString()}).eq('id',activeLead.id).select('*').single();
      if(error)throw error; Object.assign(activeLead,data);
    }else{Object.assign(activeLead,payload,{updated_at:new Date().toISOString()});localStorage.setItem('nxtgen_demo_leads',JSON.stringify(leads))}
    render();fillDrawer();
  }

  async function addActivity(type,body,subject='Aktivität dokumentiert'){
    if(!activeLead||!body.trim())return;
    const payload={organization_id:window.NXTGEN_ORG_ID,lead_id:activeLead.id,activity_type:type,subject,body:body.trim(),created_at:new Date().toISOString()};
    if(dbReady()){
      const {error}=await window.NXTGEN_DB.from('sales_activities').insert(payload);if(error)throw error;
    }else{payload.id=crypto.randomUUID();const rows=localActivities();rows.unshift(payload);saveLocalActivities(rows)}
    await loadActivities();
  }

  customers.querySelectorAll('.pipeline-tabs button').forEach(b=>b.onclick=()=>{customers.querySelectorAll('.pipeline-tabs button').forEach(x=>x.classList.remove('active'));b.classList.add('active');mode=b.dataset.mode;render()});
  $('leadForm').onsubmit=async e=>{e.preventDefault();const payload={organization_id:window.NXTGEN_ORG_ID,company_name:$('leadCompany').value.trim(),contact_name:$('leadContact').value.trim()||null,email:$('leadEmail').value.trim()||null,source:$('leadSource').value,stage:'new',estimated_value:Number($('leadValue').value||0),need_summary:$('leadNeed').value.trim()||null,next_step:$('leadNext').value.trim()||null,next_follow_up_at:$('leadFollowup').value?new Date($('leadFollowup').value).toISOString():null};if(dbReady()){const {error}=await window.NXTGEN_DB.from('leads').insert(payload);if(error){alert(error.message);return}}else{payload.id=crypto.randomUUID();payload.created_at=new Date().toISOString();leads.unshift(payload);localStorage.setItem('nxtgen_demo_leads',JSON.stringify(leads))}e.target.reset();$('leadValue').value=0;load()};
  $('saveLeadDetail').onclick=async()=>{try{await updateLead({contact_name:$('drawerContact').value.trim()||null,email:$('drawerEmail').value.trim()||null,need_summary:$('drawerNeed').value.trim()||null,next_step:$('drawerNext').value.trim()||null,next_follow_up_at:$('drawerFollowup').value?new Date($('drawerFollowup').value).toISOString():null});await addActivity('note','Lead-Daten und nächster Schritt aktualisiert.','Lead aktualisiert')}catch(e){alert(e.message)}};
  $('saveMeeting').onclick=async()=>{try{await updateLead({meeting_at:$('drawerMeetingAt').value?new Date($('drawerMeetingAt').value).toISOString():null,meeting_url:$('drawerMeetingUrl').value.trim()||null,meeting_provider:$('drawerMeetingProvider').value,meeting_status:'offered'});await addActivity('meeting','Termin wurde angelegt oder aktualisiert.','Termin aktualisiert');if(activeLead.stage==='qualified')await persistStage(activeLead,'meeting_offered')}catch(e){alert(e.message)}};
  $('bookMeeting').onclick=async()=>{try{await updateLead({meeting_at:$('drawerMeetingAt').value?new Date($('drawerMeetingAt').value).toISOString():activeLead.meeting_at,meeting_url:$('drawerMeetingUrl').value.trim()||null,meeting_provider:$('drawerMeetingProvider').value,meeting_status:'booked'});await persistStage(activeLead,'meeting_booked');mode='closing';customers.querySelectorAll('.pipeline-tabs button').forEach(x=>x.classList.toggle('active',x.dataset.mode==='closing'));render()}catch(e){alert(e.message)}};
  $('markNoShow').onclick=async()=>{try{await updateLead({meeting_status:'no_show',next_step:'No-Show Follow-up',next_follow_up_at:new Date(Date.now()+86400000).toISOString()});await addActivity('meeting','Interessent ist nicht zum Termin erschienen. Follow-up wurde gesetzt.','No-Show')}catch(e){alert(e.message)}};
  $('markCompleted').onclick=async()=>{try{await updateLead({meeting_status:'completed'});await persistStage(activeLead,'meeting_completed');await addActivity('meeting','Erstgespräch wurde durchgeführt.','Gespräch abgeschlossen')}catch(e){alert(e.message)}};
  $('addActivity').onclick=async()=>{try{await addActivity($('activityType').value,$('activityBody').value);$('activityBody').value=''}catch(e){alert(e.message)}};
  $('drawerClose').onclick=closeDrawer;$('leadDrawerBackdrop').onclick=closeDrawer;$('focusLeadForm').onclick=()=>$('leadCompany').focus();window.addEventListener('nxtgen:ready',load);setTimeout(load,300);
})();
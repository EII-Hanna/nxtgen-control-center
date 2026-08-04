(() => {
  const delivery=document.getElementById('delivery');
  if(!delivery)return;
  delivery.classList.remove('empty');
  delivery.innerHTML=`<div class="onboard-shell"><div class="onboard-head"><div><p class="eyebrow">SPRINT 3 · CUSTOMER ONBOARDING</p><h2>Deal gewonnen → Kunde operativ startklar</h2><p>Übergabe, Unterlagen, Zugänge, Kick-off und Projektstart in einem geführten Ablauf.</p></div><button class="btn primary" id="refreshOnboarding">Aktualisieren</button></div><div class="onboard-kpis"><article><span>OFFENE ONBOARDINGS</span><strong id="obOpen">0</strong></article><article><span>BEREIT FÜR KICK-OFF</span><strong id="obReady">0</strong></article><article><span>BLOCKIERT</span><strong id="obBlocked">0</strong></article><article><span>Ø FORTSCHRITT</span><strong id="obProgress">0%</strong></article></div><div class="onboard-layout"><section><div class="onboard-toolbar"><select id="wonLeadSelect"><option value="">Gewonnenen Deal auswählen …</option></select><button class="btn primary" id="startOnboarding">Onboarding starten</button></div><div id="onboardingList" class="onboarding-list"></div></section><aside id="onboardingDetail" class="onboarding-detail"><div class="onboarding-empty"><b>Onboarding auswählen</b><p>Öffne einen Vorgang, um Anforderungen, Aufgaben und Kick-off zu steuern.</p></div></aside></div></div>`;

  const $=id=>document.getElementById(id);
  const dbReady=()=>Boolean(window.NXTGEN_DB&&window.NXTGEN_ORG_ID&&!window.NXTGEN_DEMO_MODE);
  let cases=[];let wonLeads=[];let active=null;let requirements=[];let tasks=[];
  const esc=v=>{const d=document.createElement('div');d.textContent=v??'';return d.innerHTML};
  const fmt=v=>v?new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v)):'—';

  async function load(){
    if(!dbReady()){renderDemo();return}
    const [{data:leadRows},{data:caseRows}]=await Promise.all([
      window.NXTGEN_DB.from('leads').select('id,company_name,contact_name,email,stage,converted_client_id').eq('organization_id',window.NXTGEN_ORG_ID).eq('stage','won').order('updated_at',{ascending:false}),
      window.NXTGEN_DB.from('onboarding_cases').select('*,client:clients(company_name),lead:leads(company_name)').eq('organization_id',window.NXTGEN_ORG_ID).order('created_at',{ascending:false})
    ]);
    wonLeads=leadRows||[];cases=caseRows||[];render();
  }

  function renderDemo(){
    cases=JSON.parse(localStorage.getItem('nxtgen_demo_onboardings')||'[]');
    wonLeads=JSON.parse(localStorage.getItem('nxtgen_demo_leads')||'[]').filter(x=>x.stage==='won');
    render();
  }

  function render(){
    $('wonLeadSelect').innerHTML='<option value="">Gewonnenen Deal auswählen …</option>'+wonLeads.filter(l=>!cases.some(c=>String(c.lead_id)===String(l.id))).map(l=>`<option value="${l.id}">${esc(l.company_name)}</option>`).join('');
    $('onboardingList').innerHTML=cases.length?cases.map(c=>`<article class="onboarding-card" data-case="${c.id}"><div><span>${esc(c.status)}</span><h3>${esc(c.client?.company_name||c.lead?.company_name||c.company_name||'Kunde')}</h3><p>Kick-off: ${fmt(c.kickoff_at)}</p></div><div class="onboard-progress"><b>${Number(c.progress||0)}%</b><i><em style="width:${Number(c.progress||0)}%"></em></i></div></article>`).join(''):'<div class="onboarding-empty"><b>Noch kein Onboarding</b><p>Wähle oben einen gewonnenen Deal aus.</p></div>';
    $('obOpen').textContent=cases.filter(c=>!['completed'].includes(c.status)).length;
    $('obReady').textContent=cases.filter(c=>['ready_for_kickoff','kickoff_scheduled'].includes(c.status)).length;
    $('obBlocked').textContent=cases.filter(c=>c.status==='blocked').length;
    $('obProgress').textContent=cases.length?Math.round(cases.reduce((s,c)=>s+Number(c.progress||0),0)/cases.length)+'%':'0%';
    delivery.querySelectorAll('[data-case]').forEach(el=>el.onclick=()=>openCase(el.dataset.case));
  }

  async function openCase(id){
    active=cases.find(c=>String(c.id)===String(id));if(!active)return;
    if(dbReady()){
      const [{data:req},{data:tsk}]=await Promise.all([
        window.NXTGEN_DB.from('onboarding_requirements').select('*').eq('onboarding_id',active.id).order('created_at'),
        window.NXTGEN_DB.from('onboarding_tasks').select('*').eq('onboarding_id',active.id).order('created_at')
      ]);requirements=req||[];tasks=tsk||[];
    }else{requirements=active.requirements||[];tasks=active.tasks||[]}
    renderDetail();
  }

  function renderDetail(){
    const name=active.client?.company_name||active.lead?.company_name||active.company_name||'Kunde';
    $('onboardingDetail').innerHTML=`<div class="ob-detail-head"><div><p class="eyebrow">ONBOARDING-AKTE</p><h3>${esc(name)}</h3><span>${esc(active.status)} · ${Number(active.progress||0)}%</span></div><button class="btn" id="completeOnboarding">Abschließen</button></div><section class="ob-detail-card"><h4>Kick-off & Go-live</h4><label>Kick-off<input id="obKickoff" type="datetime-local" value="${active.kickoff_at?new Date(active.kickoff_at).toISOString().slice(0,16):''}"></label><label>Meeting-Link<input id="obKickoffUrl" value="${esc(active.kickoff_url||'')}"></label><label>Ziel Go-live<input id="obGoLive" type="date" value="${active.target_go_live||''}"></label><button class="btn primary" id="saveKickoff">Termin speichern</button></section><section class="ob-detail-card"><h4>Anforderungen</h4><div class="ob-requirements">${requirements.map(r=>`<label class="ob-check"><input type="checkbox" data-req="${r.id}" ${['submitted','approved','not_required'].includes(r.status)?'checked':''}><span><b>${esc(r.title)}</b><small>${esc(r.category)} · ${esc(r.status)}</small></span></label>`).join('')}</div></section><section class="ob-detail-card"><h4>Interne Aufgaben</h4><div class="ob-tasks">${tasks.map(t=>`<label class="ob-check"><input type="checkbox" data-task="${t.id}" ${t.status==='completed'?'checked':''}><span><b>${esc(t.title)}</b><small>${esc(t.phase)} · ${esc(t.status)}</small></span></label>`).join('')}</div></section><section class="ob-detail-card"><h4>Notizen / Blocker</h4><textarea id="obNotes">${esc(active.internal_notes||'')}</textarea><input id="obBlocker" placeholder="Blocker-Grund" value="${esc(active.blocker_reason||'')}"><button class="btn" id="saveNotes">Speichern</button></section>`;
    $('saveKickoff').onclick=saveKickoff;$('saveNotes').onclick=saveNotes;$('completeOnboarding').onclick=completeOnboarding;
    delivery.querySelectorAll('[data-req]').forEach(x=>x.onchange=()=>toggleRequirement(x.dataset.req,x.checked));
    delivery.querySelectorAll('[data-task]').forEach(x=>x.onchange=()=>toggleTask(x.dataset.task,x.checked));
  }

  async function start(){
    const leadId=$('wonLeadSelect').value;if(!leadId)return alert('Bitte einen gewonnenen Deal auswählen.');
    if(dbReady()){
      const {data,error}=await window.NXTGEN_DB.rpc('start_customer_onboarding',{p_lead_id:leadId});if(error)return alert(error.message);
      await load();await openCase(data);
    }else{
      const lead=wonLeads.find(l=>String(l.id)===leadId);const row={id:crypto.randomUUID(),lead_id:lead.id,company_name:lead.company_name,status:'collecting',progress:10,created_at:new Date().toISOString(),requirements:[{id:crypto.randomUUID(),title:'Unternehmensdaten',category:'company',status:'open'},{id:crypto.randomUUID(),title:'Logo, Farben und Markenunterlagen',category:'brand',status:'open'},{id:crypto.randomUUID(),title:'Benötigte Tool-Zugänge',category:'access',status:'open'}],tasks:[{id:crypto.randomUUID(),title:'Sales-Handover prüfen',phase:'handoff',status:'open'},{id:crypto.randomUUID(),title:'Kick-off vorbereiten',phase:'kickoff',status:'open'}]};cases.unshift(row);localStorage.setItem('nxtgen_demo_onboardings',JSON.stringify(cases));render();openCase(row.id);
    }
  }

  async function updateCase(payload){
    if(dbReady()){const {data,error}=await window.NXTGEN_DB.from('onboarding_cases').update({...payload,updated_at:new Date().toISOString()}).eq('id',active.id).select('*,client:clients(company_name),lead:leads(company_name)').single();if(error)throw error;Object.assign(active,data)}else{Object.assign(active,payload);localStorage.setItem('nxtgen_demo_onboardings',JSON.stringify(cases))}render();renderDetail();
  }
  async function saveKickoff(){try{await updateCase({kickoff_at:$('obKickoff').value?new Date($('obKickoff').value).toISOString():null,kickoff_url:$('obKickoffUrl').value.trim()||null,target_go_live:$('obGoLive').value||null,status:$('obKickoff').value?'kickoff_scheduled':active.status})}catch(e){alert(e.message)}}
  async function saveNotes(){try{const blocker=$('obBlocker').value.trim();await updateCase({internal_notes:$('obNotes').value.trim()||null,blocker_reason:blocker||null,status:blocker?'blocked':active.status})}catch(e){alert(e.message)}}
  async function toggleRequirement(id,done){if(dbReady()){await window.NXTGEN_DB.from('onboarding_requirements').update({status:done?'approved':'open',approved_at:done?new Date().toISOString():null}).eq('id',id)}else{const r=requirements.find(x=>String(x.id)===String(id));r.status=done?'approved':'open'}await recalc()}
  async function toggleTask(id,done){if(dbReady()){await window.NXTGEN_DB.from('onboarding_tasks').update({status:done?'completed':'open',completed_at:done?new Date().toISOString():null}).eq('id',id)}else{const t=tasks.find(x=>String(x.id)===String(id));t.status=done?'completed':'open'}await recalc()}
  async function recalc(){const all=requirements.length+tasks.length;const done=requirements.filter(r=>['approved','submitted','not_required'].includes(r.status)).length+tasks.filter(t=>t.status==='completed').length;const progress=Math.min(95,10+(all?Math.round(done/all*80):0));await updateCase({progress,status:progress>=75?'ready_for_kickoff':active.status});await openCase(active.id)}
  async function completeOnboarding(){try{await updateCase({status:'completed',progress:100});if(dbReady())await window.NXTGEN_DB.from('clients').update({status:'active'}).eq('id',active.client_id)}catch(e){alert(e.message)}}

  $('startOnboarding').onclick=start;$('refreshOnboarding').onclick=load;window.addEventListener('nxtgen:ready',load);setTimeout(load,500);
})();
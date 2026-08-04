(() => {
  const host=document.getElementById('delivery'); if(!host)return;
  const esc=v=>{const d=document.createElement('div');d.textContent=v??'';return d.innerHTML};
  const dbReady=()=>Boolean(window.NXTGEN_DB&&window.NXTGEN_ORG_ID&&!window.NXTGEN_DEMO_MODE);
  let workspaces=[],active=null,assessment=null,initiatives=[],project=null,tasks=[],meeting=null;

  function mount(){
    const shell=document.createElement('section'); shell.className='kd-shell'; shell.id='kickoffDelivery';
    shell.innerHTML=`<div class="kd-head"><div><p class="eyebrow">KICKOFF → DELIVERY</p><h3>Vom Gespräch zur priorisierten Umsetzung</h3><p>Fireflies liefert den Kontext. NXTGEN strukturiert Status quo, Systeme, Team und Ziele, priorisiert Initiativen mit ICE und provisioniert nach Freigabe das Delivery-Projekt.</p></div><span class="kd-badge">AI PREPARED · HUMAN APPROVED</span></div><div id="kdBody" class="kd-empty"><h3>Kick-off-Daten werden geladen …</h3></div>`;
    host.appendChild(shell);
  }

  async function load(){
    if(!dbReady())return renderEmpty('Live-Supabase-Verbindung erforderlich.');
    const {data,error}=await window.NXTGEN_DB.from('client_workspaces').select('*,client:clients(id,company_name),onboarding:onboarding_cases(id)').eq('organization_id',window.NXTGEN_ORG_ID).order('created_at',{ascending:false});
    if(error)return renderEmpty(error.message); workspaces=data||[]; if(!workspaces.length)return renderEmpty('Noch kein Kunden-Workspace vorhanden.');
    active=active?workspaces.find(x=>x.id===active.id)||workspaces[0]:workspaces[0]; await loadActive();
  }

  async function loadActive(){
    const [a,i,p]=await Promise.all([
      window.NXTGEN_DB.from('client_kickoff_assessments').select('*').eq('workspace_id',active.id).order('created_at',{ascending:false}).limit(1).maybeSingle(),
      window.NXTGEN_DB.from('client_kickoff_initiatives').select('*').eq('workspace_id',active.id).order('ice_score',{ascending:false}),
      window.NXTGEN_DB.from('delivery_projects').select('*').eq('workspace_id',active.id).maybeSingle()
    ]);
    assessment=a.data||null; initiatives=i.data||[]; project=p.data||null;
    if(project){const t=await window.NXTGEN_DB.from('delivery_project_tasks').select('*').eq('project_id',project.id).order('sort_order',{ascending:false});tasks=t.data||[]}
    const m=await window.NXTGEN_DB.from('meeting_intelligence_records').select('*').eq('organization_id',window.NXTGEN_ORG_ID).order('started_at',{ascending:false}).limit(20);
    meeting=(m.data||[]).find(x=>x.lead_id&&String(x.provider)==='fireflies')||null;
    render();
  }

  function renderEmpty(text){document.getElementById('kdBody').innerHTML=`<div class="kd-empty"><h3>${esc(text)}</h3></div>`}
  function chips(arr){return (Array.isArray(arr)?arr:[]).map(x=>`<span>${esc(typeof x==='string'?x:(x.name||x.title||JSON.stringify(x)))}</span>`).join('')||'<small>Noch keine Daten</small>'}

  function render(){
    const body=document.getElementById('kdBody');
    body.innerHTML=`<div class="kd-toolbar"><label>KUNDE<select id="kdWorkspace">${workspaces.map(w=>`<option value="${w.id}" ${w.id===active.id?'selected':''}>${esc(w.client?.company_name||'Kunde')}</option>`).join('')}</select></label><div><button class="btn" id="kdGenerate">${assessment?'Kick-off neu auswerten':'Kick-off auswerten'}</button>${assessment?'<button class="btn primary" id="kdProvision">Delivery provisionieren</button>':''}</div></div>
    <div class="kd-grid"><article class="kd-panel"><p class="eyebrow">KICKOFF INTELLIGENCE</p><h4>${esc(active.client?.company_name||'Kunde')}</h4>${assessment?`<p>${esc(assessment.ai_summary||assessment.company_status_quo||'Kick-off wurde strukturiert.')}</p><div class="kd-score"><strong>${assessment.confidence}%</strong><span>Kontext-Confidence</span></div><h5>Systeme & Daten</h5><div class="kd-chips">${chips([...(assessment.systems||[]),...(assessment.data_sources||[])])}</div><h5>Team & Capabilities</h5><div class="kd-chips">${chips([...(assessment.team_roles||[]),...(assessment.capabilities||[])])}</div><h5>Ziele & Constraints</h5><div class="kd-chips">${chips([...(assessment.goals||[]),...(assessment.constraints||[])])}</div>`:`<p>Noch keine Kick-off-Auswertung vorhanden. NXTGEN nutzt das neueste Fireflies-Gespräch und vorhandenen Kundenkontext.</p>`}</article>
    <article class="kd-panel"><p class="eyebrow">FIRELIES SOURCE</p><h4>${esc(meeting?.title||'Kein Gespräch verknüpft')}</h4><p>${esc(meeting?.short_summary||meeting?.summary_overview||'Fireflies-Transkript oder Fallback-Kontext wird verwendet.')}</p><small>${meeting?.started_at?new Date(meeting.started_at).toLocaleString('de-DE'):'—'}</small></article></div>
    <div class="kd-panel kd-roadmap"><div class="kd-section-head"><div><p class="eyebrow">ICE ROADMAP</p><h4>KI-Vorschläge mit menschlicher Freigabe</h4></div><span>${initiatives.filter(x=>x.status==='approved'||x.status==='provisioned').length} freigegeben</span></div><div class="kd-initiatives">${initiatives.map(item=>`<article><div><small>${esc(item.recommended_phase)} · ICE ${Number(item.ice_score||0).toFixed(1)}</small><h4>${esc(item.title)}</h4><p>${esc(item.problem||'')}</p><b>${esc(item.expected_outcome||'')}</b></div><div class="kd-actions">${item.status==='proposed'?`<button data-reject="${item.id}">Ablehnen</button><button class="primary" data-approve="${item.id}">Freigeben</button>`:`<span>${esc(item.status)}</span>`}</div></article>`).join('')||'<p>Noch keine Initiativen erzeugt.</p>'}</div></div>
    ${project?`<div class="kd-panel"><div class="kd-section-head"><div><p class="eyebrow">DELIVERY PROJECT</p><h4>${esc(project.name)}</h4></div><strong>${project.progress}%</strong></div><div class="kd-stageflow">${['briefing','analysis','blueprint','provisioning','implementation','qa','client_approval','go_live'].map(s=>`<span class="${s===project.current_stage?'active':''}">${s.replace('_',' ')}</span>`).join('')}</div><div class="kd-tasklist">${tasks.map(t=>`<div><span>${esc(t.stage)}</span><b>${esc(t.title)}</b><small>${esc(t.status)} · ${esc(t.priority)}</small></div>`).join('')||'<p>Noch keine Aufgaben.</p>'}</div></div>`:''}`;
    document.getElementById('kdWorkspace').onchange=e=>{active=workspaces.find(x=>x.id===e.target.value);loadActive()};
    document.getElementById('kdGenerate').onclick=generateAssessment;
    document.getElementById('kdProvision')?.addEventListener('click',provision);
    body.querySelectorAll('[data-approve]').forEach(b=>b.onclick=()=>approve(b.dataset.approve));
    body.querySelectorAll('[data-reject]').forEach(b=>b.onclick=()=>reject(b.dataset.reject));
  }

  async function generateAssessment(){
    const source=[meeting?.summary_overview,meeting?.short_summary,meeting?.raw_text,active.strategic_goal].filter(Boolean).join('\n').toLowerCase();
    const pick=(terms,label)=>terms.some(x=>source.includes(x))?[label]:[];
    const pains=[...pick(['manuell','chaos','follow-up'],'Manuelle oder unklare Prozesse'),...pick(['support','ticket'],'Hohe Supportlast'),...pick(['daten','excel','systeme'],'Verteilte Daten und Systeme')];
    const goals=[active.strategic_goal||'Messbare operative Verbesserung'].filter(Boolean);
    const systems=['CRM','E-Mail','Kalender','n8n'].filter(x=>source.includes(x.toLowerCase()));
    const payload={organization_id:window.NXTGEN_ORG_ID,workspace_id:active.id,meeting_record_id:meeting?.id||null,status:'generated',company_status_quo:meeting?.summary_overview||'Kick-off-Kontext aus Kunden-Workspace und Gesprächsdaten.',systems,data_sources:systems,team_roles:[],capabilities:[],pain_points:pains,goals,constraints:[],success_metrics:[],open_questions:['Welche Baseline-KPIs gelten vor dem Start?','Wer übernimmt intern die Verantwortung?'],ai_summary:meeting?.short_summary||active.strategic_goal||'Kick-off wurde strukturiert.',confidence:meeting?82:58,generated_by:meeting?'fireflies+nxtgen':'nxtgen-context'};
    const {data,error}=assessment?await window.NXTGEN_DB.from('client_kickoff_assessments').update(payload).eq('id',assessment.id).select('*').single():await window.NXTGEN_DB.from('client_kickoff_assessments').insert(payload).select('*').single();
    if(error)return alert(error.message);assessment=data;
    await window.NXTGEN_DB.from('client_kickoff_initiatives').delete().eq('assessment_id',assessment.id).eq('status','proposed');
    const recs=await window.NXTGEN_DB.from('client_module_recommendations').select('*').eq('workspace_id',active.id).in('status',['recommended','approved']).order('score',{ascending:false}).limit(5);
    const rows=(recs.data||[]).map((r,idx)=>({organization_id:window.NXTGEN_ORG_ID,workspace_id:active.id,assessment_id:assessment.id,title:r.title,problem:(r.pain_match||[]).join(', '),solution:r.rationale,expected_outcome:r.expected_outcome,impact:Math.max(5,Math.ceil(r.score/10)),confidence:Math.max(5,Math.ceil(r.score/10)),effort:idx===0?3:5,recommended_phase:idx===0?'quick_win':idx<3?'phase_2':'phase_3',owner_role:idx===0?'Delivery Lead':'Automation Specialist',target_weeks:idx===0?6:12,source_evidence:r.pain_match||[]}));
    if(rows.length)await window.NXTGEN_DB.from('client_kickoff_initiatives').insert(rows);
    await loadActive();
  }
  async function approve(id){const {error}=await window.NXTGEN_DB.rpc('approve_kickoff_initiative',{p_initiative_id:id});if(error)return alert(error.message);await loadActive()}
  async function reject(id){const {error}=await window.NXTGEN_DB.from('client_kickoff_initiatives').update({status:'rejected',updated_at:new Date().toISOString()}).eq('id',id);if(error)return alert(error.message);await loadActive()}
  async function provision(){if(!initiatives.some(x=>x.status==='approved'))return alert('Mindestens eine Initiative freigeben.');const {error}=await window.NXTGEN_DB.rpc('provision_delivery_from_kickoff',{p_assessment_id:assessment.id});if(error)return alert(error.message);await loadActive();window.dispatchEvent(new CustomEvent('nxtgen:delivery-provisioned'))}

  mount();window.addEventListener('nxtgen:ready',load);setTimeout(load,1000);
})();
(() => {
  const host=document.getElementById('delivery'); if(!host)return;
  let projects=[],active=null,tasks=[];
  const dbReady=()=>Boolean(window.NXTGEN_DB&&window.NXTGEN_ORG_ID&&!window.NXTGEN_DEMO_MODE);
  const esc=v=>{const d=document.createElement('div');d.textContent=v??'';return d.innerHTML};
  const stages=[['briefing','Briefing'],['analysis','Analyse'],['blueprint','Blueprint'],['provisioning','Provisioning'],['implementation','Umsetzung'],['qa','QA'],['client_approval','Kundenfreigabe'],['go_live','Go-live']];
  const statuses={open:'Offen',in_progress:'In Arbeit',blocked:'Blockiert',review:'Prüfung',done:'Erledigt',cancelled:'Abgebrochen'};

  function mount(){
    const shell=document.createElement('section'); shell.className='fulfillment-shell'; shell.id='fulfillmentBoard';
    shell.innerHTML=`<div class="fulfillment-head"><div><p class="eyebrow">NXTGEN FULFILLMENT ENGINE</p><h3>Operatives Delivery Board</h3><p>Aufgaben, Blocker, Freigaben und Fortschritt über alle Fulfillment-Phasen.</p></div><span class="fulfillment-badge">HUMAN CONTROL · AUTOMATION READY</span></div><div id="fulfillmentBody" class="fulfillment-empty">Delivery-Projekte werden geladen …</div>`;
    host.appendChild(shell);
  }

  async function load(){
    if(!dbReady()) return renderEmpty('Live-Supabase-Verbindung erforderlich.');
    const {data,error}=await window.NXTGEN_DB.from('delivery_projects').select('*,client:clients(company_name)').eq('organization_id',window.NXTGEN_ORG_ID).order('created_at',{ascending:false});
    if(error)return renderEmpty(error.message);
    projects=data||[]; active=active?projects.find(p=>p.id===active.id)||projects[0]:projects[0];
    if(!active)return renderEmpty('Noch kein Delivery-Projekt provisioniert.');
    await loadTasks();
  }

  async function loadTasks(){
    const {data,error}=await window.NXTGEN_DB.from('delivery_project_tasks').select('*').eq('project_id',active.id).order('sort_order',{ascending:false});
    if(error)return renderEmpty(error.message); tasks=data||[]; render();
  }

  function renderEmpty(text){const el=document.getElementById('fulfillmentBody');if(el)el.innerHTML=`<div><h4>Fulfillment Board</h4><p>${esc(text)}</p></div>`}
  function taskCard(t){
    return `<article class="fulfillment-task ${t.status}"><div class="ft-top"><span class="ft-priority ${t.priority}">${esc(t.priority)}</span><span>${esc(statuses[t.status]||t.status)}</span></div><h4>${esc(t.title)}</h4><p>${esc(t.description||'')}</p>${t.blocked_reason?`<div class="ft-blocker">${esc(t.blocked_reason)}</div>`:''}<div class="ft-meta"><span>${esc(t.owner_role||'Nicht zugewiesen')}</span><span>${t.due_at?new Date(t.due_at).toLocaleDateString('de-DE'):'Kein Termin'}</span></div><div class="ft-actions"><select data-task-status="${t.id}">${Object.entries(statuses).filter(([k])=>k!=='cancelled').map(([k,v])=>`<option value="${k}" ${k===t.status?'selected':''}>${v}</option>`).join('')}</select>${t.approval_required&&t.approval_status!=='approved'?`<button data-approve-task="${t.id}">Freigeben</button><button data-change-task="${t.id}">Änderung</button>`:''}<button data-note-task="${t.id}">Notiz</button></div></article>`;
  }

  function render(){
    const body=document.getElementById('fulfillmentBody'); body.className='fulfillment-layout';
    const blocked=tasks.filter(t=>t.status==='blocked').length,review=tasks.filter(t=>t.status==='review'||t.approval_status==='pending').length;
    body.innerHTML=`<aside class="fulfillment-projects"><h4>Projekte</h4>${projects.map(p=>`<button class="${p.id===active.id?'active':''}" data-project="${p.id}"><b>${esc(p.client?.company_name||p.name)}</b><span>${p.progress}% · ${esc(p.status)}</span></button>`).join('')}</aside><main class="fulfillment-main"><div class="fulfillment-summary"><div><p class="eyebrow">${esc(active.current_stage).toUpperCase()}</p><h3>${esc(active.name)}</h3><p>${esc(active.objective||'')}</p></div><div class="progress-ring">${active.progress}%</div></div><div class="fulfillment-kpis"><article><span>AUFGABEN</span><strong>${tasks.length}</strong></article><article><span>BLOCKER</span><strong>${blocked}</strong></article><article><span>FREIGABEN</span><strong>${review}</strong></article><article><span>GO-LIVE</span><strong>${active.target_go_live?new Date(active.target_go_live).toLocaleDateString('de-DE'):'—'}</strong></article></div><div class="fulfillment-board">${stages.map(([key,label])=>`<section class="fulfillment-column"><header><h4>${label}</h4><span>${tasks.filter(t=>t.stage===key).length}</span></header>${tasks.filter(t=>t.stage===key).map(taskCard).join('')||'<p class="ft-empty">Keine Aufgaben</p>'}</section>`).join('')}</div></main>`;
    body.querySelectorAll('[data-project]').forEach(b=>b.onclick=async()=>{active=projects.find(p=>p.id===b.dataset.project);await loadTasks()});
    body.querySelectorAll('[data-task-status]').forEach(s=>s.onchange=()=>changeStatus(s.dataset.taskStatus,s.value));
    body.querySelectorAll('[data-approve-task]').forEach(b=>b.onclick=()=>reviewTask(b.dataset.approveTask,'approved'));
    body.querySelectorAll('[data-change-task]').forEach(b=>b.onclick=()=>reviewTask(b.dataset.changeTask,'changes_requested'));
    body.querySelectorAll('[data-note-task]').forEach(b=>b.onclick=()=>addNote(b.dataset.noteTask));
  }

  async function changeStatus(id,status){
    let reason=null;if(status==='blocked'){reason=prompt('Was blockiert die Aufgabe?');if(!reason)return render()}
    const {error}=await window.NXTGEN_DB.rpc('update_delivery_task_status',{p_task_id:id,p_status:status,p_blocked_reason:reason});if(error)return alert(error.message);await load();
  }
  async function reviewTask(id,decision){
    const message=prompt(decision==='approved'?'Freigabe-Kommentar':'Welche Änderung ist notwendig?')||'';
    const {error}=await window.NXTGEN_DB.rpc('review_delivery_task',{p_task_id:id,p_decision:decision,p_message:message});if(error)return alert(error.message);await load();
  }
  async function addNote(id){
    const message=prompt('Notiz zur Aufgabe');if(!message)return;const task=tasks.find(t=>t.id===id);
    const {error}=await window.NXTGEN_DB.from('delivery_task_events').insert({organization_id:window.NXTGEN_ORG_ID,project_id:active.id,task_id:id,event_type:'comment',message});if(error)return alert(error.message);alert('Notiz gespeichert.');
  }

  mount();window.addEventListener('nxtgen:ready',load);window.addEventListener('nxtgen:delivery-updated',load);setTimeout(load,900);
})();
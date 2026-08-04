(() => {
  const host=document.getElementById('delivery'); if(!host)return;
  let jobs=[],tasks=[],projects=[];
  const dbReady=()=>Boolean(window.NXTGEN_DB&&window.NXTGEN_ORG_ID&&!window.NXTGEN_DEMO_MODE);
  const esc=v=>{const d=document.createElement('div');d.textContent=v??'';return d.innerHTML};

  function mount(){
    const shell=document.createElement('section');
    shell.className='automation-execution-shell';
    shell.innerHTML=`<div class="automation-execution-head"><div><p class="eyebrow">NXTGEN EXECUTION LAYER</p><h3>n8n & Slack Automationen</h3><p>Automationsfähige Delivery-Aufgaben auslösen, überwachen und bei Fehlern eskalieren.</p></div><span class="automation-execution-badge">SERVER-SIDE · SECRET SAFE</span></div><div id="automationExecutionBody" class="automation-execution-empty">Ausführungsschicht wird geladen …</div>`;
    host.appendChild(shell);
  }

  async function load(){
    if(!dbReady())return renderEmpty('Live-Supabase-Verbindung erforderlich.');
    const [p,t,j]=await Promise.all([
      window.NXTGEN_DB.from('delivery_projects').select('id,name,status,client:clients(company_name)').eq('organization_id',window.NXTGEN_ORG_ID).order('created_at',{ascending:false}),
      window.NXTGEN_DB.from('delivery_project_tasks').select('*').eq('organization_id',window.NXTGEN_ORG_ID).order('updated_at',{ascending:false}),
      window.NXTGEN_DB.from('delivery_automation_jobs').select('*').eq('organization_id',window.NXTGEN_ORG_ID).order('created_at',{ascending:false}).limit(25)
    ]);
    projects=p.data||[];tasks=t.data||[];jobs=j.data||[];render();
  }

  function renderEmpty(text){const el=document.getElementById('automationExecutionBody');if(el)el.innerHTML=`<div><h4>Execution Layer</h4><p>${esc(text)}</p></div>`}

  function render(){
    const body=document.getElementById('automationExecutionBody');
    const configured=tasks.filter(t=>t.automation_enabled&&t.automation_key);
    const running=jobs.filter(j=>['queued','dispatching','running'].includes(j.status)).length;
    const failed=jobs.filter(j=>j.status==='failed').length;
    body.className='automation-execution-layout';
    body.innerHTML=`<div class="automation-execution-kpis"><article><span>KONFIGURIERT</span><strong>${configured.length}</strong></article><article><span>AKTIV</span><strong>${running}</strong></article><article><span>FEHLER</span><strong>${failed}</strong></article><article><span>JOBS</span><strong>${jobs.length}</strong></article></div><div class="automation-execution-grid"><section><div class="automation-execution-title"><h4>Automationsfähige Aufgaben</h4><button class="btn" id="configureAutomation">+ Aufgabe konfigurieren</button></div><div class="automation-task-list">${configured.map(taskRow).join('')||'<p class="automation-empty">Noch keine Aufgabe mit n8n verbunden.</p>'}</div></section><section><div class="automation-execution-title"><h4>Letzte Ausführungen</h4><button class="btn" id="refreshAutomation">Aktualisieren</button></div><div class="automation-job-list">${jobs.map(jobRow).join('')||'<p class="automation-empty">Noch keine Automation ausgeführt.</p>'}</div></section></div>`;
    body.querySelectorAll('[data-run-automation]').forEach(b=>b.onclick=()=>runAutomation(b.dataset.runAutomation,b));
    body.querySelectorAll('[data-disable-automation]').forEach(b=>b.onclick=()=>disableAutomation(b.dataset.disableAutomation));
    document.getElementById('configureAutomation').onclick=configureAutomation;
    document.getElementById('refreshAutomation').onclick=load;
  }

  function taskRow(t){
    const project=projects.find(p=>p.id===t.project_id);
    return `<article class="automation-task"><div><span class="automation-key">${esc(t.automation_key)}</span><h4>${esc(t.title)}</h4><p>${esc(project?.client?.company_name||project?.name||'Delivery-Projekt')} · ${esc(t.stage)}</p></div><div class="automation-task-actions"><span class="automation-status ${esc(t.automation_status)}">${esc(t.automation_status)}</span><button data-disable-automation="${t.id}">Trennen</button><button class="primary" data-run-automation="${t.id}">Jetzt ausführen</button></div></article>`;
  }

  function jobRow(j){
    const task=tasks.find(t=>t.id===j.task_id);
    const when=new Date(j.created_at).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'});
    return `<article class="automation-job ${esc(j.status)}"><div><span>${esc(j.status)} · ${when}</span><h4>${esc(task?.title||j.automation_key)}</h4><p>${esc(j.last_error||j.external_execution_id||'Ausführung protokolliert')}</p></div><b>${j.attempts}/${j.max_attempts}</b></article>`;
  }

  async function configureAutomation(){
    const eligible=tasks.filter(t=>!['done','cancelled'].includes(t.status));
    if(!eligible.length)return alert('Keine offene Delivery-Aufgabe vorhanden.');
    const list=eligible.slice(0,30).map((t,i)=>`${i+1}: ${t.title}`).join('\n');
    const pick=Number(prompt(`Aufgabe wählen:\n${list}`));
    const task=eligible[pick-1];if(!task)return;
    const key=prompt('n8n Automation Key, z. B. provision-crm oder generate-report',task.automation_key||'');
    if(!key?.trim())return;
    const {error}=await window.NXTGEN_DB.from('delivery_project_tasks').update({automation_enabled:true,automation_key:key.trim(),automation_status:'idle',updated_at:new Date().toISOString()}).eq('id',task.id);
    if(error)return alert(error.message);await load();
  }

  async function disableAutomation(id){
    const {error}=await window.NXTGEN_DB.from('delivery_project_tasks').update({automation_enabled:false,automation_status:'idle',updated_at:new Date().toISOString()}).eq('id',id);
    if(error)return alert(error.message);await load();
  }

  async function runAutomation(taskId,button){
    try{
      button.disabled=true;button.textContent='Wird eingeplant …';
      const {data:job,error}=await window.NXTGEN_DB.rpc('queue_delivery_automation',{p_task_id:taskId});
      if(error)throw error;
      const {error:invokeError}=await window.NXTGEN_DB.functions.invoke('delivery-automation-dispatch',{body:{job_id:job.id}});
      if(invokeError)throw invokeError;
      await load();
    }catch(error){alert(error.message||'Automation konnte nicht gestartet werden.');await load()}
    finally{button.disabled=false;button.textContent='Jetzt ausführen'}
  }

  mount();window.addEventListener('nxtgen:ready',load);window.addEventListener('nxtgen:delivery-updated',load);setTimeout(load,1100);
})();

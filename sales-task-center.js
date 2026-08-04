(() => {
  const customers=document.getElementById('customers');
  if(!customers)return;

  const moneyDate=value=>new Intl.DateTimeFormat('de-DE',{dateStyle:'short',timeStyle:'short'}).format(new Date(value));
  const esc=value=>{const d=document.createElement('div');d.textContent=value??'';return d.innerHTML};
  const dbReady=()=>Boolean(window.NXTGEN_DB&&window.NXTGEN_ORG_ID&&!window.NXTGEN_DEMO_MODE);
  let tasks=[];

  function ensureUI(){
    if(document.getElementById('salesTaskCenter'))return true;
    const cockpit=customers.querySelector('.lead-cockpit');
    if(!cockpit)return false;
    const block=document.createElement('section');
    block.id='salesTaskCenter';
    block.className='sales-task-center';
    block.innerHTML=`<div class="sales-task-head"><div><p class="eyebrow">SALES AUTOMATION</p><h3>Heute fällige Aufgaben</h3><p>Follow-ups, Terminerinnerungen und No-Show-Wiedervorlagen aus einem zentralen Arbeitskorb.</p></div><div class="sales-task-actions"><button class="btn" id="syncSalesTasks">Aufgaben aktualisieren</button></div></div><div class="sales-task-grid"><article class="sales-task-stat"><span>HEUTE FÄLLIG</span><strong id="taskToday">0</strong><small>bis Tagesende</small></article><article class="sales-task-stat"><span>ÜBERFÄLLIG</span><strong id="taskOverdue">0</strong><small>sofort bearbeiten</small></article><article class="sales-task-stat"><span>TERMINE</span><strong id="taskMeetings">0</strong><small>Erinnerungen</small></article><article class="sales-task-stat"><span>NO-SHOWS</span><strong id="taskNoShows">0</strong><small>Wiedervorlagen</small></article></div><div id="salesTaskList" class="sales-task-list"></div>`;
    const map=cockpit.querySelector('.sales-process-map');
    if(map) map.insertAdjacentElement('afterend',block); else cockpit.prepend(block);
    document.getElementById('syncSalesTasks').onclick=syncAndLoad;
    return true;
  }

  async function syncAndLoad(){
    if(!ensureUI())return;
    const btn=document.getElementById('syncSalesTasks');
    if(btn){btn.disabled=true;btn.textContent='Aktualisiert …'}
    try{
      if(dbReady()){
        await window.NXTGEN_DB.rpc('sync_sales_tasks',{p_organization_id:window.NXTGEN_ORG_ID});
        const {data,error}=await window.NXTGEN_DB.from('sales_tasks').select('*,lead:leads(company_name,contact_name,email,stage)').eq('organization_id',window.NXTGEN_ORG_ID).in('status',['open','snoozed']).order('due_at',{ascending:true}).limit(50);
        if(error)throw error;
        tasks=data||[];
      }else{
        tasks=buildDemoTasks();
      }
      render();
    }catch(error){
      console.error(error);
      const list=document.getElementById('salesTaskList');
      if(list)list.innerHTML=`<div class="sales-task-empty">Aufgaben konnten nicht geladen werden: ${esc(error.message)}</div>`;
    }finally{
      if(btn){btn.disabled=false;btn.textContent='Aufgaben aktualisieren'}
    }
  }

  function buildDemoTasks(){
    const leads=JSON.parse(localStorage.getItem('nxtgen_demo_leads')||'[]');
    const rows=[];
    leads.forEach(lead=>{
      if(lead.next_follow_up_at&&!['won','lost'].includes(lead.stage)) rows.push({id:`follow-${lead.id}`,task_type:'follow_up',title:`Follow-up: ${lead.company_name}`,description:lead.next_step||'Interessenten erneut kontaktieren',due_at:lead.next_follow_up_at,priority:new Date(lead.next_follow_up_at)<new Date()?'high':'normal',lead:{company_name:lead.company_name}});
      if(lead.meeting_at&&!['won','lost'].includes(lead.stage)) rows.push({id:`meeting-${lead.id}`,task_type:'meeting_reminder',title:`Termin vorbereiten: ${lead.company_name}`,description:lead.meeting_url||'Lead-Akte und Gesprächsunterlagen prüfen',due_at:new Date(new Date(lead.meeting_at).getTime()-60*60*1000).toISOString(),priority:'urgent',lead:{company_name:lead.company_name}});
      if(lead.meeting_status==='no_show') rows.push({id:`noshow-${lead.id}`,task_type:'no_show_recovery',title:`No-Show nachfassen: ${lead.company_name}`,description:'Neuen Termin anbieten und Grund dokumentieren',due_at:new Date(Date.now()+24*60*60*1000).toISOString(),priority:'high',lead:{company_name:lead.company_name}});
    });
    return rows.sort((a,b)=>new Date(a.due_at)-new Date(b.due_at));
  }

  function render(){
    if(!ensureUI())return;
    const now=new Date();
    const end=new Date();end.setHours(23,59,59,999);
    document.getElementById('taskToday').textContent=tasks.filter(t=>new Date(t.due_at)<=end).length;
    document.getElementById('taskOverdue').textContent=tasks.filter(t=>new Date(t.due_at)<now).length;
    document.getElementById('taskMeetings').textContent=tasks.filter(t=>t.task_type==='meeting_reminder').length;
    document.getElementById('taskNoShows').textContent=tasks.filter(t=>t.task_type==='no_show_recovery').length;
    const list=document.getElementById('salesTaskList');
    if(!tasks.length){list.innerHTML='<div class="sales-task-empty">Keine offenen Aufgaben. Der Sales-Arbeitskorb ist sauber.</div>';return}
    list.innerHTML=tasks.slice(0,12).map(task=>{const overdue=new Date(task.due_at)<now;return `<article class="sales-task-item ${overdue?'overdue':''}" data-priority="${esc(task.priority)}"><i class="sales-task-dot"></i><div class="sales-task-copy"><b>${esc(task.title)}</b><span>${esc(task.description||'')} · ${moneyDate(task.due_at)}</span></div><div class="sales-task-controls"><button data-snooze="${task.id}">Morgen</button><button class="done" data-complete="${task.id}">Erledigt</button></div></article>`}).join('');
    list.querySelectorAll('[data-complete]').forEach(btn=>btn.onclick=()=>completeTask(btn.dataset.complete));
    list.querySelectorAll('[data-snooze]').forEach(btn=>btn.onclick=()=>snoozeTask(btn.dataset.snooze));
  }

  async function completeTask(id){
    if(dbReady()){
      const {error}=await window.NXTGEN_DB.rpc('complete_sales_task',{p_task_id:id});
      if(error){alert(error.message);return}
    }else tasks=tasks.filter(t=>String(t.id)!==String(id));
    await syncAndLoad();
  }

  async function snoozeTask(id){
    const due=new Date();due.setDate(due.getDate()+1);due.setHours(9,0,0,0);
    if(dbReady()){
      const {error}=await window.NXTGEN_DB.rpc('snooze_sales_task',{p_task_id:id,p_due_at:due.toISOString()});
      if(error){alert(error.message);return}
    }else{
      const task=tasks.find(t=>String(t.id)===String(id));if(task)task.due_at=due.toISOString();
    }
    await syncAndLoad();
  }

  function boot(){
    if(ensureUI())syncAndLoad();
    else setTimeout(boot,250);
  }
  window.addEventListener('nxtgen:ready',boot);
  setTimeout(boot,600);
})();
(() => {
  const sales=document.getElementById('sales');
  if(!sales)return;
  const dbReady=()=>Boolean(window.NXTGEN_DB&&window.NXTGEN_ORG_ID&&!window.NXTGEN_DEMO_MODE);
  const money=v=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(v||0));
  const esc=v=>{const d=document.createElement('div');d.textContent=v??'';return d.innerHTML};
  let run=null;
  let currentLeadId=null;
  let mounted=false;

  function mount(){
    if(mounted)return true;
    const anchor=sales.querySelector('.discovery-ai-shell');
    if(!anchor)return false;
    const section=document.createElement('section');
    section.className='commercial-orchestrator';
    section.id='commercialOrchestrator';
    section.innerHTML=`
      <div class="co-head">
        <div><p class="eyebrow">COMMERCIAL AUTOMATION</p><h3>Commercial Prozess</h3><p>Fireflies-Erkenntnisse werden im Hintergrund in einen Angebots- und Vertragsentwurf überführt.</p></div>
        <span class="co-mode">AI PREPARED · HUMAN APPROVED</span>
      </div>
      <div id="coBody" class="co-empty">Lead auswählen, um den Prozessstatus zu sehen.</div>
      <div id="coModal" class="co-modal" aria-hidden="true">
        <div class="co-backdrop" data-co-close></div>
        <section class="co-dialog" role="dialog" aria-modal="true">
          <button class="co-close" data-co-close>×</button>
          <div><p class="eyebrow">INTERNE FREIGABE</p><h3>Angebotsentwurf bestätigen</h3><p class="co-sub">Preis, Laufzeit und Freigabevermerk werden intern geprüft. Der Kunde erhält noch nichts.</p></div>
          <div class="co-form">
            <label>SETUP NETTO<input id="coSetup" type="number" min="0" value="5000"></label>
            <label>MONATLICH NETTO<input id="coMonthly" type="number" min="0" value="3499"></label>
            <label>LAUFZEIT MONATE<input id="coTerm" type="number" min="1" value="12"></label>
            <label class="full">FREIGABEVERMERK<textarea id="coNote" placeholder="Interne Begründung oder Preisfreigabe"></textarea></label>
          </div>
          <div class="co-dialog-actions"><button class="btn" data-co-close>Abbrechen</button><button class="btn primary" id="coApprove">Entwurf freigeben</button></div>
          <div id="coMessage" class="co-message"></div>
        </section>
      </div>`;
    anchor.after(section);
    section.querySelectorAll('[data-co-close]').forEach(x=>x.onclick=closeModal);
    section.querySelector('#coApprove').onclick=approve;
    const leadSelect=document.getElementById('dcLead');
    leadSelect?.addEventListener('change',()=>{currentLeadId=leadSelect.value||null;load()});
    document.addEventListener('click',event=>{
      if(event.target?.id==='dcApprove'){
        const id=document.getElementById('dcLead')?.value;
        if(id)setTimeout(()=>prepare(id),700);
      }
    },true);
    mounted=true;
    return true;
  }

  function statusLabel(status){
    return ({draft_generated:'Entwurf erzeugt',awaiting_approval:'Interne Freigabe',approved:'Freigegeben',package_ready:'Vertragspaket bereit',failed:'Fehler',cancelled:'Abgebrochen'})[status]||status||'Noch nicht gestartet';
  }

  function statusText(status){
    return ({
      awaiting_approval:'Fireflies-Daten wurden verarbeitet. Preis und Laufzeit müssen intern bestätigt werden.',
      package_ready:'Angebot und Vertragspaket wurden im Hintergrund vorbereitet. Versand bleibt separat freigabepflichtig.',
      failed:'Der Hintergrundprozess konnte nicht abgeschlossen werden.',
      approved:'Der Entwurf wurde intern freigegeben.',
      draft_generated:'Der KI-Entwurf wird für die interne Prüfung vorbereitet.'
    })[status]||'Nach Freigabe der Gesprächsakte startet der Hintergrundprozess.';
  }

  async function load(){
    if(!mount())return;
    const body=document.getElementById('coBody');
    currentLeadId=currentLeadId||document.getElementById('dcLead')?.value||null;
    if(!currentLeadId){run=null;body.className='co-empty';body.textContent='Lead auswählen, um den Prozessstatus zu sehen.';return}
    if(!dbReady()){body.className='co-empty';body.textContent='Live-Supabase-Verbindung erforderlich.';return}
    const {data,error}=await window.NXTGEN_DB.from('ai_commercial_runs').select('*').eq('lead_id',currentLeadId).order('updated_at',{ascending:false}).limit(1).maybeSingle();
    if(error){body.className='co-empty';body.textContent=error.message;return}
    run=data||null;
    render();
  }

  function render(){
    const body=document.getElementById('coBody');
    if(!run){body.className='co-empty';body.innerHTML='<b>Noch nicht gestartet</b><span>Die Freigabe der Gesprächsakte erzeugt automatisch einen Commercial-Entwurf.</span>';return}
    body.className='co-card';
    const ready=run.status==='package_ready';
    body.innerHTML=`
      <div class="co-status-icon ${esc(run.status)}">${ready?'✓':run.status==='failed'?'!':'↗'}</div>
      <div class="co-copy"><span class="eyebrow">${esc(statusLabel(run.status)).toUpperCase()}</span><h4>${esc(run.package_name||'KI-empfohlene Lösung')}</h4><p>${esc(statusText(run.status))}</p></div>
      <div class="co-values"><span>Setup <b>${run.setup_fee!=null?money(run.setup_fee):'offen'}</b></span><span>Monatlich <b>${run.monthly_fee!=null?money(run.monthly_fee):'offen'}</b></span><span>Laufzeit <b>${run.term_months?`${run.term_months} Monate`:'offen'}</b></span></div>
      <div class="co-actions">${run.status==='awaiting_approval'?'<button class="btn primary" id="coOpenApproval">Intern freigeben</button>':''}${ready?'<span class="co-ready">Angebot & Vertrag vorbereitet</span>':''}${run.error_message?`<small>${esc(run.error_message)}</small>`:''}</div>`;
    body.querySelector('#coOpenApproval')?.addEventListener('click',openModal);
  }

  async function prepare(leadId){
    if(!dbReady())return;
    currentLeadId=leadId;
    const body=document.getElementById('coBody');
    if(body){body.className='co-empty';body.textContent='Commercial-Entwurf wird im Hintergrund vorbereitet …'}
    const {data,error}=await window.NXTGEN_DB.rpc('prepare_ai_commercial_run',{p_lead_id:leadId});
    if(error){if(body)body.textContent=error.message;return}
    run=data;
    render();
  }

  function openModal(){
    if(!run)return;
    document.getElementById('coSetup').value=run.setup_fee??5000;
    document.getElementById('coMonthly').value=run.monthly_fee??3499;
    document.getElementById('coTerm').value=run.term_months??12;
    document.getElementById('coNote').value=run.approval_note||'';
    const modal=document.getElementById('coModal');modal.classList.add('open');modal.setAttribute('aria-hidden','false');
  }
  function closeModal(){const modal=document.getElementById('coModal');modal?.classList.remove('open');modal?.setAttribute('aria-hidden','true')}

  async function approve(){
    if(!run||!dbReady())return;
    const btn=document.getElementById('coApprove');const message=document.getElementById('coMessage');
    const setup=Number(document.getElementById('coSetup').value||0);
    const monthly=Number(document.getElementById('coMonthly').value||0);
    const term=Number(document.getElementById('coTerm').value||0);
    const note=document.getElementById('coNote').value.trim();
    if(term<1){message.textContent='Die Laufzeit muss mindestens einen Monat betragen.';return}
    btn.disabled=true;btn.textContent='Wird vorbereitet …';message.textContent='';
    const {data,error}=await window.NXTGEN_DB.rpc('approve_ai_commercial_run',{p_run_id:run.id,p_setup_fee:setup,p_monthly_fee:monthly,p_term_months:term,p_approval_note:note||null});
    btn.disabled=false;btn.textContent='Entwurf freigeben';
    if(error){message.textContent=error.message;return}
    run=data;closeModal();render();
    window.dispatchEvent(new CustomEvent('nxtgen:commercial-updated',{detail:{leadId:currentLeadId,run}}));
  }

  const observer=new MutationObserver(()=>{if(mount())load()});
  observer.observe(document.body,{childList:true,subtree:true});
  window.addEventListener('nxtgen:ready',()=>setTimeout(load,700));
  setTimeout(()=>{mount();load()},1000);
})();
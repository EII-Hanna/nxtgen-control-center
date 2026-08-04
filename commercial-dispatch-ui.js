(() => {
  const sales=document.getElementById('sales'); if(!sales)return;
  const dbReady=()=>Boolean(window.NXTGEN_DB&&window.NXTGEN_ORG_ID&&!window.NXTGEN_DEMO_MODE);
  const esc=v=>{const d=document.createElement('div');d.textContent=v??'';return d.innerHTML};
  let leadId=null,run=null,mounted=false;

  function mount(){
    if(mounted)return true;
    const anchor=document.getElementById('commercialOrchestrator');
    if(!anchor)return false;
    const section=document.createElement('section');
    section.id='commercialDispatch';section.className='commercial-dispatch';
    section.innerHTML=`<div class="cd-head"><div><p class="eyebrow">SEND APPROVAL</p><h3>Versand & Signatur</h3><p>Nur Freigabe und Status bleiben sichtbar. Dokumente, Versand und Finance laufen im Hintergrund.</p></div><span class="cd-badge">HUMAN GATE</span></div><div id="cdBody" class="cd-empty">Vertragspaket noch nicht bereit.</div><div id="cdModal" class="cd-modal" aria-hidden="true"><div class="cd-backdrop" data-cd-close></div><section class="cd-dialog"><button class="cd-close" data-cd-close>×</button><p class="eyebrow">LETZTE INTERNE PRÜFUNG</p><h3>Vertragspaket versenden</h3><p>Empfänger, Betreff und Nachricht prüfen. Erst danach wird der Versandauftrag erzeugt.</p><label>BETREFF<input id="cdSubject" value="Ihr Angebot und Vertragspaket von NXTGENdigital"></label><label>NACHRICHT<textarea id="cdMessage" rows="7"></textarea></label><div class="cd-actions"><button class="btn" data-cd-close>Abbrechen</button><button class="btn primary" id="cdApproveSend">Versand freigeben</button></div><div id="cdFeedback" class="cd-feedback"></div></section></div>`;
    anchor.after(section);
    section.querySelectorAll('[data-cd-close]').forEach(x=>x.onclick=closeModal);
    section.querySelector('#cdApproveSend').onclick=approveSend;
    document.getElementById('dcLead')?.addEventListener('change',e=>{leadId=e.target.value||null;load()});
    window.addEventListener('nxtgen:commercial-updated',()=>load());
    mounted=true;return true;
  }

  const labels={not_requested:'Noch nicht angefordert',awaiting_send_approval:'Versandfreigabe offen',queued:'Versand eingeplant',sent:'Versendet',failed:'Versandfehler',cancelled:'Abgebrochen'};

  async function load(){
    if(!mount())return;
    const body=document.getElementById('cdBody');leadId=leadId||document.getElementById('dcLead')?.value||null;
    if(!leadId){run=null;body.className='cd-empty';body.textContent='Lead auswählen, um den Versandstatus zu sehen.';return}
    if(!dbReady()){body.className='cd-empty';body.textContent='Live-Supabase-Verbindung erforderlich.';return}
    let {data,error}=await window.NXTGEN_DB.from('ai_commercial_runs').select('id,lead_id,status,package_id,dispatch_status,dispatch_job_id,dispatch_error,send_approved_at,sent_at,metadata').eq('lead_id',leadId).order('updated_at',{ascending:false}).limit(1).maybeSingle();
    if(error){body.className='cd-empty';body.textContent=error.message;return}
    run=data||null;
    if(run?.id&&['queued','sent','failed'].includes(run.dispatch_status)){
      const sync=await window.NXTGEN_DB.rpc('sync_commercial_dispatch_status',{p_run_id:run.id});if(!sync.error)run=sync.data;
    }
    render();
  }

  function render(){
    const body=document.getElementById('cdBody');
    if(!run||run.status!=='package_ready'){body.className='cd-empty';body.innerHTML='<b>Commercial-Paket noch nicht bereit</b><span>Nach interner Preisfreigabe erscheint hier nur noch der Versandstatus.</span>';return}
    const status=run.dispatch_status||'not_requested';
    body.className='cd-card';
    body.innerHTML=`<div class="cd-icon ${esc(status)}">${status==='sent'?'✓':status==='failed'?'!':'↗'}</div><div class="cd-copy"><span class="eyebrow">${esc((labels[status]||status).toUpperCase())}</span><h4>${status==='sent'?'Vertragspaket beim Kunden':status==='queued'?'Versand wird ausgeführt':'Vertragspaket bereit'}</h4><p>${status==='sent'?'Signatur und Zahlung werden automatisch weiterverfolgt.':status==='queued'?'Der Versandauftrag wurde an die Ausführungsschicht übergeben.':'Eine letzte interne Versandfreigabe ist erforderlich.'}</p></div><div class="cd-actions-inline">${['not_requested','awaiting_send_approval','failed'].includes(status)?'<button class="btn primary" id="cdOpen">Versand prüfen</button>':''}${status==='queued'?'<button class="btn" id="cdRefresh">Status prüfen</button>':''}${status==='sent'?'<span class="cd-ready">VERSENDET</span>':''}${run.dispatch_error?`<small>${esc(run.dispatch_error)}</small>`:''}</div>`;
    body.querySelector('#cdOpen')?.addEventListener('click',openModal);
    body.querySelector('#cdRefresh')?.addEventListener('click',load);
  }

  function openModal(){
    const name=run?.metadata?.contact_name||'';
    document.getElementById('cdMessage').value=`Hallo ${name},\n\nanbei erhalten Sie Ihr Angebot inklusive Vertragsunterlagen zur Prüfung und Online-Unterzeichnung.\n\nBeste Grüße\nNXTGENdigital`;
    const modal=document.getElementById('cdModal');modal.classList.add('open');modal.setAttribute('aria-hidden','false');
  }
  function closeModal(){const modal=document.getElementById('cdModal');modal?.classList.remove('open');modal?.setAttribute('aria-hidden','true')}

  async function approveSend(){
    if(!run||!dbReady())return;
    const btn=document.getElementById('cdApproveSend'),feedback=document.getElementById('cdFeedback');
    btn.disabled=true;btn.textContent='Wird eingeplant …';feedback.textContent='';
    const subject=document.getElementById('cdSubject').value.trim();
    const message=document.getElementById('cdMessage').value.trim();
    const {data,error}=await window.NXTGEN_DB.rpc('approve_and_queue_commercial_dispatch',{p_run_id:run.id,p_subject:subject,p_message:message});
    btn.disabled=false;btn.textContent='Versand freigeben';
    if(error){feedback.textContent=error.message;return}
    run=data;closeModal();render();
  }

  const observer=new MutationObserver(()=>{if(mount())load()});observer.observe(document.body,{childList:true,subtree:true});
  window.addEventListener('nxtgen:ready',()=>setTimeout(load,900));setTimeout(()=>{mount();load()},1200);
})();
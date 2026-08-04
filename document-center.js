(() => {
  const waitForSales=()=>new Promise(resolve=>{const timer=setInterval(()=>{const sales=document.getElementById('sales');if(sales&&sales.querySelector('.offer-shell')){clearInterval(timer);resolve(sales)}},120)});
  const dbReady=()=>Boolean(window.NXTGEN_DB&&window.NXTGEN_ORG_ID&&!window.NXTGEN_DEMO_MODE);
  const esc=v=>{const d=document.createElement('div');d.textContent=v??'';return d.innerHTML};
  let packages=[];

  async function init(){
    const sales=await waitForSales();
    const section=document.createElement('section');
    section.className='document-center';
    section.innerHTML=`<div class="document-center-head"><div><p class="eyebrow">DOKUMENTE · SIGNATUR · ZAHLUNG</p><h2>Vertragspakete</h2><p>Angebot, Vertrag, AVV und AGB zentral versenden, Signatur verfolgen und Zahlungslink übergeben.</p></div><button class="btn" id="reloadPackages">Aktualisieren</button></div><div id="documentList" class="document-list"></div><div id="docMessage" class="doc-message"></div>`;
    sales.appendChild(section);
    document.getElementById('reloadPackages').onclick=load;
    window.addEventListener('nxtgen:ready',load);
    setTimeout(load,500);
  }

  function message(text){document.getElementById('docMessage').textContent=text||''}
  async function load(){
    const list=document.getElementById('documentList'); if(!list)return;
    if(!dbReady()){list.innerHTML='<div class="document-empty">Live-Datenbank nicht aktiv. Vertragspakete erscheinen nach dem Supabase-Login.</div>';return}
    const {data,error}=await window.NXTGEN_DB.from('contract_packages').select('id,package_name,status,signer_name,signer_email,signing_url,signed_at,sent_at,payment_provider,payment_url,payment_status,created_at,offer_id').eq('organization_id',window.NXTGEN_ORG_ID).order('created_at',{ascending:false}).limit(30);
    if(error){list.innerHTML=`<div class="document-empty">${esc(error.message)}</div>`;return}
    packages=data||[]; render();
  }

  function render(){
    const list=document.getElementById('documentList');
    if(!packages.length){list.innerHTML='<div class="document-empty">Noch kein Vertragspaket vorhanden. Erstelle zuerst ein Angebot und klicke „Vertragspaket vorbereiten“.</div>';return}
    list.innerHTML=packages.map(p=>`<article class="document-row" data-id="${p.id}"><div><strong>${esc(p.package_name)}</strong><small>${esc(p.signer_name||'Ohne Unterzeichner')} · ${esc(p.signer_email||'E-Mail fehlt')}</small></div><div><span class="doc-status">${esc(p.status)}</span><small>${p.sent_at?'Versendet: '+new Date(p.sent_at).toLocaleDateString('de-DE'):'Noch nicht versendet'}</small></div><div><b>${esc(p.payment_provider||'Zahlung offen')}</b><small>${esc(p.payment_status||'not_requested')}</small></div><div class="doc-actions"><button data-action="preview">Vorschau</button><button data-action="send" class="primary">Versand vorbereiten</button><button data-action="signed">Signiert</button></div><div class="doc-payment"><select data-payment-provider><option value="copecart" ${p.payment_provider==='copecart'?'selected':''}>CopeCart</option><option value="stripe" ${p.payment_provider==='stripe'?'selected':''}>Stripe</option></select><input data-payment-url value="${esc(p.payment_url||'')}" placeholder="Zahlungslink einfügen"><button data-action="payment">Link speichern</button></div></article>`).join('');
    list.querySelectorAll('[data-action]').forEach(btn=>btn.onclick=()=>handle(btn.closest('[data-id]'),btn.dataset.action));
  }

  async function handle(row,action){
    const id=row.dataset.id; const p=packages.find(x=>x.id===id); if(!p)return;
    try{
      message('');
      if(action==='preview'){
        const {data,error}=await window.NXTGEN_DB.from('contract_documents').select('document_type,rendered_html,generated_pdf_path,sort_order').eq('package_id',id).order('sort_order');
        if(error)throw error;
        const popup=window.open('','_blank');
        popup.document.write(`<title>${esc(p.package_name)}</title><style>body{font-family:Arial,sans-serif;padding:32px;background:#f4f4f4}.doc{background:white;padding:32px;margin:0 auto 24px;max-width:900px}h4{text-transform:uppercase;color:#777}</style>${(data||[]).map(d=>`<div class="doc"><h4>${esc(d.document_type)}</h4>${d.rendered_html||'<p>Template wird nach Upload gerendert.</p>'}</div>`).join('')}`);popup.document.close();
      }
      if(action==='send'){
        const subject=`Ihr Angebot und Vertragspaket von NXTGENdigital`;
        const body=`Hallo ${p.signer_name||''},\n\nanbei erhalten Sie Ihr Angebot inklusive Vertragsunterlagen zur Prüfung und Online-Unterzeichnung.\n\nBeste Grüße\nNXTGENdigital`;
        const {data,error}=await window.NXTGEN_DB.rpc('queue_contract_package_email',{p_package_id:id,p_subject:subject,p_message:body});if(error)throw error;
        message(`Versandauftrag ${String(data).slice(0,8)} wurde erstellt. Die tatsächliche E-Mail wird über den angebundenen E-Mail-/n8n-Connector ausgeführt.`);
      }
      if(action==='signed'){
        const signingUrl=prompt('Optional: Signatur- oder Abschlusslink einfügen',p.signing_url||'');
        const {error}=await window.NXTGEN_DB.rpc('mark_contract_signed',{p_package_id:id,p_signing_url:signingUrl||null});if(error)throw error;
        message('Vertrag wurde als unterschrieben markiert. Der Zahlungslink kann jetzt versendet werden.');
      }
      if(action==='payment'){
        const provider=row.querySelector('[data-payment-provider]').value;
        const url=row.querySelector('[data-payment-url]').value.trim();
        if(!/^https?:\/\//i.test(url))throw new Error('Bitte einen vollständigen CopeCart- oder Stripe-Link eintragen.');
        const {error}=await window.NXTGEN_DB.from('contract_packages').update({payment_provider:provider,payment_url:url,payment_status:'ready',updated_at:new Date().toISOString()}).eq('id',id);if(error)throw error;
        message('Zahlungslink wurde am Vertragspaket gespeichert.');
      }
      await load();
    }catch(e){message(e.message||'Aktion fehlgeschlagen.')}
  }
  init();
})();
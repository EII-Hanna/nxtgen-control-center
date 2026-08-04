(() => {
  const host=document.getElementById('analytics'); if(!host)return;
  const esc=v=>{const d=document.createElement('div');d.textContent=v??'';return d.innerHTML};
  const money=v=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(v||0));
  const dbReady=()=>Boolean(window.NXTGEN_DB&&window.NXTGEN_ORG_ID&&!window.NXTGEN_DEMO_MODE);
  let events=[];

  function mount(){
    const shell=document.createElement('section');shell.className='payment-auto-shell';shell.id='paymentAutomation';
    shell.innerHTML=`<div class="payment-auto-head"><div><p class="eyebrow">PAYMENT AUTOMATION</p><h3>Stripe & CopeCart Event Cockpit</h3><p>Zahlungseingänge, Rechnungszuordnung und Activation Gates bleiben vollständig nachvollziehbar.</p></div><span class="payment-auto-pill">SIGNED · VERIFIED · AUDITABLE</span></div><div id="paymentAutoBody" class="payment-auto-empty">Zahlungsereignisse werden geladen …</div>`;
    host.appendChild(shell);
  }

  async function load(){
    const body=document.getElementById('paymentAutoBody');if(!body)return;
    if(!dbReady()){body.className='payment-auto-empty';body.textContent='Live-Supabase-Verbindung erforderlich.';return}
    const {data,error}=await window.NXTGEN_DB.from('backoffice_payment_webhooks')
      .select('*,invoice:backoffice_invoices(invoice_number,status,total_amount),contract:backoffice_contracts(contract_number,title)')
      .eq('organization_id',window.NXTGEN_ORG_ID).order('created_at',{ascending:false}).limit(40);
    if(error){body.className='payment-auto-empty';body.textContent=error.message;return}
    events=data||[];render();
  }

  function render(){
    const body=document.getElementById('paymentAutoBody');body.className='';
    const processed=events.filter(x=>x.status==='processed');
    const failed=events.filter(x=>x.status==='failed');
    const volume=processed.reduce((s,x)=>s+Number(x.amount||0),0);
    body.innerHTML=`<div class="payment-auto-grid"><article class="payment-auto-kpi"><span>EVENTS</span><strong>${events.length}</strong><small>letzte 40</small></article><article class="payment-auto-kpi"><span>VERARBEITET</span><strong>${processed.length}</strong><small>erfolgreich zugeordnet</small></article><article class="payment-auto-kpi"><span>ZAHLUNGSVOLUMEN</span><strong>${money(volume)}</strong><small>verarbeitete Events</small></article><article class="payment-auto-kpi"><span>FEHLER</span><strong>${failed.length}</strong><small>manuell prüfen</small></article></div><div class="payment-auto-list">${events.map(eventCard).join('')||'<div class="payment-auto-empty">Noch keine Zahlungsereignisse vorhanden.</div>'}</div>`;
  }

  function eventCard(e){
    return `<article class="payment-auto-event"><div><b>${esc(e.invoice?.invoice_number||e.external_event_id)}</b><small>${esc(e.contract?.contract_number||'Noch keinem Vertrag zugeordnet')}</small></div><div><b>${esc(e.provider)}</b><small>${esc(e.event_type)}</small></div><div><b>${e.amount!=null?money(e.amount):'—'}</b><small>${esc(e.currency||'')}</small></div><div><span class="payment-auto-status ${esc(e.status)}">${esc(e.status)}</span><small>${e.error_message?esc(e.error_message):new Date(e.created_at).toLocaleString('de-DE')}</small></div></article>`;
  }

  mount();window.addEventListener('nxtgen:ready',load);window.addEventListener('nxtgen:payment-updated',load);setTimeout(load,1300);
})();
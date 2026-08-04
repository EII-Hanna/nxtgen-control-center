(() => {
  const host=document.getElementById('analytics'); if(!host)return;
  const esc=v=>{const d=document.createElement('div');d.textContent=v??'';return d.innerHTML};
  const money=v=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(v||0));
  const dbReady=()=>Boolean(window.NXTGEN_DB&&window.NXTGEN_ORG_ID&&!window.NXTGEN_DEMO_MODE);
  let gates=[],plans=[],contracts=[],invoices=[];

  function mount(){
    host.classList.remove('empty');
    const shell=document.createElement('section');shell.className='commercial-finance-shell';shell.id='commercialFinance';
    shell.innerHTML=`<div class="commercial-finance-head"><div><p class="eyebrow">COMMERCIAL → FINANCE → ACTIVATION</p><h3>Signed-to-Cash Control</h3><p>Unterschriebene Verträge werden in Vertragskonto, Setup-Rechnung, Billing-Plan und zahlungsgesteuerte Aktivierung überführt.</p></div><span class="commercial-finance-badge">PAYMENT-GATED · HUMAN RELEASE</span></div><div id="commercialFinanceBody" class="commercial-finance-empty">Commercial-to-Finance wird geladen …</div>`;
    host.prepend(shell);
  }

  async function load(){
    if(!dbReady())return renderEmpty('Live-Supabase-Verbindung erforderlich.');
    const [g,p,c,i]=await Promise.all([
      window.NXTGEN_DB.from('backoffice_activation_gates').select('*,client:clients(company_name),contract:backoffice_contracts(contract_number,title),invoice:backoffice_invoices(invoice_number,status,total_amount,paid_amount,due_date,payment_link)').eq('organization_id',window.NXTGEN_ORG_ID).order('created_at',{ascending:false}),
      window.NXTGEN_DB.from('backoffice_billing_plans').select('*,client:clients(company_name),contract:backoffice_contracts(contract_number,title)').eq('organization_id',window.NXTGEN_ORG_ID).order('created_at',{ascending:false}),
      window.NXTGEN_DB.from('backoffice_contracts').select('id,client_id,contract_number,title,status,setup_fee,recurring_fee,next_billing_date,source_package_id,client:clients(company_name)').eq('organization_id',window.NXTGEN_ORG_ID).order('created_at',{ascending:false}),
      window.NXTGEN_DB.from('backoffice_invoices').select('id,client_id,contract_id,invoice_number,status,total_amount,paid_amount,due_date,payment_link,client:clients(company_name)').eq('organization_id',window.NXTGEN_ORG_ID).order('created_at',{ascending:false}).limit(50)
    ]);
    if(g.error||p.error||c.error||i.error)return renderEmpty((g.error||p.error||c.error||i.error).message);
    gates=g.data||[];plans=p.data||[];contracts=c.data||[];invoices=i.data||[];render();
  }

  function renderEmpty(text){const el=document.getElementById('commercialFinanceBody');if(el){el.className='commercial-finance-empty';el.textContent=text}}
  function render(){
    const body=document.getElementById('commercialFinanceBody');body.className='commercial-finance-body';
    const waiting=gates.filter(x=>x.status==='waiting_payment').length;
    const ready=gates.filter(x=>['ready','payment_received'].includes(x.status)).length;
    const released=gates.filter(x=>x.status==='released').length;
    const recurring=plans.filter(x=>x.status==='active').reduce((s,x)=>s+Number(x.recurring_amount||0),0);
    body.innerHTML=`<div class="commercial-finance-kpis"><article class="commercial-finance-kpi"><span>WARTET AUF ZAHLUNG</span><strong>${waiting}</strong><small>Activation Gates</small></article><article class="commercial-finance-kpi"><span>BEREIT ZUR FREIGABE</span><strong>${ready}</strong><small>Setup bezahlt</small></article><article class="commercial-finance-kpi"><span>FREIGEGEBEN</span><strong>${released}</strong><small>Onboarding/Delivery</small></article><article class="commercial-finance-kpi"><span>GEPLANTES MRR</span><strong>${money(recurring)}</strong><small>aktive Billing-Pläne</small></article></div><div class="commercial-finance-card"><h4>Automatischer Revenue Flow</h4><div class="commercial-finance-flow"><div class="commercial-finance-step"><b>1 · Signiert</b><small>Vertragspaket besitzt einen Signaturzeitpunkt.</small></div><div class="commercial-finance-step"><b>2 · Vertrag</b><small>Backoffice-Vertrag und Laufzeit entstehen.</small></div><div class="commercial-finance-step"><b>3 · Billing</b><small>Setup-Rechnung und Retainer-Plan werden erzeugt.</small></div><div class="commercial-finance-step"><b>4 · Zahlung</b><small>Payment Event setzt den Gate auf bereit.</small></div><div class="commercial-finance-step"><b>5 · Freigabe</b><small>Mensch aktiviert Onboarding oder Delivery.</small></div></div></div><div class="commercial-finance-grid" style="margin-top:16px"><section class="commercial-finance-card"><h4>Activation Gates</h4>${gates.length?gates.map(gateRow).join(''):'<div class="commercial-finance-empty">Noch keine signierten Verträge provisioniert.</div>'}</section><aside class="commercial-finance-card"><h4>Billing-Pläne</h4>${plans.length?plans.slice(0,12).map(planRow).join(''):'<div class="commercial-finance-empty">Noch keine wiederkehrenden Billing-Pläne.</div>'}<div class="commercial-finance-note">Die tatsächliche Zahlungsabwicklung bleibt beim hinterlegten Anbieter. NXTGEN führt Vertrag, Rechnungsstatus, Freigabe und Audit-Trail.</div></aside></div>`;
    body.querySelectorAll('[data-refresh-gate]').forEach(b=>b.onclick=()=>refreshGate(b.dataset.refreshGate));
    body.querySelectorAll('[data-release-gate]').forEach(b=>b.onclick=()=>releaseGate(b.dataset.releaseGate));
    body.querySelectorAll('[data-run-billing]').forEach(b=>b.onclick=runBilling);
  }

  function gateRow(g){
    const open=Math.max(0,Number(g.invoice?.total_amount||0)-Number(g.invoice?.paid_amount||0));
    return `<div class="commercial-finance-row"><div><b>${esc(g.client?.company_name||'Kunde')}</b><small>${esc(g.contract?.contract_number||'Vertrag')} · ${esc(g.invoice?.invoice_number||'Keine Setup-Rechnung')}</small></div><div><span class="commercial-finance-status ${esc(g.status)}">${esc(g.status)}</span><small>${g.invoice?.due_date?'Fällig '+new Date(g.invoice.due_date).toLocaleDateString('de-DE'):'Keine Fälligkeit'}</small></div><div><b>${money(open)}</b><small>offener Setup-Betrag</small></div><div class="commercial-finance-actions"><button data-refresh-gate="${g.setup_invoice_id||''}" ${!g.setup_invoice_id?'disabled':''}>Prüfen</button><button class="primary" data-release-gate="${g.id}" ${!['ready','payment_received'].includes(g.status)?'disabled':''}>Freigeben</button></div></div>`;
  }
  function planRow(p){return `<div class="commercial-finance-row"><div><b>${esc(p.client?.company_name||'Kunde')}</b><small>${esc(p.contract?.contract_number||'Vertrag')}</small></div><div><span class="commercial-finance-status ${esc(p.status)}">${esc(p.status)}</span><small>Nächster Lauf ${p.next_run_date?new Date(p.next_run_date).toLocaleDateString('de-DE'):'—'}</small></div><div><b>${money(p.recurring_amount)}</b><small>${esc(p.billing_cycle)}</small></div><div class="commercial-finance-actions"><button data-run-billing>Fällige Läufe</button></div></div>`}

  async function refreshGate(invoiceId){
    if(!invoiceId)return;const {error}=await window.NXTGEN_DB.rpc('refresh_activation_gate_for_invoice',{p_invoice_id:invoiceId});if(error)return alert(error.message);await load();
  }
  async function releaseGate(id){
    const ok=confirm('Onboarding/Delivery für diesen Kunden jetzt freigeben?');if(!ok)return;
    const {error}=await window.NXTGEN_DB.rpc('release_commercial_activation',{p_gate_id:id});if(error)return alert(error.message);window.dispatchEvent(new CustomEvent('nxtgen:commercial-activated'));await load();
  }
  async function runBilling(){
    const {data,error}=await window.NXTGEN_DB.rpc('generate_due_recurring_invoices',{});if(error)return alert(error.message);alert(`${data||0} wiederkehrende Rechnung(en) erzeugt.`);await load();
  }

  mount();window.addEventListener('nxtgen:ready',load);window.addEventListener('nxtgen:finance-updated',load);setTimeout(load,1400);
})();
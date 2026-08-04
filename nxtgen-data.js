(() => {
  const money=v=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(v||0));

  function loadAsset(type,path){
    if(type==='style'){
      if(document.querySelector(`link[href="${path}"]`)) return;
      const link=document.createElement('link'); link.rel='stylesheet'; link.href=path; document.head.appendChild(link);
      return;
    }
    if(document.querySelector(`script[src="${path}"]`)) return;
    const script=document.createElement('script'); script.src=path; script.defer=true; document.body.appendChild(script);
  }

  loadAsset('style','./lead-crm.css');
  loadAsset('style','./offer-builder.css');
  loadAsset('style','./integrations.css');
  loadAsset('style','./sales-task-center.css');
  loadAsset('style','./discovery.css');
  loadAsset('style','./document-center.css');
  loadAsset('style','./onboarding.css');
  loadAsset('style','./delivery-lifecycle.css');
  loadAsset('style','./client-intelligence.css');
  loadAsset('style','./fireflies-intelligence-ui.css');
  loadAsset('style','./kickoff-delivery.css');
  loadAsset('style','./fulfillment-board.css');
  loadAsset('style','./automation-execution-ui.css');
  loadAsset('style','./weekly-accountability.css');
  loadAsset('script','./lead-crm.js');
  loadAsset('script','./offer-builder.js');
  loadAsset('script','./integrations.js');
  loadAsset('script','./sales-task-center.js');
  loadAsset('script','./discovery.js');
  loadAsset('script','./document-center.js');
  loadAsset('script','./onboarding.js');
  loadAsset('script','./delivery-lifecycle.js');
  loadAsset('script','./client-intelligence.js');
  loadAsset('script','./fireflies-intelligence-ui.js');
  loadAsset('script','./kickoff-delivery.js');
  loadAsset('script','./fulfillment-board.js');
  loadAsset('script','./automation-execution-ui.js');
  loadAsset('script','./weekly-accountability.js');

  async function loadDashboard(){
    const db=window.NXTGEN_DB, org=window.NXTGEN_ORG_ID; if(!db||!org)return;
    const [{count:clients},{data:subs},{data:projectRows}] = await Promise.all([
      db.from('clients').select('*',{count:'exact',head:true}).eq('organization_id',org).eq('status','active'),
      db.from('subscriptions').select('monthly_price,status,client:clients!inner(organization_id)').eq('client.organization_id',org).eq('status','active'),
      db.from('delivery_projects').select('id,status').eq('organization_id',org).neq('status','completed')
    ]);
    const cards=document.querySelectorAll('[data-kpi]');
    const values={clients:clients||0,mrr:money((subs||[]).reduce((s,x)=>s+Number(x.monthly_price||0),0)),modules:(subs||[]).length,projects:(projectRows||[]).length};
    cards.forEach(card=>{if(values[card.dataset.kpi]!==undefined)card.textContent=values[card.dataset.kpi]});
  }
  window.addEventListener('nxtgen:ready',loadDashboard);
})();
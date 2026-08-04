(() => {
  const money=v=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(v||0));

  function loadOfferBuilder(){
    if(!document.querySelector('link[href="./offer-builder.css"]')){
      const link=document.createElement('link'); link.rel='stylesheet'; link.href='./offer-builder.css'; document.head.appendChild(link);
    }
    if(!document.querySelector('script[src="./offer-builder.js"]')){
      const script=document.createElement('script'); script.src='./offer-builder.js'; script.defer=true; document.body.appendChild(script);
    }
  }

  async function loadDashboard(){
    const db=window.NXTGEN_DB, org=window.NXTGEN_ORG_ID; if(!db||!org)return;
    const [{count:clients},{data:subs},{count:projects}] = await Promise.all([
      db.from('clients').select('*',{count:'exact',head:true}).eq('organization_id',org).eq('status','active'),
      db.from('subscriptions').select('monthly_price,status,client:clients!inner(organization_id)').eq('client.organization_id',org).eq('status','active'),
      db.from('projects').select('*',{count:'exact',head:true}).eq('organization_id',org).neq('status','completed')
    ]);
    const cards=document.querySelectorAll('[data-kpi]');
    const values={clients:clients||0,mrr:money((subs||[]).reduce((s,x)=>s+Number(x.monthly_price||0),0)),modules:(subs||[]).length,projects:projects||0};
    cards.forEach(card=>{if(values[card.dataset.kpi]!==undefined)card.textContent=values[card.dataset.kpi]});
  }

  loadOfferBuilder();
  window.addEventListener('nxtgen:ready',loadDashboard);
})();
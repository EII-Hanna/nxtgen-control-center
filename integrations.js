(() => {
  const host=document.getElementById('automations');
  if(!host) return;
  host.classList.remove('empty');

  const fallback=[
    {key:'slack',name:'Slack',category:'communication',auth_type:'oauth2',description:'Benachrichtigungen, Freigaben und Aufgabenübergaben.',icon:'S',capabilities:['messages','channels','approvals']},
    {key:'notion',name:'Notion',category:'knowledge',auth_type:'oauth2',description:'Wissensdatenbank, SOPs und Dokumentensynchronisation.',icon:'N',capabilities:['pages','databases','knowledge_sync']},
    {key:'n8n',name:'n8n',category:'automation',auth_type:'api_key',description:'Zentrale Workflow- und Event-Automatisierung.',icon:'n8n',capabilities:['webhooks','workflows','executions']},
    {key:'google-calendar',name:'Google Calendar',category:'calendar',auth_type:'oauth2',description:'Erstgespräche, Kick-offs und Reviews.',icon:'G',capabilities:['events','availability','reminders']},
    {key:'google-mail',name:'Gmail / Workspace',category:'email',auth_type:'oauth2',description:'E-Mail-Kommunikation, Follow-ups und Dokumentversand.',icon:'G',capabilities:['send','threads','labels']},
    {key:'microsoft-365',name:'Microsoft 365',category:'email',auth_type:'oauth2',description:'Outlook, Kalender, Teams und Dateien.',icon:'M',capabilities:['mail','calendar','teams']},
    {key:'stripe',name:'Stripe',category:'payments',auth_type:'webhook',description:'Zahlungslinks und Zahlungsstatus.',icon:'S',capabilities:['payment_links','payments','webhooks']},
    {key:'copecart',name:'CopeCart',category:'payments',auth_type:'webhook',description:'Checkout-Links und Zahlungsereignisse.',icon:'C',capabilities:['checkout_links','payments','webhooks']},
    {key:'openai',name:'OpenAI',category:'knowledge',auth_type:'api_key',description:'KI-Assistent, Zusammenfassungen und Wissenszugriff.',icon:'AI',capabilities:['chat','embeddings','analysis']},
    {key:'custom-webhook',name:'Custom Webhook',category:'custom',auth_type:'webhook',description:'Beliebige externe Systeme über signierte Webhooks anbinden.',icon:'W',capabilities:['inbound','outbound']}
  ];
  let catalog=fallback,connections=[];

  host.innerHTML=`<div class="integrations-center">
    <div class="integrations-head"><div><p class="eyebrow">PLATFORM LAYER · INTEGRATIONS</p><h2>Integrationen & Event Hub</h2><p>NXTGEN verbindet Kommunikation, Wissen, Automationen, Zahlungen und operative Systeme über eine zentrale, erweiterbare Connector-Schicht.</p></div><button class="btn primary" id="newWebhook">+ Webhook anlegen</button></div>
    <div class="integration-kpis"><article class="integration-kpi"><span>VERFÜGBARE CONNECTORS</span><strong id="intAvailable">0</strong><small>zentraler Katalog</small></article><article class="integration-kpi"><span>VERBUNDEN</span><strong id="intConnected">0</strong><small>aktive Accounts</small></article><article class="integration-kpi"><span>WEBHOOKS</span><strong id="intWebhooks">0</strong><small>Inbound & Outbound</small></article><article class="integration-kpi"><span>EVENTS HEUTE</span><strong id="intEvents">0</strong><small>erfolgreich verarbeitet</small></article></div>
    <div class="integration-layout"><section class="integration-grid" id="integrationGrid"></section><aside class="integration-side"><p class="eyebrow">EVENT-ARCHITEKTUR</p><h3>Ein System, viele Tools</h3><p>Jedes Modul sendet standardisierte Events. Connectoren reagieren darauf, ohne dass Sales, Onboarding oder Fulfillment fest an einzelne Anbieter gekoppelt werden.</p><div class="event-flow"><div class="event-step"><b>1 · Business Event</b><span>lead.created, meeting.booked, contract.signed, payment.paid</span></div><div class="event-step"><b>2 · Event Router</b><span>NXTGEN prüft Regeln, Mandant und Zielsystem.</span></div><div class="event-step"><b>3 · Connector</b><span>n8n, Slack, Notion, E-Mail, Payment oder Custom API.</span></div><div class="event-step"><b>4 · Log & Retry</b><span>Status, Fehler und Wiederholungen bleiben nachvollziehbar.</span></div></div><div class="security-note"><b>Sicherheitsprinzip:</b> API-Keys und OAuth-Tokens werden nicht offen in Browser oder Tabellen gespeichert. NXTGEN speichert nur Secret-Referenzen und Verbindungsmetadaten.</div></aside></div>
  </div>`;

  const escape=v=>{const d=document.createElement('div');d.textContent=v??'';return d.innerHTML};
  const connectionFor=key=>connections.find(x=>x.integration_key===key&&x.status==='connected');
  function render(){
    document.getElementById('intAvailable').textContent=catalog.length;
    document.getElementById('intConnected').textContent=connections.filter(x=>x.status==='connected').length;
    document.getElementById('integrationGrid').innerHTML=catalog.map(item=>{
      const connection=connectionFor(item.key),connected=Boolean(connection);
      const caps=Array.isArray(item.capabilities)?item.capabilities:[];
      return `<article class="integration-card"><div class="integration-card-top"><div class="integration-icon">${escape(item.icon||item.name.slice(0,1))}</div><span class="integration-state ${connected?'connected':''}">${connected?'Verbunden':'Bereit'}</span></div><div><h3>${escape(item.name)}</h3><p>${escape(item.description||'')}</p></div><div class="integration-capabilities">${caps.slice(0,3).map(x=>`<span>${escape(String(x).replaceAll('_',' '))}</span>`).join('')}</div><button class="btn ${connected?'':'primary'}" data-integration="${escape(item.key)}">${connected?'Verbindung verwalten':'Verbinden'}</button></article>`;
    }).join('');
    document.querySelectorAll('[data-integration]').forEach(btn=>btn.onclick=()=>openConnection(btn.dataset.integration));
  }
  async function load(){
    if(window.NXTGEN_DB&&window.NXTGEN_ORG_ID){
      const [cat,con,hooks,events]=await Promise.all([
        window.NXTGEN_DB.from('integration_catalog').select('*').eq('is_active',true).order('name'),
        window.NXTGEN_DB.from('integration_connections').select('*').eq('organization_id',window.NXTGEN_ORG_ID),
        window.NXTGEN_DB.from('webhook_endpoints').select('*',{count:'exact',head:true}).eq('organization_id',window.NXTGEN_ORG_ID).eq('is_active',true),
        window.NXTGEN_DB.from('integration_events').select('*',{count:'exact',head:true}).eq('organization_id',window.NXTGEN_ORG_ID).eq('status','succeeded').gte('created_at',new Date(new Date().setHours(0,0,0,0)).toISOString())
      ]);
      if(!cat.error&&cat.data?.length) catalog=cat.data;
      if(!con.error) connections=con.data||[];
      document.getElementById('intWebhooks').textContent=hooks.count||0;
      document.getElementById('intEvents').textContent=events.count||0;
    }
    render();
  }
  function openConnection(key){
    const item=catalog.find(x=>x.key===key);
    const msg=item.auth_type==='oauth2'?'OAuth-Verbindung wird als nächster Connector-Schritt serverseitig aktiviert.':item.auth_type==='webhook'?'Webhook-Konfiguration wird im sicheren Backend angelegt.':'API-Key wird später ausschließlich über den Secret-Vault hinterlegt.';
    alert(`${item.name}\n\n${msg}\n\nDie Architektur und Datenmodelle sind bereits vorbereitet.`);
  }
  document.getElementById('newWebhook').onclick=()=>openConnection('custom-webhook');
  window.addEventListener('nxtgen:ready',load);
  setTimeout(load,350);
})();
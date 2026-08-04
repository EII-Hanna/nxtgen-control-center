(() => {
  const host=document.getElementById('delivery'); if(!host)return;
  host.classList.remove('empty');
  let workspaces=[],active=null,roadmap=[],assets=[],values=[],opportunities=[];
  const dbReady=()=>Boolean(window.NXTGEN_DB&&window.NXTGEN_ORG_ID&&!window.NXTGEN_DEMO_MODE);
  const esc=v=>{const d=document.createElement('div');d.textContent=v??'';return d.innerHTML};
  const money=v=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(v||0));

  host.innerHTML=`<div class="lifecycle"><div class="lifecycle-head"><div><p class="eyebrow">NXTGEN CLIENT LIFECYCLE</p><h2>Delivery, Customer Success & Wachstum</h2><p>Ein durchgängiger Kundenkontext vom Sales-Call bis zur Value Story. AI first, aber mit menschlicher Expertise an den entscheidenden Stellen.</p></div><button class="btn primary" id="createWorkspace">+ Kunden-Workspace</button></div><div class="lifecycle-tabs"><button class="active">Client Workspace</button><button>Roadmap</button><button>Weekly Accountability</button><button>Value Story</button><button>Upselling</button></div><div class="workspace-grid"><aside class="workspace-list"><h3>Kunden</h3><div id="workspaceList"></div></aside><main class="workspace-main" id="workspaceMain"><div class="workspace-empty"><div><h3>Noch kein Kunden-Workspace gewählt</h3><p>Wähle links einen Kunden oder erstelle einen Workspace.</p></div></div></main></div></div>`;

  async function load(){
    if(!dbReady()){renderList();return}
    const {data,error}=await window.NXTGEN_DB.from('client_workspaces').select('*,client:clients(id,company_name,status)').eq('organization_id',window.NXTGEN_ORG_ID).order('created_at',{ascending:false});
    if(!error) workspaces=data||[];
    renderList(); if(active){active=workspaces.find(x=>x.id===active.id)||active;await loadWorkspace(active.id)}
  }
  function renderList(){
    const list=document.getElementById('workspaceList');
    list.innerHTML=workspaces.length?workspaces.map(w=>`<div class="client-workspace-item ${active?.id===w.id?'active':''}" data-id="${w.id}"><b>${esc(w.client?.company_name||'Kunde')}</b><span>${esc(w.status)} · Health ${w.health_score||0}%</span></div>`).join(''):'<p style="color:#777;font-size:11px">Noch keine Workspaces.</p>';
    list.querySelectorAll('[data-id]').forEach(el=>el.onclick=()=>loadWorkspace(el.dataset.id));
  }
  async function loadWorkspace(id){
    active=workspaces.find(x=>String(x.id)===String(id)); if(!active)return;
    if(dbReady()){
      const [a,r,v,o]=await Promise.all([
        window.NXTGEN_DB.from('client_context_assets').select('*').eq('workspace_id',id).order('created_at',{ascending:false}),
        window.NXTGEN_DB.from('client_roadmap_items').select('*').eq('workspace_id',id).order('priority_score',{ascending:false}),
        window.NXTGEN_DB.from('client_value_events').select('*').eq('workspace_id',id).order('occurred_at',{ascending:false}),
        window.NXTGEN_DB.from('client_opportunities').select('*').eq('workspace_id',id).order('created_at',{ascending:false})
      ]);
      assets=a.data||[]; roadmap=r.data||[]; values=v.data||[]; opportunities=o.data||[];
    }
    renderList();renderWorkspace();
  }
  function renderWorkspace(){
    const main=document.getElementById('workspaceMain');
    const phases=['context','sales','onboarding','kickoff','roadmap','weekly','knowledge','deliverables'];
    const byType=t=>assets.filter(x=>x.asset_type===t).length;
    const cols=[['quick_win','Quick Wins'],['phase_2','Phase 2'],['phase_3','Phase 3'],['done','Erledigt']];
    main.innerHTML=`<div class="life-overview"><div class="life-top"><div><p class="eyebrow">${esc(active.status).toUpperCase()}</p><h2>${esc(active.client?.company_name||'Kunde')}</h2><p>${esc(active.strategic_goal||'Strategisches Ziel noch nicht definiert.')}</p></div><div class="health">${active.health_score||0}%</div></div><div class="life-kpis"><article class="life-card"><span>KONTEXT-ASSETS</span><strong>${assets.length}</strong></article><article class="life-card"><span>ROADMAP ITEMS</span><strong>${roadmap.length}</strong></article><article class="life-card"><span>VALUE EVENTS</span><strong>${values.length}</strong></article><article class="life-card"><span>CHANCEN</span><strong>${opportunities.filter(x=>!['won','lost','dismissed'].includes(x.status)).length}</strong></article></div><div class="section-title"><h3>Single Source of Truth</h3><button class="btn" id="addContext">+ Kontext</button></div><div class="context-tree">${phases.map((p,i)=>`<div class="context-node"><b>${String(i).padStart(2,'0')} · ${p}</b><small>${byType(p==='context'?'company_context':p==='sales'?'sales_transcript':p==='weekly'?'weekly_summary':p==='deliverables'?'deliverable':p)} Assets</small></div>`).join('')}</div><div class="section-title"><h3>Strategische Roadmap</h3><button class="btn" id="addRoadmap">+ Initiative</button></div><div class="roadmap-board">${cols.map(([key,label])=>`<div class="roadmap-col"><h4>${label}</h4>${roadmap.filter(x=>x.phase===key).map(x=>`<div class="roadmap-item"><b>${esc(x.title)}</b><p>${esc(x.problem||x.solution||'')}</p><span class="roadmap-score">ICE ${Number(x.priority_score||0).toFixed(1)}</span></div>`).join('')}</div>`).join('')}</div><div class="section-title"><h3>Value Story & Retention</h3><button class="btn" id="addValue">+ Ergebnis</button></div><div class="value-story"><div>${values.map(v=>`<div class="value-event"><b>${esc(v.title)}</b><small>${esc(v.description||'')}${v.before_value!=null&&v.after_value!=null?` · ${v.before_value} → ${v.after_value}`:''}</small></div>`).join('')||'<p style="color:#777">Noch keine Ergebnisse dokumentiert.</p>'}</div><div>${opportunities.map(o=>`<div class="upsell-card"><b>${esc(o.title)}</b><p>${esc(o.rationale||'')}</p><small>${money(o.estimated_value)} · ${o.confidence}% Confidence</small></div>`).join('')||'<p style="color:#777">Noch keine Upsell-Signale.</p>'}</div></div></div>`;
    document.getElementById('addContext').onclick=addContext;
    document.getElementById('addRoadmap').onclick=addRoadmap;
    document.getElementById('addValue').onclick=addValue;
  }
  async function addContext(){
    const title=prompt('Titel des Kontext-Assets'); if(!title)return; const content=prompt('Inhalt / Zusammenfassung')||'';
    const payload={organization_id:window.NXTGEN_ORG_ID,workspace_id:active.id,asset_type:'knowledge',title,content};
    if(dbReady()){const {error}=await window.NXTGEN_DB.from('client_context_assets').insert(payload);if(error)return alert(error.message)}
    assets.unshift({...payload,id:crypto.randomUUID(),created_at:new Date().toISOString()});renderWorkspace();
  }
  async function addRoadmap(){
    const title=prompt('Initiative'); if(!title)return; const problem=prompt('Welches Problem wird gelöst?')||''; const impact=Number(prompt('Impact 1-10','8')||8); const confidence=Number(prompt('Confidence 1-10','7')||7); const effort=Number(prompt('Effort 1-10','3')||3);
    const payload={organization_id:window.NXTGEN_ORG_ID,workspace_id:active.id,title,problem,impact,confidence,effort,phase:'quick_win'};
    if(dbReady()){const {data,error}=await window.NXTGEN_DB.from('client_roadmap_items').insert(payload).select('*').single();if(error)return alert(error.message);roadmap.unshift(data)}else roadmap.unshift({...payload,id:crypto.randomUUID(),priority_score:impact*confidence/Math.max(effort,1)});renderWorkspace();
  }
  async function addValue(){
    const title=prompt('Ergebnis / Meilenstein'); if(!title)return; const description=prompt('Was hat sich verbessert?')||''; const estimated=Number(prompt('Geschätzter monetärer Wert in €','0')||0);
    const payload={organization_id:window.NXTGEN_ORG_ID,workspace_id:active.id,event_type:'metric_improvement',title,description,monetary_value:estimated};
    if(dbReady()){const {data,error}=await window.NXTGEN_DB.from('client_value_events').insert(payload).select('*').single();if(error)return alert(error.message);values.unshift(data)}else values.unshift({...payload,id:crypto.randomUUID(),occurred_at:new Date().toISOString()});renderWorkspace();
  }
  async function createWorkspace(){
    if(!dbReady())return alert('Supabase-Verbindung erforderlich.');
    const {data:clients,error}=await window.NXTGEN_DB.from('clients').select('id,company_name,status').eq('organization_id',window.NXTGEN_ORG_ID).order('company_name'); if(error)return alert(error.message); if(!clients?.length)return alert('Noch keine Kunden vorhanden.');
    const names=clients.map((c,i)=>`${i+1}: ${c.company_name}`).join('\n'); const pick=Number(prompt(`Kunde wählen:\n${names}`)); const client=clients[pick-1]; if(!client)return;
    const payload={organization_id:window.NXTGEN_ORG_ID,client_id:client.id,status:'onboarding',current_phase:'context',strategic_goal:'Vom Status quo zur messbaren Zielerreichung'};
    const {data,error:insertError}=await window.NXTGEN_DB.from('client_workspaces').upsert(payload,{onConflict:'organization_id,client_id'}).select('*,client:clients(id,company_name,status)').single(); if(insertError)return alert(insertError.message); workspaces.unshift(data); await loadWorkspace(data.id);
  }
  document.getElementById('createWorkspace').onclick=createWorkspace;
  window.addEventListener('nxtgen:ready',load);setTimeout(load,450);
})();
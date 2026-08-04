(() => {
  const host=document.getElementById('delivery'); if(!host)return;
  const money=v=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(v||0));
  const esc=v=>{const d=document.createElement('div');d.textContent=v??'';return d.innerHTML};
  const dbReady=()=>Boolean(window.NXTGEN_DB&&window.NXTGEN_ORG_ID&&!window.NXTGEN_DEMO_MODE);
  let workspaces=[],active=null,story=null,items=[];

  function mount(){
    const shell=document.createElement('section');shell.className='value-shell';shell.id='valueStoryEngine';
    shell.innerHTML=`<div class="value-top"><div><div class="value-eyebrow">NXTGEN VALUE STORY</div><h3>Ergebnisse sichtbar. ROI belegbar. Wachstum logisch.</h3><p>Aus Ausgangslage, Delivery, KPIs, Weekly Calls und Value Events entsteht eine klare Kundenstory für Retention, Renewal und Expansion.</p></div><span class="value-pill">AI GENERATED · HUMAN APPROVED</span></div><div id="valueBody" class="value-empty">Value Story wird geladen …</div>`;
    host.appendChild(shell);
  }

  async function load(){
    if(!dbReady())return empty('Live-Supabase-Verbindung erforderlich.');
    const {data,error}=await window.NXTGEN_DB.from('client_workspaces').select('*,client:clients(id,company_name,status)').eq('organization_id',window.NXTGEN_ORG_ID).order('updated_at',{ascending:false});
    if(error)return empty(error.message);workspaces=data||[];
    if(!workspaces.length)return empty('Noch keine Kunden-Workspaces vorhanden.');
    active=active?workspaces.find(w=>w.id===active.id)||workspaces[0]:workspaces[0];
    await loadStory();
  }

  async function loadStory(){
    const {data}=await window.NXTGEN_DB.from('client_value_stories').select('*').eq('workspace_id',active.id).order('created_at',{ascending:false}).limit(1).maybeSingle();
    story=data||null;items=[];
    if(story){const r=await window.NXTGEN_DB.from('client_value_story_items').select('*').eq('story_id',story.id).order('sort_order');items=r.data||[]}
    render();
  }

  function empty(text){const el=document.getElementById('valueBody');if(el){el.className='value-empty';el.innerHTML=`<h4>Value Story</h4><p>${esc(text)}</p>`}}
  function metricCards(){return items.filter(i=>i.item_type==='metric').map(i=>`<div class="value-metric"><b>${esc(i.title)}</b><strong>${i.before_value??'—'} → ${i.after_value??'—'} ${esc(i.unit||'')}</strong><small>${esc(i.description||'')}</small></div>`).join('')}
  function expansionCards(){const list=Array.isArray(story?.recommended_expansion)?story.recommended_expansion:[];return list.map(x=>`<div class="value-expansion"><b>${esc(x.title||'Expansion')}</b><p>${esc(x.type||'upsell')} · ${money(x.estimated_value||0)} Potenzial</p><div class="value-proof"><span>Confidence</span><strong>${x.confidence||0}%</strong></div></div>`).join('')}

  function render(){
    const body=document.getElementById('valueBody');body.className='value-layout';
    body.innerHTML=`<aside class="value-client-list"><h4>KUNDEN</h4><div>${workspaces.map(w=>`<button class="value-client ${w.id===active.id?'active':''}" data-value-client="${w.id}"><b>${esc(w.client?.company_name||'Kunde')}</b><span>${esc(w.status)} · Health ${w.health_score||0}%</span></button>`).join('')}</div></aside><main class="value-main">${story?storyView():emptyView()}</main>`;
    body.querySelectorAll('[data-value-client]').forEach(b=>b.onclick=async()=>{active=workspaces.find(w=>w.id===b.dataset.valueClient);await loadStory()});
    body.querySelector('[data-generate-story]')?.addEventListener('click',generateStory);
    body.querySelector('[data-approve-story]')?.addEventListener('click',approveStory);
  }

  function emptyView(){return `<div class="value-card value-hero-card"><div class="value-eyebrow">${esc(active.client?.company_name||'Kunde')}</div><h2>Noch keine Value Story</h2><p>NXTGEN kann aus Projektfortschritt, KPIs, Value Events und Expansion-Signalen automatisch eine belastbare Kundenstory erzeugen.</p><div class="value-actions"><button class="primary" data-generate-story>Value Story erzeugen</button></div></div>`}

  function storyView(){
    const baseline=items.find(i=>i.item_type==='baseline');const measure=items.find(i=>i.item_type==='measure');const outcome=items.find(i=>i.item_type==='outcome');
    return `<div class="value-hero"><section class="value-card value-hero-card"><div class="value-eyebrow">${esc(active.client?.company_name||'Kunde')} · ${esc(story.status)}</div><h2>${esc(story.title)}</h2><p>${esc(story.outcome_summary||'')}</p><div class="value-actions"><button class="primary" data-generate-story>Neu berechnen</button>${story.status==='generated'?'<button data-approve-story>Freigeben</button>':''}</div></section><section class="value-card value-score"><div class="value-score-ring" style="--score:${story.executive_score||0}"><strong>${story.executive_score||0}</strong></div><small>Executive Value Score</small></section></div><div class="value-kpis"><article class="value-kpi"><span>REALISIERTER WERT</span><strong>${money(story.realized_value)}</strong><small>im Zeitraum</small></article><article class="value-kpi"><span>INVESTMENT</span><strong>${money(story.investment_value)}</strong><small>betrachtete Periode</small></article><article class="value-kpi"><span>ROI</span><strong>${Number(story.roi_percent||0).toFixed(0)}%</strong><small>Value vs. Investment</small></article><article class="value-kpi"><span>EVIDENZ</span><strong>${story.evidence_strength||0}%</strong><small>Datenqualität</small></article></div><div class="value-content"><section class="value-card"><div class="value-eyebrow">TRANSFORMATION JOURNEY</div><div class="value-timeline"><div class="value-step"><span>01 · AUSGANGSLAGE</span><h4>${esc(baseline?.title||'Ausgangslage')}</h4><p>${esc(baseline?.description||story.baseline_summary||'')}</p></div><div class="value-step"><span>02 · MASSNAHMEN</span><h4>${esc(measure?.title||'Umgesetzte Maßnahmen')}</h4><p>${esc(measure?.description||story.transformation_summary||'')}</p></div><div class="value-step"><span>03 · ERGEBNIS</span><h4>${esc(outcome?.title||'Erzielte Wirkung')}</h4><p>${esc(outcome?.description||story.outcome_summary||'')}</p></div><div class="value-step"><span>04 · NEXT CHAPTER</span><h4>Nächste Wachstumsphase</h4><p>${esc(story.next_chapter||'')}</p></div></div><div class="value-metric-grid">${metricCards()||'<div class="value-status">Noch keine KPI-Verläufe im Zeitraum.</div>'}</div></section><aside><section class="value-card"><div class="value-eyebrow">EXPANSION SIGNALS</div><h3>Der nächste logische Schritt</h3>${expansionCards()||'<p class="value-status">Noch keine qualifizierten Expansion-Signale.</p>'}<div class="value-proof"><span>Projected Annual Value</span><strong>${money(story.projected_annual_value)}</strong></div></section><section class="value-card" style="margin-top:16px"><div class="value-eyebrow">STORY CONTROL</div><h3>${esc(story.status)}</h3><p class="value-status">Zeitraum: ${story.period_start?new Date(story.period_start).toLocaleDateString('de-DE'):'—'} – ${story.period_end?new Date(story.period_end).toLocaleDateString('de-DE'):'—'}</p><div class="value-proof"><span>Payback</span><strong>${story.payback_months?`${Number(story.payback_months).toFixed(1)} Monate`:'—'}</strong></div></section></aside></div>`
  }

  async function generateStory(){
    const btn=document.querySelector('[data-generate-story]');if(btn){btn.disabled=true;btn.textContent='Berechnet …'}
    const {data,error}=await window.NXTGEN_DB.rpc('generate_client_value_story',{p_workspace_id:active.id});
    if(error){alert(error.message);if(btn)btn.disabled=false;return}await loadStory();
  }
  async function approveStory(){
    if(!story)return;const {error}=await window.NXTGEN_DB.from('client_value_stories').update({status:'approved',reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',story.id);if(error)return alert(error.message);story.status='approved';render();
  }

  mount();window.addEventListener('nxtgen:ready',load);window.addEventListener('nxtgen:value-updated',load);setTimeout(load,1200);
})();
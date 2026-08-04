(() => {
  const dbReady=()=>Boolean(window.NXTGEN_DB&&window.NXTGEN_ORG_ID&&!window.NXTGEN_DEMO_MODE);
  const esc=v=>{const d=document.createElement('div');d.textContent=v??'';return d.innerHTML};
  const fmt=v=>v?new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v)):'—';
  let mounted=false;

  function mount(){
    const shell=document.getElementById('clientIntelligence');
    if(!shell||mounted)return false;
    const head=shell.querySelector('.ci-head');
    const panel=document.createElement('section');
    panel.id='firefliesPipeline';
    panel.className='ff-pipeline';
    panel.innerHTML=`<div class="ff-pipeline-head"><div><p class="eyebrow">MEETING INTELLIGENCE</p><h4>Fireflies → NXTGEN</h4><p>Erstgespräche werden transkribiert, strukturiert und in den Kundenkontext überführt.</p></div><button class="btn" id="refreshFireflies">Aktualisieren</button></div><div id="firefliesPipelineBody" class="ff-pipeline-empty">Noch keine Gesprächsdaten geladen.</div>`;
    head?.after(panel);
    document.getElementById('refreshFireflies').onclick=load;
    mounted=true;
    return true;
  }

  async function load(){
    if(!mount()) return;
    const body=document.getElementById('firefliesPipelineBody');
    if(!dbReady()){body.textContent='Live-Supabase-Verbindung erforderlich.';return}
    body.innerHTML='<div class="ff-pipeline-empty">Gespräche werden geladen …</div>';
    const {data,error}=await window.NXTGEN_DB.from('meeting_intelligence_records')
      .select('id,title,started_at,analysis_status,analysis_model,analysis_error,lead_id,transcript_url,extracted_pain_points,extracted_goals,extracted_objections,extracted_next_steps,recommended_modules,qualification_signals')
      .eq('organization_id',window.NXTGEN_ORG_ID)
      .order('started_at',{ascending:false})
      .limit(5);
    if(error){body.innerHTML=`<div class="ff-pipeline-empty">${esc(error.message)}</div>`;return}
    const rows=data||[];
    if(!rows.length){body.innerHTML='<div class="ff-pipeline-empty">Noch kein Fireflies-Gespräch importiert.</div>';return}
    body.innerHTML=rows.map(card).join('');
  }

  function chips(values,limit=3){
    const list=Array.isArray(values)?values:[];
    return list.slice(0,limit).map(v=>`<span>${esc(typeof v==='string'?v:(v.title||v.product_code||''))}</span>`).join('');
  }

  function card(row){
    const q=row.qualification_signals||{};
    const status=row.analysis_status||'pending';
    const model=row.analysis_model||'wartet';
    return `<article class="ff-record">
      <div class="ff-record-top"><div><b>${esc(row.title||'Fireflies Gespräch')}</b><small>${fmt(row.started_at)} · ${row.lead_id?'Lead zugeordnet':'Zuordnung offen'}</small></div><span class="ff-status ${esc(status)}">${esc(status)}</span></div>
      <div class="ff-record-grid"><div><label>PAIN POINTS</label><div class="ff-chips">${chips(row.extracted_pain_points)||'<span>noch keine</span>'}</div></div><div><label>ZIELE</label><div class="ff-chips">${chips(row.extracted_goals)||'<span>noch keine</span>'}</div></div><div><label>MODULE</label><div class="ff-chips">${chips(row.recommended_modules)||'<span>noch keine</span>'}</div></div></div>
      <div class="ff-record-foot"><span>Analyse: ${esc(model)}</span><span>Score ${Number(q.score||0)} · Confidence ${Number(q.confidence||0)}%</span>${row.transcript_url?`<a href="${esc(row.transcript_url)}" target="_blank" rel="noopener">Transkript öffnen</a>`:''}</div>
      ${row.analysis_error?`<p class="ff-warning">Hinweis: ${esc(row.analysis_error)}</p>`:''}
    </article>`;
  }

  const observer=new MutationObserver(()=>{if(mount())load()});
  observer.observe(document.body,{childList:true,subtree:true});
  window.addEventListener('nxtgen:ready',()=>setTimeout(load,900));
  setTimeout(load,1200);
})();

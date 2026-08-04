(() => {
  const host=document.getElementById('delivery'); if(!host)return;
  let workspaces=[],active=null,briefing=null,kpis=[];
  const dbReady=()=>Boolean(window.NXTGEN_DB&&window.NXTGEN_ORG_ID&&!window.NXTGEN_DEMO_MODE);
  const esc=v=>{const d=document.createElement('div');d.textContent=v??'';return d.innerHTML};
  const list=v=>Array.isArray(v)?v:[];
  const date=v=>v?new Date(v).toLocaleDateString('de-DE'):'—';

  const shell=document.createElement('section');
  shell.className='weekly-shell'; shell.id='weeklyAccountability';
  shell.innerHTML=`<div class="weekly-head"><div><p class="eyebrow">NXTGEN WEEKLY ACCOUNTABILITY</p><h3>Pre-Call Briefing & KPI-Steuerung</h3><p>Fireflies, Delivery, KPIs, Blocker und Entscheidungen werden vor jedem Kundentermin automatisch zusammengeführt.</p></div><span class="weekly-badge">ALWAYS PREPARED</span></div><div id="weeklyBody" class="weekly-empty">Weekly-System wird geladen …</div>`;
  host.appendChild(shell);

  async function load(){
    if(!dbReady())return empty('Live-Supabase-Verbindung erforderlich.');
    const {data,error}=await window.NXTGEN_DB.from('client_workspaces').select('*,client:clients(company_name)').eq('organization_id',window.NXTGEN_ORG_ID).order('created_at',{ascending:false});
    if(error)return empty(error.message);
    workspaces=data||[]; active=active?workspaces.find(x=>x.id===active.id)||workspaces[0]:workspaces[0];
    if(!active)return empty('Noch kein Kunden-Workspace vorhanden.');
    await loadActive();
  }

  async function loadActive(){
    const [b,k]=await Promise.all([
      window.NXTGEN_DB.from('client_weekly_briefings').select('*').eq('workspace_id',active.id).order('created_at',{ascending:false}).limit(1).maybeSingle(),
      window.NXTGEN_DB.from('client_kpi_definitions').select('*,measurements:client_kpi_measurements(value,measured_at)').eq('workspace_id',active.id).eq('is_active',true).order('created_at')
    ]);
    briefing=b.data||null; kpis=(k.data||[]).map(x=>({...x,measurements:(x.measurements||[]).sort((a,b)=>new Date(b.measured_at)-new Date(a.measured_at))}));
    render();
  }

  function empty(text){const el=document.getElementById('weeklyBody');if(el)el.innerHTML=`<div><h4>Weekly Accountability</h4><p>${esc(text)}</p></div>`}
  function cards(items,kind){
    if(!items.length)return '<p class="weekly-muted">Keine Einträge.</p>';
    return items.map(x=>`<article class="weekly-item ${kind||''}"><b>${esc(x.title||x.label||String(x))}</b>${x.reason?`<p>${esc(x.reason)}</p>`:''}${x.owner?`<small>${esc(x.owner)}</small>`:''}${x.due_at?`<small>Fällig ${date(x.due_at)}</small>`:''}</article>`).join('');
  }

  function render(){
    const body=document.getElementById('weeklyBody'); body.className='weekly-layout';
    const project=briefing?.project_snapshot||{};
    body.innerHTML=`<aside class="weekly-clients"><h4>Kunden</h4>${workspaces.map(w=>`<button class="${w.id===active.id?'active':''}" data-weekly-workspace="${w.id}"><b>${esc(w.client?.company_name||'Kunde')}</b><span>${esc(w.status)} · Health ${w.health_score||0}%</span></button>`).join('')}</aside><main class="weekly-main"><div class="weekly-toolbar"><div><p class="eyebrow">${esc(active.client?.company_name||'KUNDE')}</p><h3>${briefing?'Aktuelles Pre-Call Briefing':'Noch kein Briefing erzeugt'}</h3><p>${esc(briefing?.executive_summary||'Erzeuge das Briefing vor dem nächsten Kundentermin.')}</p></div><div class="weekly-actions"><button class="btn" id="addKpi">+ KPI</button><button class="btn primary" id="generateWeekly">Briefing aktualisieren</button></div></div>${briefing?`<div class="weekly-kpis"><article><span>FORTSCHRITT</span><strong>${project.progress||0}%</strong><small>${esc(project.stage||'—')}</small></article><article><span>WINS</span><strong>${list(briefing.wins).length}</strong><small>letzte 7 Tage</small></article><article><span>BLOCKER</span><strong>${list(briefing.blockers).length}</strong><small>aktiv</small></article><article><span>FREIGABEN</span><strong>${list(briefing.decisions_needed).length}</strong><small>Entscheidung nötig</small></article></div><div class="weekly-grid"><section class="weekly-panel"><h4>Ergebnisse seit dem letzten Call</h4>${cards(list(briefing.wins),'win')}</section><section class="weekly-panel"><h4>Blocker & Risiken</h4>${cards(list(briefing.blockers),'risk')}${list(briefing.client_risks).map(x=>`<div class="weekly-risk">${esc(x)}</div>`).join('')}</section><section class="weekly-panel"><h4>Entscheidungen erforderlich</h4>${cards(list(briefing.decisions_needed),'decision')}</section><section class="weekly-panel"><h4>Nächste Aktionen</h4>${cards(list(briefing.next_actions),'next')}</section></div><section class="weekly-panel"><div class="weekly-panel-head"><h4>KPI Snapshot</h4><span>${list(briefing.kpi_snapshot).length} Kennzahlen</span></div><div class="weekly-kpi-table">${list(briefing.kpi_snapshot).map(k=>`<div><b>${esc(k.label)}</b><strong>${k.value??'—'} ${esc(k.unit||'')}</strong><small>Ziel ${k.target??'—'} · ${esc(k.direction)}</small></div>`).join('')||'<p class="weekly-muted">Noch keine KPIs definiert.</p>'}</div></section><section class="weekly-panel"><h4>Empfohlene Agenda</h4><ol class="weekly-agenda">${list(briefing.recommended_agenda).map(x=>`<li>${esc(x)}</li>`).join('')}</ol></section>${list(briefing.expansion_signals).length?`<section class="weekly-panel expansion"><h4>Expansion-Signale</h4>${list(briefing.expansion_signals).map(x=>`<article><b>${esc(x.title)}</b><span>${x.confidence}% · ${Number(x.value||0).toLocaleString('de-DE')} €</span></article>`).join('')}</section>`:''}`:'<div class="weekly-empty-card"><h4>Briefing mit einem Klick erzeugen</h4><p>NXTGEN fasst Projektfortschritt, Fireflies-Gespräche, KPIs, Blocker, Freigaben und nächste Schritte zusammen.</p></div>'}<section class="weekly-panel"><div class="weekly-panel-head"><h4>KPI-Verwaltung</h4><span>${kpis.length} aktiv</span></div><div class="weekly-kpi-manage">${kpis.map(k=>`<article><div><b>${esc(k.label)}</b><small>${esc(k.key)} · Ziel ${k.target_value??'—'} ${esc(k.unit||'')}</small></div><div><strong>${k.measurements[0]?.value??'—'} ${esc(k.unit||'')}</strong><button data-measure-kpi="${k.id}">Wert erfassen</button></div></article>`).join('')||'<p class="weekly-muted">Noch keine KPIs angelegt.</p>'}</div></section></main>`;
    body.querySelectorAll('[data-weekly-workspace]').forEach(b=>b.onclick=async()=>{active=workspaces.find(x=>x.id===b.dataset.weeklyWorkspace);await loadActive()});
    document.getElementById('generateWeekly').onclick=generate;
    document.getElementById('addKpi').onclick=addKpi;
    body.querySelectorAll('[data-measure-kpi]').forEach(b=>b.onclick=()=>measureKpi(b.dataset.measureKpi));
  }

  async function generate(){
    const meeting=prompt('Nächster Kundentermin (optional, z. B. 2026-08-11 10:00)')||null;
    const {data,error}=await window.NXTGEN_DB.rpc('generate_weekly_briefing',{p_workspace_id:active.id,p_upcoming_meeting_at:meeting?new Date(meeting).toISOString():null});
    if(error)return alert(error.message);briefing=data;render();
  }
  async function addKpi(){
    const label=prompt('KPI-Bezeichnung');if(!label)return;
    const key=(prompt('Technischer Key',label.toLowerCase().replace(/[^a-z0-9]+/g,'_'))||'').trim();if(!key)return;
    const unit=prompt('Einheit, z. B. %, Stunden, Leads','')||'';
    const target=prompt('Zielwert (optional)','');
    const direction=prompt('Richtung: increase, decrease oder maintain','increase')||'increase';
    const {error}=await window.NXTGEN_DB.from('client_kpi_definitions').insert({organization_id:window.NXTGEN_ORG_ID,workspace_id:active.id,key,label,unit,target_value:target===''?null:Number(target),direction});
    if(error)return alert(error.message);await loadActive();
  }
  async function measureKpi(id){
    const value=prompt('Aktueller KPI-Wert');if(value===null||value==='')return;
    const {error}=await window.NXTGEN_DB.from('client_kpi_measurements').insert({organization_id:window.NXTGEN_ORG_ID,workspace_id:active.id,kpi_definition_id:id,value:Number(value),source:'manual'});
    if(error)return alert(error.message);await loadActive();
  }

  window.addEventListener('nxtgen:ready',load);window.addEventListener('nxtgen:delivery-updated',load);setTimeout(load,1200);
})();

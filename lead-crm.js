(() => {
  const customers = document.getElementById('customers');
  if (!customers) return;
  const stages = [
    ['new','Neu'],['contacted','Kontaktiert'],['qualified','Qualifiziert'],['meeting_booked','Termin'],['offer_open','Angebot']
  ];
  let leads = [];

  customers.classList.remove('empty');
  customers.innerHTML = `
    <div class="lead-cockpit">
      <div class="lead-head">
        <div><p class="eyebrow">SPRINT 1 · LEAD-TO-CONVERSATION</p><h2>Interessenten & Pipeline</h2><p>Alle Anfragen aus LinkedIn, E-Mail, Website, WhatsApp, Empfehlungen und manueller Erfassung.</p></div>
        <button class="btn primary" id="focusLeadForm">+ Interessent anlegen</button>
      </div>
      <div class="lead-kpis">
        <article class="lead-kpi"><span>OFFENE INTERESSENTEN</span><strong id="leadKpiOpen">0</strong><small>nicht gewonnen oder verloren</small></article>
        <article class="lead-kpi"><span>PIPELINE-VOLUMEN</span><strong id="leadKpiValue">0 €</strong><small>gewichteter Forecast folgt</small></article>
        <article class="lead-kpi"><span>TERMINE</span><strong id="leadKpiMeetings">0</strong><small>gebucht oder durchgeführt</small></article>
        <article class="lead-kpi"><span>FOLLOW-UPS FÄLLIG</span><strong id="leadKpiFollowups">0</strong><small>heute oder überfällig</small></article>
      </div>
      <div class="lead-layout">
        <section class="pipeline-board" id="pipelineBoard"></section>
        <aside class="lead-side">
          <h3>Interessent erfassen</h3>
          <form class="lead-form" id="leadForm">
            <div><label>UNTERNEHMEN</label><input id="leadCompany" required placeholder="Musterunternehmen"></div>
            <div><label>ANSPRECHPARTNER</label><input id="leadContact" placeholder="Max Mustermann"></div>
            <div><label>E-MAIL</label><input id="leadEmail" type="email" placeholder="max@firma.de"></div>
            <div><label>TELEFON / WHATSAPP</label><input id="leadPhone" placeholder="+49 …"></div>
            <div><label>QUELLE</label><select id="leadSource"><option value="linkedin">LinkedIn</option><option value="email">E-Mail</option><option value="website">Website</option><option value="whatsapp">WhatsApp</option><option value="referral">Empfehlung</option><option value="manual">Manuell</option><option value="other">Sonstige</option></select></div>
            <div><label>BRANCHE</label><input id="leadIndustry" placeholder="Personalberatung"></div>
            <div><label>POTENZIAL NETTO</label><input id="leadValue" type="number" min="0" value="0"></div>
            <div><label>BEDARF / PROBLEM</label><textarea id="leadNeed" placeholder="Welches Problem soll gelöst werden?"></textarea></div>
            <div><label>NÄCHSTER SCHRITT</label><input id="leadNext" placeholder="Erstgespräch vereinbaren"></div>
            <div><label>FOLLOW-UP</label><input id="leadFollowup" type="datetime-local"></div>
            <div class="lead-actions"><button type="reset" class="btn">Leeren</button><button type="submit" class="btn primary">Speichern</button></div>
          </form>
          <div class="followup-list"><p class="eyebrow">NÄCHSTE FOLLOW-UPS</p><div id="followupItems"></div></div>
        </aside>
      </div>
    </div>`;

  const $ = id => document.getElementById(id);
  const money = value => new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(value||0));
  const escapeHtml = value => { const d=document.createElement('div'); d.textContent=value ?? ''; return d.innerHTML; };

  async function loadLeads(){
    if (!window.NXTGEN_DB || !window.NXTGEN_ORG_ID) {
      leads = JSON.parse(localStorage.getItem('nxtgen_demo_leads') || '[]');
      render();
      return;
    }
    const { data, error } = await window.NXTGEN_DB.from('leads').select('*').eq('organization_id',window.NXTGEN_ORG_ID).order('created_at',{ascending:false});
    if (error) { console.error(error); return; }
    leads = data || [];
    render();
  }

  function render(){
    const board=$('pipelineBoard');
    board.innerHTML=stages.map(([key,label])=>{
      const cards=leads.filter(x=>x.stage===key);
      return `<div class="pipeline-column" data-stage="${key}"><div class="pipeline-column-head"><b>${label}</b><span>${cards.length}</span></div>${cards.map(card=>`<article class="lead-card" data-id="${card.id}"><div class="lead-card-top"><strong>${escapeHtml(card.company_name)}</strong><span class="lead-source">${escapeHtml(card.source)}</span></div><p>${escapeHtml(card.need_summary||card.next_step||'Noch keine Bedarfsnotiz')}</p><div class="lead-card-meta"><span>${escapeHtml(card.contact_name||'Ohne Kontakt')}</span><b class="lead-value">${money(card.estimated_value)}</b></div></article>`).join('')}</div>`;
    }).join('');
    const open=leads.filter(x=>!['won','lost'].includes(x.stage));
    $('leadKpiOpen').textContent=open.length;
    $('leadKpiValue').textContent=money(open.reduce((s,x)=>s+Number(x.estimated_value||0),0));
    $('leadKpiMeetings').textContent=leads.filter(x=>['meeting_booked','meeting_completed'].includes(x.stage)).length;
    const now=Date.now(); const due=open.filter(x=>x.next_follow_up_at && new Date(x.next_follow_up_at).getTime()<=now);
    $('leadKpiFollowups').textContent=due.length;
    const next=open.filter(x=>x.next_follow_up_at).sort((a,b)=>new Date(a.next_follow_up_at)-new Date(b.next_follow_up_at)).slice(0,5);
    $('followupItems').innerHTML=next.length?next.map(x=>`<div class="followup-item"><b>${escapeHtml(x.company_name)}</b><span>${new Intl.DateTimeFormat('de-DE',{dateStyle:'short',timeStyle:'short'}).format(new Date(x.next_follow_up_at))} · ${escapeHtml(x.next_step||'Follow-up')}</span></div>`).join(''):'<span style="font-size:10px;color:#69707b">Keine Follow-ups geplant.</span>';
  }

  $('leadForm').addEventListener('submit', async e=>{
    e.preventDefault();
    const payload={
      organization_id:window.NXTGEN_ORG_ID,
      company_name:$('leadCompany').value.trim(),
      contact_name:$('leadContact').value.trim()||null,
      email:$('leadEmail').value.trim()||null,
      phone:$('leadPhone').value.trim()||null,
      source:$('leadSource').value,
      industry:$('leadIndustry').value.trim()||null,
      stage:'new',
      estimated_value:Number($('leadValue').value||0),
      need_summary:$('leadNeed').value.trim()||null,
      next_step:$('leadNext').value.trim()||null,
      next_follow_up_at:$('leadFollowup').value?new Date($('leadFollowup').value).toISOString():null
    };
    if (!payload.company_name) return;
    if (window.NXTGEN_DB && window.NXTGEN_ORG_ID) {
      const { error }=await window.NXTGEN_DB.from('leads').insert(payload);
      if(error){alert(`Speichern fehlgeschlagen: ${error.message}`);return;}
    } else {
      payload.id=crypto.randomUUID(); payload.created_at=new Date().toISOString();
      const local=JSON.parse(localStorage.getItem('nxtgen_demo_leads')||'[]'); local.unshift(payload); localStorage.setItem('nxtgen_demo_leads',JSON.stringify(local));
    }
    e.target.reset(); $('leadValue').value=0; await loadLeads();
  });

  $('focusLeadForm').addEventListener('click',()=>$('leadCompany').focus());
  window.addEventListener('nxtgen:ready',loadLeads);
  setTimeout(loadLeads,300);
})();
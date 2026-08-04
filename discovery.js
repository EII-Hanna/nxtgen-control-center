(() => {
  const sales=document.getElementById('sales'); if(!sales)return;
  const host=document.createElement('section'); host.className='discovery-shell';
  host.innerHTML=`<div class="discovery-head"><div><p class="eyebrow">SPRINT 2 · DISCOVERY TO OFFER</p><h2>Erstgespräch & Lösungskonfiguration</h2><p>Closing-Lead auswählen, Bedarf qualifizieren und die passende Lösung direkt ins Angebot übernehmen.</p></div><span class="discovery-badge">REVENUE QUALIFICATION</span></div>
  <div class="discovery-grid"><section class="discovery-card"><h3>Gesprächsakte</h3><div class="discovery-form">
  <div class="discovery-field full"><label>CLOSING-LEAD</label><select id="dcLead"><option value="">Lead auswählen …</option></select></div>
  <div class="discovery-field full"><label>AKTUELLER PROZESS</label><textarea id="dcProcess" placeholder="Wie läuft der Prozess heute ab?"></textarea></div>
  <div class="discovery-field full"><label>KERNPROBLEM</label><textarea id="dcProblem" placeholder="Was blockiert Wachstum, Effizienz oder Qualität?"></textarea></div>
  <div class="discovery-field full"><label>ZIELBILD</label><textarea id="dcOutcome" placeholder="Welches konkrete Ergebnis soll erreicht werden?"></textarea></div>
  <div class="discovery-field"><label>DRINGLICHKEIT</label><select id="dcUrgency"><option value="medium">Mittel</option><option value="low">Niedrig</option><option value="high">Hoch</option><option value="critical">Kritisch</option></select></div>
  <div class="discovery-field"><label>BUDGETRAHMEN</label><input id="dcBudget" placeholder="z. B. 20.000–50.000 €"></div>
  <div class="discovery-field"><label>ENTSCHEIDER</label><input id="dcDecisionMaker" placeholder="Name / Rolle"></div>
  <div class="discovery-field"><label>STARTZIEL</label><input id="dcStart" type="date"></div>
  <div class="discovery-field"><label>TEAMGRÖSSE</label><input id="dcTeam" type="number" min="0"></div>
  <div class="discovery-field"><label>MONATLICHES VOLUMEN</label><input id="dcVolume" type="number" min="0"></div>
  <div class="discovery-field full"><label>EINWÄNDE / RISIKEN</label><textarea id="dcObjections"></textarea></div>
  </div></section>
  <section class="discovery-card"><div class="discovery-score"><div><span class="eyebrow">QUALIFIZIERUNG</span><b>Deal Readiness</b></div><strong id="dcScore">0%</strong></div><h3>Lösung konfigurieren</h3>
  <div class="solution-list">
    <label class="solution-option"><input type="checkbox" value="RecruitingOS" data-scope="Recruiting-Prozesse, CRM und Talentpool zentralisieren"><span><b>RecruitingOS</b><small>Vertical OS für Personalberater</small></span></label>
    <label class="solution-option"><input type="checkbox" value="Recruiting Ads" data-scope="Kampagnen, Funnel und Bewerbergewinnung automatisieren"><span><b>Recruiting Ads</b><small>Lead- und Kandidatengewinnung</small></span></label>
    <label class="solution-option"><input type="checkbox" value="Voice AI" data-scope="Anrufe, Qualifizierung und Terminierung automatisieren"><span><b>Voice AI</b><small>Telefonagent für Inbound und Qualifizierung</small></span></label>
    <label class="solution-option"><input type="checkbox" value="Fulfillment OS" data-scope="Onboarding, Delivery und Projektsteuerung standardisieren"><span><b>Fulfillment OS</b><small>Operative Leistungserbringung</small></span></label>
    <label class="solution-option"><input type="checkbox" value="Automation Layer" data-scope="Manuelle Prozessschritte über n8n und API-Integrationen automatisieren"><span><b>Automation Layer</b><small>n8n, Webhooks und Tool-Anbindungen</small></span></label>
  </div>
  <div class="solution-pricing"><div class="discovery-field"><label>SETUP</label><input id="dcSetup" type="number" min="0" value="5000"></div><div class="discovery-field"><label>MONATLICH</label><input id="dcMonthly" type="number" min="0" value="3499"></div><div class="discovery-field"><label>LAUFZEIT</label><input id="dcTerm" type="number" min="1" value="12"></div></div>
  <div class="discovery-actions"><button class="btn" id="dcSave">Gesprächsakte speichern</button><button class="btn primary" id="dcToOffer">In Angebot übernehmen</button></div><div id="dcMessage" class="discovery-message"></div></section></div>`;
  sales.prepend(host);
  const $=id=>document.getElementById(id); let leads=[]; let assessmentId=null;
  const dbReady=()=>Boolean(window.NXTGEN_DB&&window.NXTGEN_ORG_ID&&!window.NXTGEN_DEMO_MODE);
  const val=id=>$(id).value.trim();
  const selectedProducts=()=>[...host.querySelectorAll('.solution-option input:checked')].map(x=>({name:x.value,scope:x.dataset.scope}));
  function score(){let s=0;if(val('dcProblem').length>10)s+=20;if(val('dcOutcome').length>10)s+=20;if(['high','critical'].includes($('dcUrgency').value))s+=20;else if($('dcUrgency').value==='medium')s+=10;if(val('dcBudget'))s+=15;if(val('dcDecisionMaker'))s+=15;if($('dcStart').value)s+=10;$('dcScore').textContent=`${Math.min(s,100)}%`;return Math.min(s,100)}
  ['dcProblem','dcOutcome','dcUrgency','dcBudget','dcDecisionMaker','dcStart'].forEach(id=>$(id).addEventListener('input',score));
  async function loadLeads(){
    if(dbReady()){
      const {data,error}=await window.NXTGEN_DB.from('leads').select('id,company_name,contact_name,email,stage,estimated_value').eq('organization_id',window.NXTGEN_ORG_ID).in('stage',['meeting_booked','meeting_prepared','meeting_completed','need_confirmed','solution_configured','offer_open','negotiation','contract_sent']).order('updated_at',{ascending:false});
      if(error){$('dcMessage').textContent=error.message;return} leads=data||[];
    }else leads=JSON.parse(localStorage.getItem('nxtgen_demo_leads')||'[]').filter(x=>['meeting_booked','meeting_prepared','meeting_completed','need_confirmed','solution_configured','offer_open','negotiation','contract_sent'].includes(x.stage));
    $('dcLead').innerHTML='<option value="">Lead auswählen …</option>'+leads.map(l=>`<option value="${l.id}">${l.company_name}</option>`).join('');
  }
  async function save(){
    const leadId=$('dcLead').value;if(!leadId)throw new Error('Bitte zuerst einen Closing-Lead auswählen.');
    const assessment={organization_id:window.NXTGEN_ORG_ID,lead_id:leadId,current_process:val('dcProcess')||null,core_problem:val('dcProblem')||null,desired_outcome:val('dcOutcome')||null,urgency:$('dcUrgency').value,budget_range:val('dcBudget')||null,decision_maker:val('dcDecisionMaker')||null,target_start:$('dcStart').value||null,team_size:Number($('dcTeam').value||0)||null,monthly_volume:Number($('dcVolume').value||0)||null,objections:val('dcObjections')?[val('dcObjections')]:[],qualification_score:score(),status:'completed',summary:`${val('dcProblem')} → ${val('dcOutcome')}`,updated_at:new Date().toISOString()};
    const solution={organization_id:window.NXTGEN_ORG_ID,lead_id:leadId,status:'recommended',package_name:selectedProducts().map(x=>x.name).join(' + ')||'Individuelles Angebot',selected_products:selectedProducts(),selected_modules:[],scope_items:selectedProducts().map(x=>x.scope),setup_fee:Number($('dcSetup').value||0),monthly_fee:Number($('dcMonthly').value||0),term_months:Number($('dcTerm').value||12),rationale:`Empfohlen auf Basis der Bedarfsanalyse mit Score ${assessment.qualification_score}%.`,updated_at:new Date().toISOString()};
    if(dbReady()){
      const {data:a,error:ae}=await window.NXTGEN_DB.from('discovery_assessments').upsert(assessment,{onConflict:'lead_id'}).select('id').single();if(ae)throw ae;assessmentId=a.id;solution.assessment_id=assessmentId;
      const {error:se}=await window.NXTGEN_DB.from('solution_configurations').upsert(solution,{onConflict:'lead_id'});if(se)throw se;
      await window.NXTGEN_DB.rpc('advance_lead_stage',{p_lead_id:leadId,p_stage:'solution_configured'});
    }else{localStorage.setItem(`nxtgen_discovery_${leadId}`,JSON.stringify({assessment,solution}));const all=JSON.parse(localStorage.getItem('nxtgen_demo_leads')||'[]');const lead=all.find(x=>String(x.id)===String(leadId));if(lead)lead.stage='solution_configured';localStorage.setItem('nxtgen_demo_leads',JSON.stringify(all));}
    return {assessment,solution};
  }
  function applyToOffer(solution){
    const lead=leads.find(x=>String(x.id)===String($('dcLead').value));
    const set=(id,value)=>{const el=document.getElementById(id);if(el){el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}))}};
    set('ofPackage',solution.package_name);set('ofClient',lead?.company_name||'');set('ofContact',lead?.contact_name||'');set('ofEmail',lead?.email||'');set('ofSetup',solution.setup_fee);set('ofRetainer',solution.monthly_fee);set('ofMonths',solution.term_months);
    document.querySelectorAll('.service-picker input').forEach(x=>{x.checked=solution.scope_items.includes(x.value);x.dispatchEvent(new Event('change',{bubbles:true}))});
    const custom=document.getElementById('ofCustom');if(custom){custom.value=solution.scope_items.filter(x=>![...document.querySelectorAll('.service-picker input')].map(i=>i.value).includes(x)).join(' · ');custom.dispatchEvent(new Event('input',{bubbles:true}))}
    window.scrollTo({top:sales.offsetTop+host.offsetHeight,behavior:'smooth'});
  }
  $('dcSave').onclick=async()=>{try{$('dcMessage').textContent='Speichert …';const r=await save();$('dcMessage').dataset.type='success';$('dcMessage').textContent=`Gesprächsakte gespeichert · Score ${r.assessment.qualification_score}%`; }catch(e){$('dcMessage').dataset.type='error';$('dcMessage').textContent=e.message}};
  $('dcToOffer').onclick=async()=>{try{$('dcMessage').textContent='Bereitet Angebot vor …';const r=await save();applyToOffer(r.solution);$('dcMessage').dataset.type='success';$('dcMessage').textContent='Lösung wurde in den Angebotskonfigurator übernommen.';}catch(e){$('dcMessage').dataset.type='error';$('dcMessage').textContent=e.message}};
  window.addEventListener('nxtgen:ready',loadLeads);setTimeout(loadLeads,500);score();
})();
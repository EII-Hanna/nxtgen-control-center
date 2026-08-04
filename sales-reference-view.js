(() => {
  const db = () => window.NXTGEN_DB;
  const org = () => window.NXTGEN_ORG_ID;
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let leads=[];

  async function loadLeads(){
    if(!db()||!org()) return;
    const {data,error}=await db().from('leads').select('*').eq('organization_id',org()).order('created_at',{ascending:false}).limit(30);
    if(!error) leads=data||[];
  }

  function render(){
    const el=document.getElementById('sales');
    if(!el||!el.classList.contains('active')) return;
    const selected=leads.find(x=>['meeting_booked','meeting_completed','qualified','contacted'].includes(x.stage))||leads[0];
    const readiness=0;
    el.innerHTML=`<div class="srv-page">
      <div class="srv-topline"><div><span>SALES&nbsp;&nbsp;/&nbsp;&nbsp;SCHRITT 2 VON 5</span><h2>Erstgespräch & Lösungsfindung</h2><p>Verstehe die Situation, identifiziere das Kernproblem und qualifiziere den Bedarf.</p></div><div class="srv-readiness">⌁ <b>Deal Readiness</b><strong>${readiness}%</strong><i>ⓘ</i></div></div>
      <div class="srv-layout">
        <div class="srv-maincol">
          <section class="srv-card srv-record-card"><h3>Gesprächsakte</h3><p>Alle Erkenntnisse aus dem Erstgespräch auf einen Blick.</p>${selected?`<button data-lead="${selected.id}">▢ &nbsp;Gesprächsakte öffnen</button>`:'<button disabled>Keine Leads vorhanden</button>'}</section>
          <section class="srv-card srv-activity"><h3>Letzte Aktivitäten</h3><div><span>▣</span><p><b>Erstgespräch geführt</b><small>Heute, 10:32</small></p></div><div><span>▣</span><p><b>Transkript verarbeitet</b><small>Wartet auf Webhook</small></p></div><div><span>▣</span><p><b>KI-Analyse</b><small>Noch nicht gestartet</small></p></div><button>Alle Aktivitäten anzeigen</button></section>
        </div>
        <section class="srv-card srv-context"><div><span>LEAD / UNTERNEHMEN</span><h3>${esc(selected?.company_name||'Lead auswählen')}</h3><p>${esc(selected?.contact_name||selected?.email||'Kein Ansprechpartner')}</p></div><div class="srv-context-grid"><article><span>Aktueller Prozess</span><p>${esc(selected?.need_summary||'Noch nicht erkannt')}</p></article><article><span>Kernproblem</span><p>Noch nicht erkannt</p></article><article><span>Nächster Schritt</span><p>${esc(selected?.next_step||'Noch nicht gesetzt')}</p></article><article><span>Termin</span><p>${selected?.meeting_at?new Date(selected.meeting_at).toLocaleString('de-DE'):'Noch nicht geplant'}</p></article></div></section>
      </div>
      <div class="srv-wave"></div>
    </div>`;
  }

  async function activate(){await loadLeads();render();}
  document.addEventListener('click',e=>{if(e.target.closest('[data-core-view="sales"]'))setTimeout(activate,80)},true);
  window.addEventListener('nxtgen:ready',()=>setTimeout(()=>{if(document.getElementById('sales')?.classList.contains('active'))activate()},150));
})();
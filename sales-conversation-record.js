(() => {
  const db = () => window.NXTGEN_DB;
  const org = () => window.NXTGEN_ORG_ID;
  const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const arr = v => Array.isArray(v) ? v : [];

  async function getLead(id) {
    const { data, error } = await db().from('leads').select('*').eq('id', id).eq('organization_id', org()).single();
    if (error) throw error;
    return data;
  }

  async function getMeeting(leadId) {
    const { data, error } = await db().from('meeting_records').select('*').eq('lead_id', leadId).eq('organization_id', org()).order('created_at',{ascending:false}).limit(1);
    if (error && error.code !== '42P01') throw error;
    return data?.[0] || null;
  }

  function field(label, value, tone='') {
    return `<article class="cr-field ${tone}"><span>${label}</span><p>${esc(value || 'Noch nicht erkannt')}</p></article>`;
  }

  function openModal(lead, meeting) {
    document.querySelector('.cr-backdrop')?.remove();
    const score = Number(meeting?.qualification_score || 0);
    const status = meeting?.analysis_status || 'queued';
    const provider = meeting?.provider || 'zoom';
    const wrap = document.createElement('div');
    wrap.className = 'cr-backdrop';
    wrap.innerHTML = `<section class="cr-modal">
      <header class="cr-head">
        <div><span class="cr-kicker">SALES / GESPRÄCHSAKTE</span><h2>Gesprächsakte</h2><div class="cr-ai-badge">✦ ${provider === 'fireflies' ? 'Fireflies AI' : 'Zoom + NXTGEN AI'} · ${status === 'ready' ? 'Gespräch ausgewertet' : 'Verarbeitung vorbereitet'}</div></div>
        <div class="cr-score"><span>Deal Readiness</span><strong>${score}%</strong></div>
        <button class="cr-close" aria-label="Schließen">×</button>
      </header>
      <div class="cr-company"><div class="cr-avatar">${esc((lead.company_name||'N').slice(0,1))}</div><div><small>LEAD / UNTERNEHMEN</small><h3>${esc(lead.company_name||'Unbekannt')}</h3><p>${esc(lead.contact_name||lead.email||'Kein Ansprechpartner')}</p></div><div class="cr-meta"><span>Quelle<b>${esc(lead.source||'manual')}</b></span><span>Status<b>${esc(lead.stage||'new')}</b></span><span>Termin<b>${lead.meeting_at ? new Date(lead.meeting_at).toLocaleString('de-DE') : '—'}</b></span></div></div>
      <div class="cr-grid">
        ${field('Gesprächszusammenfassung', meeting?.summary, 'wide green')}
        ${field('Aktueller Prozess', meeting?.current_process, 'wide')}
        ${field('Kernproblem', meeting?.core_problem, 'warn')}
        ${field('Zielbild', meeting?.target_state, 'blue')}
        ${field('Entscheider', meeting?.decision_maker || lead.contact_name)}
        ${field('Dringlichkeit', meeting?.urgency)}
        ${field('Budgetrahmen', meeting?.budget_range)}
        ${field('Nächster Schritt', meeting?.next_step || lead.next_step)}
      </div>
      <div class="cr-bottom">
        <article class="cr-actions"><span>WESENTLICHE ACTION ITEMS</span>${arr(meeting?.action_items).length ? arr(meeting.action_items).map(x=>`<p>✓ ${esc(typeof x==='string'?x:(x.title||x.text||JSON.stringify(x)))}</p>`).join('') : '<p>○ Noch keine Action Items erkannt</p>'}</article>
        <article class="cr-ai-note"><span>KI-HINWEIS</span><p>${status==='ready' ? 'Die Akte wurde aus Transkript und Meeting-Kontext erzeugt. Menschliche Prüfung bleibt erforderlich.' : 'Nach Ende des Zoom-Calls triggert der Webhook die Transkriptions- und Analyse-Automation.'}</p></article>
      </div>
      <footer class="cr-footer"><div><span class="cr-provider-dot"></span>${status==='ready'?'Transkript & Analyse verfügbar':'Warte auf Meeting-Webhook'}</div><div class="cr-footer-actions"><button class="ui-btn ghost cr-refresh">Aktualisieren</button>${meeting?.transcript_url?`<a class="ui-btn primary" href="${esc(meeting.transcript_url)}" target="_blank" rel="noopener">Transkript öffnen ↗</a>`:''}</div></footer>
    </section>`;
    document.body.appendChild(wrap);
    wrap.querySelector('.cr-close').onclick = () => wrap.remove();
    wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
    wrap.querySelector('.cr-refresh').onclick = async () => {
      const fresh = await getMeeting(lead.id);
      wrap.remove();
      openModal(lead, fresh);
    };
  }

  async function openForLead(id) {
    try {
      const [lead, meeting] = await Promise.all([getLead(id), getMeeting(id)]);
      openModal(lead, meeting);
    } catch (error) {
      console.error('Gesprächsakte konnte nicht geladen werden', error);
    }
  }

  document.addEventListener('click', event => {
    const target = event.target.closest('[data-lead]');
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openForLead(target.dataset.lead);
  }, true);
})();
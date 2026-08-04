(() => {
  const db = () => window.NXTGEN_DB;
  const org = () => window.NXTGEN_ORG_ID;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const asList = v => Array.isArray(v) ? v : [];

  async function getLead(id) {
    const { data, error } = await db().from('leads').select('*').eq('id', id).eq('organization_id', org()).single();
    if (error) throw error;
    return data;
  }

  async function getMeeting(leadId) {
    try {
      const { data, error } = await db().from('meeting_records').select('*').eq('lead_id', leadId).eq('organization_id', org()).order('created_at',{ascending:false}).limit(1);
      if (error) return null;
      return data?.[0] || null;
    } catch { return null; }
  }

  const value = (v, fallback='Noch nicht erkannt') => esc(v || fallback);
  const compactDate = v => v ? new Intl.DateTimeFormat('de-DE',{dateStyle:'short',timeStyle:'short'}).format(new Date(v)) : '—';

  function closeRecord() {
    document.querySelector('.ncr-shell')?.remove();
    document.body.classList.remove('ncr-open');
  }

  function openRecord(lead, meeting) {
    closeRecord();
    document.body.classList.add('ncr-open');
    const score = Math.max(0, Math.min(100, Number(meeting?.qualification_score || 0)));
    const ready = meeting?.analysis_status === 'ready';
    const actions = asList(meeting?.action_items);
    const shell = document.createElement('div');
    shell.className = 'ncr-shell';
    shell.innerHTML = `
      <div class="ncr-stage">
        <section class="ncr-modal" role="dialog" aria-modal="true" aria-label="Gesprächsakte">
          <header class="ncr-header">
            <div class="ncr-title-wrap">
              <div class="ncr-title-line"><span class="ncr-folder">□</span><h2>Gesprächsakte</h2></div>
              <div class="ncr-ai-pill">✦ ${ready ? 'NXTGEN AI · Gespräch automatisch transkribiert & ausgewertet' : 'Zoom + NXTGEN AI · Warte auf Meeting-Verarbeitung'}</div>
            </div>
            <div class="ncr-readiness">
              <div><span>QUALIFIZIERUNG</span><strong>Deal Readiness</strong><small>${ready ? 'Aktuelle Bewertung' : 'Frühe Phase'}</small></div>
              <div class="ncr-ring" style="--score:${score}"><b>${score}%</b></div>
            </div>
            <button class="ncr-close" aria-label="Schließen">×</button>
          </header>

          <section class="ncr-company">
            <div class="ncr-company-main">
              <div class="ncr-avatar">${esc((lead.company_name || 'N').slice(0,1).toUpperCase())}</div>
              <div><span>LEAD / UNTERNEHMEN</span><strong>${value(lead.company_name,'Unbekanntes Unternehmen')}</strong><small>${value(lead.contact_name || lead.email,'Kein Ansprechpartner')}</small></div>
            </div>
            <div class="ncr-company-meta">
              <div><span>Quelle</span><b>${value(lead.source,'manual')}</b></div>
              <div><span>Status</span><b>${value(lead.stage,'new')}</b></div>
              <div><span>Termin</span><b>${compactDate(lead.meeting_at)}</b></div>
            </div>
          </section>

          <section class="ncr-grid ncr-grid-top">
            <article class="ncr-card ncr-accent-green"><span>✦ GESPRÄCHSZUSAMMENFASSUNG</span><p>${value(meeting?.summary)}</p></article>
            <article class="ncr-card"><span>◌ AKTUELLER PROZESS</span><p>${value(meeting?.current_process)}</p></article>
            <article class="ncr-card ncr-accent-amber"><span>△ KERNPROBLEM</span><p>${value(meeting?.core_problem)}</p></article>
            <article class="ncr-card ncr-accent-blue"><span>◎ ZIELBILD</span><p>${value(meeting?.target_state)}</p></article>
          </section>

          <section class="ncr-grid ncr-grid-metrics">
            <article class="ncr-mini"><span>♙ ENTSCHEIDER</span><strong>${value(meeting?.decision_maker || lead.contact_name,'Noch nicht erkannt')}</strong><small>${value(meeting?.decision_maker_role,'')}</small></article>
            <article class="ncr-mini"><span>ϟ DRINGLICHKEIT</span><strong>${value(meeting?.urgency)}</strong></article>
            <article class="ncr-mini"><span>€ BUDGETRAHMEN</span><strong>${value(meeting?.budget_range)}</strong></article>
            <article class="ncr-mini"><span>□ NÄCHSTER SCHRITT</span><strong>${value(meeting?.next_step || lead.next_step)}</strong></article>
          </section>

          <section class="ncr-lower">
            <article class="ncr-actions"><span>WESENTLICHE ACTION ITEMS</span>${actions.length ? actions.map(item => `<p>✓ ${esc(typeof item === 'string' ? item : item.title || item.text || 'Action Item')}</p>`).join('') : '<p>○ Noch keine Action Items erkannt</p>'}</article>
            <article class="ncr-note"><span>✦ KI-HINWEIS</span><p>${ready ? 'Die Gesprächsakte wurde automatisch aus Transkript und Meeting-Kontext erstellt. Menschliche Prüfung bleibt erforderlich.' : 'Nach Ende des Zoom-Calls triggert der Webhook die Transkriptions- und Analyse-Automation.'}</p></article>
          </section>

          <footer class="ncr-footer">
            <div><i></i>${ready ? 'Transkript & Analyse verfügbar' : 'Gesprächsakte vorbereitet · wartet auf Webhook'}</div>
            <div><span>${meeting?.updated_at ? `Zuletzt aktualisiert: ${compactDate(meeting.updated_at)}` : ''}</span><button class="ncr-refresh">Aktualisieren</button>${meeting?.transcript_url ? `<a href="${esc(meeting.transcript_url)}" target="_blank" rel="noopener">Transkript öffnen ↗</a>` : ''}</div>
          </footer>
        </section>
      </div>`;
    document.body.appendChild(shell);
    shell.querySelector('.ncr-close').onclick = closeRecord;
    shell.addEventListener('click', e => { if (e.target === shell || e.target.classList.contains('ncr-stage')) closeRecord(); });
    shell.querySelector('.ncr-refresh').onclick = async () => openRecord(lead, await getMeeting(lead.id));
  }

  async function openForLead(id) {
    try {
      const lead = await getLead(id);
      openRecord(lead, null);
      const meeting = await getMeeting(id);
      if (meeting && document.querySelector('.ncr-shell')) openRecord(lead, meeting);
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
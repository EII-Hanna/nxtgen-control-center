(() => {
  const db = () => window.NXTGEN_DB;
  const org = () => window.NXTGEN_ORG_ID;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const arr = v => Array.isArray(v) ? v : [];

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
    } catch (_) {
      return null;
    }
  }

  const value = (v, fallback='Noch nicht erkannt') => esc(v || fallback);

  function openModal(lead, meeting) {
    document.querySelector('.cr-backdrop')?.remove();
    const score = Math.max(0, Math.min(100, Number(meeting?.qualification_score || 0)));
    const status = meeting?.analysis_status || 'waiting';
    const provider = meeting?.provider || 'zoom';
    const actionItems = arr(meeting?.action_items);
    const wrap = document.createElement('div');
    wrap.className = 'cr-backdrop';
    wrap.innerHTML = `<section class="cr-modal cr-compact">
      <button class="cr-close" aria-label="Schließen">×</button>

      <header class="cr-head">
        <div class="cr-title-block">
          <span class="cr-kicker">SALES / GESPRÄCHSAKTE</span>
          <h2><span class="cr-folder">▱</span> Gesprächsakte</h2>
          <div class="cr-ai-badge">✦ ${provider === 'fireflies' ? 'Fireflies AI' : 'Zoom + NXTGEN AI'} · ${status === 'ready' ? 'Gespräch ausgewertet' : 'Warte auf Meeting-Verarbeitung'}</div>
        </div>
        <div class="cr-readiness">
          <div><small>QUALIFIZIERUNG</small><b>Deal Readiness</b><span>${status === 'ready' ? 'Aktueller Stand' : 'Frühe Phase'}</span></div>
          <div class="cr-ring" style="--score:${score}"><strong>${score}%</strong></div>
        </div>
      </header>

      <section class="cr-company">
        <div class="cr-company-main">
          <div class="cr-avatar">${esc((lead.company_name || 'N').slice(0,1).toUpperCase())}</div>
          <div><small>LEAD / UNTERNEHMEN</small><h3>${value(lead.company_name,'Unbekannt')}</h3><p>${value(lead.contact_name || lead.email,'Kein Ansprechpartner')}</p></div>
        </div>
        <div class="cr-meta"><span>Quelle<b>${value(lead.source,'manual')}</b></span><span>Status<b>${value(lead.stage,'new')}</b></span><span>Termin<b>${lead.meeting_at ? new Date(lead.meeting_at).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'}) : '—'}</b></span></div>
      </section>

      <section class="cr-grid cr-grid-primary">
        <article class="cr-field cr-summary"><span>✦ GESPRÄCHSZUSAMMENFASSUNG</span><p>${value(meeting?.summary)}</p></article>
        <article class="cr-field"><span>⌁ AKTUELLER PROZESS</span><p>${value(meeting?.current_process)}</p></article>
        <article class="cr-field cr-problem"><span>△ KERNPROBLEM</span><p>${value(meeting?.core_problem)}</p></article>
        <article class="cr-field cr-target"><span>◎ ZIELBILD</span><p>${value(meeting?.target_state)}</p></article>
      </section>

      <section class="cr-grid cr-grid-secondary">
        <article class="cr-field cr-small"><span>♙ ENTSCHEIDER</span><p>${value(meeting?.decision_maker || lead.contact_name)}</p></article>
        <article class="cr-field cr-small"><span>ϟ DRINGLICHKEIT</span><p>${value(meeting?.urgency)}</p></article>
        <article class="cr-field cr-small"><span>€ BUDGETRAHMEN</span><p>${value(meeting?.budget_range)}</p></article>
        <article class="cr-field cr-small"><span>▣ NÄCHSTER SCHRITT</span><p>${value(meeting?.next_step || lead.next_step)}</p></article>
      </section>

      <section class="cr-bottom">
        <article class="cr-actions"><span>WESENTLICHE ACTION ITEMS</span>${actionItems.length ? actionItems.slice(0,4).map(x=>`<p>✓ ${esc(typeof x === 'string' ? x : (x.title || x.text || JSON.stringify(x)))}</p>`).join('') : '<p>○ Noch keine Action Items erkannt</p>'}</article>
        <article class="cr-ai-note"><span>✦ KI-HINWEIS</span><p>${status === 'ready' ? 'Akte aus Transkript und Meeting-Kontext erzeugt. Menschliche Prüfung bleibt erforderlich.' : 'Nach Ende des Zoom-Calls triggert der Webhook Transkription und Analyse.'}</p></article>
      </section>

      <footer class="cr-footer"><div><span class="cr-provider-dot"></span>${status === 'ready' ? 'Transkript & Analyse verfügbar' : 'Gesprächsakte bereit · wartet auf Webhook'}</div><div class="cr-footer-actions"><button class="ui-btn ghost cr-refresh">Aktualisieren</button>${meeting?.transcript_url ? `<a class="ui-btn primary" href="${esc(meeting.transcript_url)}" target="_blank" rel="noopener">Transkript öffnen ↗</a>` : ''}</div></footer>
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
      const lead = await getLead(id);
      openModal(lead, null);
      const meeting = await getMeeting(id);
      if (meeting) {
        document.querySelector('.cr-backdrop')?.remove();
        openModal(lead, meeting);
      }
    } catch (error) {
      console.error('Gesprächsakte konnte nicht geladen werden', error);
      alert(`Gesprächsakte konnte nicht geöffnet werden: ${error.message || error}`);
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
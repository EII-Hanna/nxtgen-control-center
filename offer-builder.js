(() => {
  const sales = document.getElementById('sales');
  if (!sales) return;
  sales.classList.remove('empty');
  sales.innerHTML = `
    <div class="sales-revenue-head">
      <div><p class="eyebrow">SALES-TO-CASH ENGINE</p><h2>Angebot erstellen</h2><p>Kundendaten, Leistungsumfang und Wirtschaftlichkeit in einer Ansicht konfigurieren.</p></div>
      <span class="offer-status"><i></i> REVENUE FLOW</span>
    </div>
    <div class="offer-shell">
      <section class="offer-panel">
        <h2>Konfigurator</h2><p class="sub">Die Vorschau aktualisiert sich sofort. Anbieter ist aktuell bewusst ohne Rechtsform hinterlegt.</p>
        <div class="offer-grid">
          <div class="offer-field full"><label>PAKET / ANGEBOT</label><input id="ofPackage" value="VIP"></div>
          <div class="offer-field full"><label>KUNDENUNTERNEHMEN</label><input id="ofClient" value="Musterunternehmen"></div>
          <div class="offer-field"><label>ANSPRECHPARTNER</label><input id="ofContact" value="Max Mustermann"></div>
          <div class="offer-field"><label>E-MAIL</label><input id="ofEmail" type="email" value="max@firma.de"></div>
          <div class="offer-field"><label>SETUP NETTO</label><input id="ofSetup" type="number" min="0" value="5000"></div>
          <div class="offer-field"><label>RETAINER / MONAT</label><input id="ofRetainer" type="number" min="0" value="3499"></div>
          <div class="offer-field"><label>LAUFZEIT MONATE</label><input id="ofMonths" type="number" min="1" value="12"></div>
          <div class="offer-field"><label>GÜLTIGKEIT TAGE</label><input id="ofValidity" type="number" min="1" value="30"></div>
          <div class="offer-field full"><label>LEISTUNGSUMFANG</label>
            <div class="service-picker">
              <label><input type="checkbox" checked value="End-to-End Vertriebs- & Delivery-System">End-to-End Vertriebs- & Delivery-System</label>
              <label><input type="checkbox" checked value="Unbegrenzte Automatisierungen">Unbegrenzte Automatisierungen</label>
              <label><input type="checkbox" checked value="Zwei Strategie-Sessions pro Woche">Zwei Strategie-Sessions pro Woche</label>
              <label><input type="checkbox" checked value="Persönlicher Ansprechpartner">Persönlicher Ansprechpartner</label>
              <label><input type="checkbox" checked value="Quartals-Review mit Roadmap">Quartals-Review mit Roadmap</label>
            </div>
          </div>
          <div class="offer-field full"><label>INDIVIDUELLE LEISTUNG</label><input id="ofCustom" placeholder="Weitere Position ergänzen"></div>
        </div>
        <div class="offer-actions"><button class="btn" id="saveDraft">Entwurf speichern</button><button class="btn primary" id="createPackage">Dokumentpaket erstellen</button></div>
      </section>
      <section class="offer-preview-wrap">
        <article class="offer-preview" id="offerPreview">
          <header class="offer-doc-head">
            <div class="offer-brand"><div class="offer-logo">N</div><div><strong>NXTGENdigital</strong><span>DIGITALISIERUNG & AUTOMATISIERUNG</span></div></div>
            <div class="offer-meta"><b>Angebot</b><span id="pvDate"></span><span id="pvValidity"></span></div>
          </header>
          <div class="offer-title"><h2><span id="pvPackage">VIP</span> · <span id="pvClientTitle">Musterunternehmen</span></h2><p><span id="pvPackageSub">VIP</span> · Laufzeit <span id="pvMonthsTitle">12</span> Monate</p></div>
          <div class="party-grid">
            <div class="party-card"><span>KUNDE</span><strong id="pvClient">Musterunternehmen</strong><small><span id="pvContact">Max Mustermann</span> · <span id="pvEmail">max@firma.de</span></small></div>
            <div class="party-card"><span>ANBIETER</span><strong>NXTGENdigital</strong><small>kontakt@nxtgendigital.de · nxtgendigital.de</small></div>
          </div>
          <section class="offer-section"><h3>Leistungsumfang</h3><ul class="offer-services" id="pvServices"></ul></section>
          <section class="offer-section"><h3>Wirtschaftlichkeit</h3><table class="price-table"><thead><tr><th>POSITION</th><th>BETRAG</th></tr></thead><tbody><tr><td>Einmaliges Setup</td><td id="pvSetup"></td></tr><tr><td>Monatlicher Retainer (<span id="pvMonthsRow">12</span> Monate)</td><td id="pvRetainer"></td></tr></tbody></table><div class="investment"><span>INVESTITIONSVOLUMEN (<span id="pvMonthsInvestment">12</span> MONATE)</span><strong id="pvTotal"></strong></div></section>
          <p class="offer-note">Zahlungsbedingungen: Setup fällig bei Beauftragung, Retainer monatlich im Voraus. Alle Preise zzgl. gesetzlicher MwSt., sofern diese anfällt. Dieses Angebot ist <span id="pvValidityText">30</span> Tage ab Ausstellungsdatum gültig.</p>
          <footer class="offer-footer">NXTGENdigital · Carl-Benz-Allee 4 · 61118 Bad Vilbel · nxtgendigital.de</footer>
        </article>
      </section>
    </div>`;

  const $ = id => document.getElementById(id);
  const money = value => new Intl.NumberFormat('de-DE', { style:'currency', currency:'EUR', minimumFractionDigits:0, maximumFractionDigits:0 }).format(Number(value || 0));
  const formatDate = date => new Intl.DateTimeFormat('de-DE', { day:'numeric', month:'long', year:'numeric' }).format(date);
  const fields = ['ofPackage','ofClient','ofContact','ofEmail','ofSetup','ofRetainer','ofMonths','ofValidity','ofCustom'];

  function render(){
    const packageName = $('ofPackage').value.trim() || 'Individuelles Angebot';
    const client = $('ofClient').value.trim() || 'Kunde';
    const contact = $('ofContact').value.trim() || 'Ansprechpartner';
    const email = $('ofEmail').value.trim() || '—';
    const setup = Number($('ofSetup').value || 0);
    const retainer = Number($('ofRetainer').value || 0);
    const months = Math.max(1, Number($('ofMonths').value || 1));
    const validity = Math.max(1, Number($('ofValidity').value || 30));
    const services = [...sales.querySelectorAll('.service-picker input:checked')].map(x => x.value);
    const custom = $('ofCustom').value.trim(); if(custom) services.push(custom);
    $('pvPackage').textContent = packageName; $('pvPackageSub').textContent = packageName;
    $('pvClientTitle').textContent = client; $('pvClient').textContent = client; $('pvContact').textContent = contact; $('pvEmail').textContent = email;
    $('pvMonthsTitle').textContent = months; $('pvMonthsRow').textContent = months; $('pvMonthsInvestment').textContent = months;
    $('pvSetup').textContent = money(setup); $('pvRetainer').textContent = `${money(retainer)} / Mo.`; $('pvTotal').textContent = money(setup + retainer * months);
    $('pvValidity').textContent = `Gültig: ${validity} Tage`; $('pvValidityText').textContent = validity; $('pvDate').textContent = `Datum: ${formatDate(new Date())}`;
    $('pvServices').innerHTML = services.map(s => `<li>${escapeHtml(s)}</li>`).join('');
  }
  function escapeHtml(value){ const div=document.createElement('div'); div.textContent=value; return div.innerHTML; }
  fields.forEach(id => $(id).addEventListener('input', render));
  sales.querySelectorAll('.service-picker input').forEach(x => x.addEventListener('change', render));
  $('saveDraft').addEventListener('click', () => {
    const draft = Object.fromEntries(fields.map(id => [id, $(id).value]));
    draft.services = [...sales.querySelectorAll('.service-picker input:checked')].map(x => x.value);
    localStorage.setItem('nxtgen_offer_draft', JSON.stringify(draft));
    $('saveDraft').textContent = 'Entwurf gespeichert ✓'; setTimeout(() => $('saveDraft').textContent = 'Entwurf speichern', 1800);
  });
  $('createPackage').addEventListener('click', () => alert('Dokumentpaket-Grundlage steht. Nächster Schritt: PDF-Erzeugung, E-Mail-Versand und Signaturprovider verbinden.'));
  render();
})();
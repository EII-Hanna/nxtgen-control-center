(() => {
  const sales = document.getElementById('sales');
  if (!sales) return;

  sales.classList.remove('empty');
  sales.innerHTML = `
    <div class="sales-revenue-head">
      <div><p class="eyebrow">SALES-TO-CASH ENGINE</p><h2>Angebot erstellen</h2><p>Kunde auswählen, Leistungsumfang konfigurieren und ein Vertragspaket vorbereiten.</p></div>
      <span class="offer-status"><i></i> REVENUE FLOW</span>
    </div>
    <div class="offer-shell">
      <section class="offer-panel">
        <h2>Konfigurator</h2><p class="sub">Anbieter: NXTGENdigital – bewusst ohne GmbH. Die Vorschau aktualisiert sich sofort.</p>
        <div class="offer-grid">
          <div class="offer-field full"><label>KUNDE AUS NXTGEN</label><select id="ofClientSelect"><option value="">Kunde manuell erfassen</option></select></div>
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
        <div class="offer-actions">
          <button class="btn" id="saveDraft">Entwurf in NXTGEN speichern</button>
          <button class="btn primary" id="createPackage">Vertragspaket vorbereiten</button>
        </div>
        <div id="offerMessage" class="offer-message"></div>
      </section>
      <section class="offer-preview-wrap">
        <article class="offer-preview" id="offerPreview">
          <header class="offer-doc-head">
            <div class="offer-brand"><div class="offer-logo">N</div><div><strong>NXTGENdigital</strong><span>DIGITALISIERUNG & AUTOMATISIERUNG</span></div></div>
            <div class="offer-meta"><b>Angebot</b><span id="pvOfferNumber">Entwurf</span><span id="pvDate"></span><span id="pvValidity"></span></div>
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
  let clients = [];
  let currentOfferId = null;
  let currentOfferNumber = null;

  function escapeHtml(value){ const div=document.createElement('div'); div.textContent=value ?? ''; return div.innerHTML; }
  function services(){
    const list = [...sales.querySelectorAll('.service-picker input:checked')].map(x => x.value);
    const custom = $('ofCustom').value.trim();
    if(custom) list.push(custom);
    return list;
  }
  function values(){
    const setup = Number($('ofSetup').value || 0);
    const recurring = Number($('ofRetainer').value || 0);
    const months = Math.max(1, Number($('ofMonths').value || 1));
    return {
      clientId: $('ofClientSelect').value || null,
      packageName: $('ofPackage').value.trim() || 'Individuelles Angebot',
      clientName: $('ofClient').value.trim() || 'Kunde',
      contactName: $('ofContact').value.trim() || 'Ansprechpartner',
      contactEmail: $('ofEmail').value.trim(),
      setup,
      recurring,
      months,
      validity: Math.max(1, Number($('ofValidity').value || 30)),
      scope: services(),
      total: setup + recurring * months
    };
  }
  function render(){
    const v = values();
    $('pvPackage').textContent = v.packageName;
    $('pvPackageSub').textContent = v.packageName;
    $('pvClientTitle').textContent = v.clientName;
    $('pvClient').textContent = v.clientName;
    $('pvContact').textContent = v.contactName;
    $('pvEmail').textContent = v.contactEmail || '—';
    $('pvMonthsTitle').textContent = v.months;
    $('pvMonthsRow').textContent = v.months;
    $('pvMonthsInvestment').textContent = v.months;
    $('pvSetup').textContent = money(v.setup);
    $('pvRetainer').textContent = `${money(v.recurring)} / Mo.`;
    $('pvTotal').textContent = money(v.total);
    $('pvValidity').textContent = `Gültig: ${v.validity} Tage`;
    $('pvValidityText').textContent = v.validity;
    $('pvDate').textContent = `Datum: ${formatDate(new Date())}`;
    $('pvOfferNumber').textContent = currentOfferNumber || 'Entwurf';
    $('pvServices').innerHTML = v.scope.map(s => `<li>${escapeHtml(s)}</li>`).join('');
  }
  function message(text, type='info'){
    const el = $('offerMessage');
    el.textContent = text;
    el.dataset.type = type;
  }
  function dbReady(){ return Boolean(window.NXTGEN_DB && window.NXTGEN_ORG_ID); }
  function valid(v){
    if(!v.clientId) return 'Bitte zuerst einen bestehenden Kunden aus NXTGEN auswählen.';
    if(!v.contactEmail || !/^\S+@\S+\.\S+$/.test(v.contactEmail)) return 'Bitte eine gültige Kunden-E-Mail eintragen.';
    if(!v.scope.length) return 'Bitte mindestens eine Leistung auswählen.';
    return null;
  }

  async function loadClients(){
    if(!dbReady()) return;
    const { data, error } = await window.NXTGEN_DB
      .from('clients')
      .select('id,company_name,website,industry,status,contacts(id,first_name,last_name,email,is_primary)')
      .eq('organization_id', window.NXTGEN_ORG_ID)
      .order('company_name');
    if(error){ message(`Kunden konnten nicht geladen werden: ${error.message}`, 'error'); return; }
    clients = data || [];
    $('ofClientSelect').innerHTML = '<option value="">Kunde auswählen …</option>' + clients.map(c => `<option value="${c.id}">${escapeHtml(c.company_name)}</option>`).join('');
  }

  function applyClient(clientId){
    const client = clients.find(c => c.id === clientId);
    if(!client) return;
    const primary = (client.contacts || []).find(c => c.is_primary) || (client.contacts || [])[0];
    $('ofClient').value = client.company_name || '';
    if(primary){
      $('ofContact').value = [primary.first_name, primary.last_name].filter(Boolean).join(' ');
      $('ofEmail').value = primary.email || '';
    }
    currentOfferId = null;
    currentOfferNumber = null;
    render();
  }

  async function persistOffer(status='draft'){
    if(!dbReady()) throw new Error('Supabase ist noch nicht verbunden.');
    const v = values();
    const validation = valid(v); if(validation) throw new Error(validation);
    const selectedClient = clients.find(c => c.id === v.clientId);
    const provider = {
      name: 'NXTGENdigital',
      legal_form: null,
      street: 'Carl-Benz-Allee 4',
      postal_code: '61118',
      city: 'Bad Vilbel',
      email: 'kontakt@nxtgendigital.de',
      website: 'nxtgendigital.de'
    };
    if(!currentOfferNumber){
      const { data, error } = await window.NXTGEN_DB.rpc('next_offer_number', { p_organization_id: window.NXTGEN_ORG_ID });
      if(error) throw error;
      currentOfferNumber = data;
    }
    const validUntil = new Date(); validUntil.setDate(validUntil.getDate() + v.validity);
    const payload = {
      organization_id: window.NXTGEN_ORG_ID,
      client_id: v.clientId,
      offer_number: currentOfferNumber,
      title: v.packageName,
      status,
      setup_fee: v.setup,
      recurring_fee: v.recurring,
      billing_interval: 'monthly',
      minimum_term_months: v.months,
      valid_until: validUntil.toISOString().slice(0,10),
      scope: v.scope,
      contact_name: v.contactName,
      contact_email: v.contactEmail,
      total_contract_value: v.total,
      client_snapshot: {
        id: v.clientId,
        company_name: v.clientName,
        website: selectedClient?.website || null,
        industry: selectedClient?.industry || null,
        contact_name: v.contactName,
        contact_email: v.contactEmail
      },
      provider_snapshot: provider,
      custom_variables: { validity_days: v.validity },
      generated_html: $('offerPreview').outerHTML
    };
    let query;
    if(currentOfferId){ query = window.NXTGEN_DB.from('commercial_offers').update(payload).eq('id', currentOfferId).select('id,offer_number').single(); }
    else { query = window.NXTGEN_DB.from('commercial_offers').insert(payload).select('id,offer_number').single(); }
    const { data, error } = await query;
    if(error) throw error;
    currentOfferId = data.id;
    currentOfferNumber = data.offer_number;
    render();
    return { ...v, offerId: currentOfferId, offerNumber: currentOfferNumber, provider };
  }

  async function createContractPackage(){
    const offer = await persistOffer('generated');
    const snapshot = {
      offer_number: offer.offerNumber,
      package_name: offer.packageName,
      client_name: offer.clientName,
      contact_name: offer.contactName,
      contact_email: offer.contactEmail,
      setup_fee: offer.setup,
      recurring_fee: offer.recurring,
      minimum_term_months: offer.months,
      total_contract_value: offer.total,
      scope: offer.scope,
      provider: offer.provider
    };
    const { data: packageRow, error: packageError } = await window.NXTGEN_DB.from('contract_packages').insert({
      organization_id: window.NXTGEN_ORG_ID,
      client_id: offer.clientId,
      offer_id: offer.offerId,
      status: 'draft',
      package_name: `${offer.packageName} · ${offer.clientName}`,
      signer_name: offer.contactName,
      signer_email: offer.contactEmail,
      generation_status: 'completed',
      offer_snapshot: snapshot
    }).select('id').single();
    if(packageError) throw packageError;

    const docs = [
      { document_type:'offer', sort_order:10, rendered_html:$('offerPreview').outerHTML },
      { document_type:'contract', sort_order:20, rendered_html:null },
      { document_type:'avv', sort_order:30, rendered_html:null },
      { document_type:'terms', sort_order:40, rendered_html:null }
    ].map(d => ({ ...d, organization_id: window.NXTGEN_ORG_ID, package_id: packageRow.id }));
    const { error: docsError } = await window.NXTGEN_DB.from('contract_documents').insert(docs);
    if(docsError) throw docsError;
    return packageRow.id;
  }

  fields.forEach(id => $(id).addEventListener('input', render));
  sales.querySelectorAll('.service-picker input').forEach(x => x.addEventListener('change', render));
  $('ofClientSelect').addEventListener('change', e => applyClient(e.target.value));

  $('saveDraft').addEventListener('click', async () => {
    const btn = $('saveDraft');
    try{
      btn.disabled = true; btn.textContent = 'Speichert …'; message('');
      await persistOffer('draft');
      btn.textContent = 'In NXTGEN gespeichert ✓';
      message(`Angebot ${currentOfferNumber} wurde als Entwurf gespeichert.`, 'success');
    }catch(error){
      btn.textContent = 'Entwurf speichern';
      message(error.message || 'Speichern fehlgeschlagen.', 'error');
    }finally{
      btn.disabled = false;
      setTimeout(() => { if(btn.textContent.includes('✓')) btn.textContent = 'Entwurf in NXTGEN speichern'; }, 1800);
    }
  });

  $('createPackage').addEventListener('click', async () => {
    const btn = $('createPackage');
    try{
      btn.disabled = true; btn.textContent = 'Paket wird erstellt …'; message('');
      const packageId = await createContractPackage();
      btn.textContent = 'Vertragspaket erstellt ✓';
      message(`Vertragspaket wurde vorbereitet. Paket-ID: ${packageId.slice(0,8)}. Vertrag, AVV und AGB werden nach Template-Mapping gerendert.`, 'success');
    }catch(error){
      btn.textContent = 'Vertragspaket vorbereiten';
      message(error.message || 'Paket konnte nicht erstellt werden.', 'error');
    }finally{
      btn.disabled = false;
      setTimeout(() => { if(btn.textContent.includes('✓')) btn.textContent = 'Vertragspaket vorbereiten'; }, 2200);
    }
  });

  window.addEventListener('nxtgen:ready', loadClients);
  render();
})();
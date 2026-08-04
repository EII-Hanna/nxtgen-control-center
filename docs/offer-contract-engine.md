# NXTGEN Offer & Contract Engine

## Geschäftsziel

Der wichtigste Revenue-Schritt im NXTGEN-Prozess wird als geführter Ein-Klick-Ablauf umgesetzt:

Kunde auswählen → Angebot konfigurieren → Dokumente automatisch erzeugen → intern prüfen → per E-Mail senden → online unterzeichnen → Abschluss und Onboarding auslösen.

## Dokumentpaket

Je Abschluss kann NXTGEN ein Paket aus folgenden Vorlagen erzeugen:

1. Angebot
2. Dienstleistungs-/Softwarevertrag
3. AVV
4. AGB
5. optionale Anlagen und Leistungsbeschreibung

Die finalen juristischen Templates werden vom Betreiber geliefert. NXTGEN verändert keine juristischen Standardtexte frei, sondern ersetzt ausschließlich definierte Variablen und fügt freigegebene Leistungsbausteine ein.

## Dynamische Daten

### Kundendaten
- Firmenname
- Rechtsform
- Anschrift
- Ansprechpartner
- Vertretungsberechtigte Person
- E-Mail
- USt-ID und Handelsregisterdaten

### Angebotsdaten
- Produkt
- freigeschaltete Module
- Setup-Leistung
- Projektumfang
- Startdatum
- Setup-Preis
- Lizenz-/Retainer-Preis
- Zahlungsintervall
- Mindestlaufzeit
- Kündigungsfrist
- Gültigkeit des Angebots
- besondere Vereinbarungen

### Systemdaten
- Angebotsnummer
- Vertragsnummer
- Erstellungsdatum
- zuständiger Berater
- Signaturfelder
- Zahlungs- und Onboarding-Trigger

## Ein-Klick-Ablauf

### Button: „Angebot & Vertrag erstellen“

1. Kunde und Ansprechpartner validieren.
2. Produkt und Module aus dem Deal übernehmen.
3. Preise, Laufzeit und Scope übernehmen.
4. Variablen gegen Pflichtfelder prüfen.
5. Angebot, Vertrag, AVV und AGB rendern.
6. PDF-Dokumente erzeugen.
7. Dokumentpaket zur internen Prüfung anzeigen.

### Button: „Prüfen & versenden“

1. finale Empfängeradresse bestätigen.
2. E-Mail aus Template erzeugen.
3. Signaturpaket beim E-Sign-Anbieter anlegen.
4. Dokumente und Signatur-Link per E-Mail senden.
5. Versand, Zustellung und Ansicht protokollieren.
6. automatische Erinnerungen planen.

### Nach Unterschrift

1. signiertes Gesamtpaket und Audit Trail speichern.
2. Deal auf „Won / Vertrag unterschrieben“ setzen.
3. Abrechnung beziehungsweise Zahlungslink auslösen.
4. Subscription und Module vorbereiten.
5. Kunden-Onboarding starten.
6. Delivery-Projekt und Standardaufgaben erzeugen.

## Sicherheitsprinzipien

- Keine automatische Versendung ohne menschliche Freigabe.
- Versionierung aller Vorlagen.
- Speichern der tatsächlich verwendeten Dokumentversion.
- Hash des finalen Dokuments.
- vollständiges Versand- und Signatur-Audit-Log.
- Juristische Inhalte werden nicht eigenständig von KI erfunden.
- KI darf Leistungsbeschreibungen strukturieren, aber nur freigegebene Vertragsbausteine verwenden.

## Spätere Anbieterintegration

Der Signaturanbieter wird über eine austauschbare Adapter-Schnittstelle angebunden. Geeignete Anbieter werden vor der Implementierung anhand aktueller API-, DSGVO-, eIDAS- und Preisanforderungen ausgewählt.

## Priorität

Dieser Flow ist ein Kernprozess von NXTGEN, weil hier aus einem Deal Umsatz, Vertrag, Zahlung, Lizenz und Delivery werden. Er wird vor erweiterten Analytics- und Komfortfunktionen produktionsreif gebaut.

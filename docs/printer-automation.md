# Druckautomatik

Die Oberfläche liegt unter `/printers/automation`. Nur die bestehende Rolle
`admin` darf sie öffnen, Vorlagen speichern, Kamerabilder abrufen oder die
Automatik konfigurieren. Die Prüfung erfolgt auf der Seite und bei **jedem**
API-Aufruf. `backend`, `vhc` und normale Mitglieder erhalten keinen Zugriff.
Angemeldete Konten ohne Admin-Rolle sehen einen Zugriffshinweis mit Link zum
Profil anstelle einer irreführenden 404; die API antwortet weiterhin mit 403.
Ein separat authentifizierter Hintergrunddienst führt die freigegebenen Regeln
aus. Der Browser muss dafür nicht geöffnet bleiben.

Die Admin-Übersicht zeigt den aktuellen Bambu-Status mit Zeitstempel,
Auftragsname, Fortschritt, Restzeit und Schichten sowie daneben die gespeicherte
Dauerschleife mit Vorlage, Platte, Materialzuführung, verbleibenden Starts und
Prüfstatus. Sie aktualisiert sich 30 Sekunden nach Abschluss des letzten Abrufs;
„Jetzt aktualisieren“ lädt sofort neu. Veraltete Meldungen werden gekennzeichnet.
Ein Auftrag wird nur bei frischem Live-Status und passender Lauf-ID als Teil der
Dauerschleife angezeigt, auch wenn weitere Wiederholungen inzwischen ausgeschaltet
wurden. Änderungen im Auswahlfeld ändern die angezeigte gespeicherte Vorlage erst
nach dem Speichern. Fehlt die Automatik-Datenbank oder ist sie nicht erreichbar,
bleibt der unabhängige Druckerstatus sichtbar; Konfiguration und Startverlauf
werden ausdrücklich als nicht abrufbar angezeigt.

## Historienauswahl und letzte Kamerafotos

Jede Druckerkarte zeigt eine eigene Bambu-Druckhistorie mit Suche in den geladenen
Einträgen und weiteren Seiten. Ein Klick auf „Für Dauerschleife vormerken“ speichert
einen **Entwurf pro Drucker**. Der Server lädt den Auftrag erneut über das angemeldete
Bambu-Konto und prüft die Gerätezuordnung. Eine Auswahl ändert keine aktive Serie
und löst weder einen Druck noch eine Druckerbewegung aus. Sie lässt sich entfernen.

**Stand des direkten Cloud-Wiederholens:** Bei den am 24.10.2026 geprüften echten
Aufträgen liefert die Historie Platte, Filamentzuordnung und Profil-ID. Die
Profil-3MF enthielt aber ausschließlich Einstellungen und Vorschauen, keinen
`Metadata/plate_N.gcode`; auch die geprüften Task-Details enthielten keine nutzbare
G-Code-Adresse. Daraus folgt nicht, dass Bambu Handys eigene Wiederholungsfunktion
unmöglich ist. Ein entsprechender, verifizierter Drucktransport ist hier noch
nicht implementiert. Recherchegrundlage: [Task-/Profil-Endpunkte](https://github.com/Doridian/OpenBambuAPI/blob/main/cloud-http.md)
und [Task-Details](https://github.com/Doridian/OpenBambuAPI/blob/main/api/openapi.yaml).

Der nutzbare Rückfall ist ein Upload der **geslicten `.gcode.3mf`** direkt unter der
Historienauswahl. Das Modell und die ausgewählte Platte werden ebenso geprüft wie
beim normalen Vorlagen-Upload; eine ungeslicte Projekt-3MF wird abgelehnt. Die historische AMS-Zuordnung wird nicht für neue Starts übernommen. Das passende
Fach wird unmittelbar vor jedem Start aus den aktuellen Materialdaten gewählt. Ein Upload, der zu einer
zwischenzeitlich geänderten Auswahl gehört, wird abgelehnt. „Als Druckvorlage
übernehmen“ kopiert die geprüfte Datei in den bestehenden privaten Vorlagenspeicher.
Erst danach werden Druckanzahl und Modus separat freigegeben. Diese Übernahme braucht
weiterhin die Automatik-Migration; Auswahl und vorbereitender Upload funktionieren
bereits davor. Die Dateizuordnung bestätigt nicht automatisch, dass zwei Dateien
geometrisch dasselbe Objekt enthalten; der Admin muss die passende Datei wählen.

Fotos werden über Admin-Endpunkte ausgeliefert, nicht aus `public/`. Die vier
vorhandenen Cloud-Testbilder wurden mit ihren ursprünglichen Aufnahmezeiten in
den privaten Fotospeicher übernommen. Jede neue erfolgreiche Aufnahme über den
Kameradienst aktualisiert diesen Speicher; ältere Bilder überschreiben keine neueren.
Das Dashboard zeigt Zeit, Herkunft und „Kein Livebild“. Der Worker verwendet
weiter ausschließlich frisch angeforderte Bilder, niemals diesen Anzeigespeicher.

Direkt am Foto steht der **OpenAI-Bildcheck**: frei erkannt, belegt oder unklar,
mit Begründung, Aufnahmezeit und Auswertungszeit. Beim Öffnen und Aktualisieren
der Admin-Ansicht wird ein noch ungeprüftes Foto einmal über einen geschützten
POST-Endpunkt analysiert. Gespeicherte Ergebnisse werden wiederverwendet;
gleichzeitige Aufrufe werden innerhalb einer Serverinstanz zusammengefasst.
Fehlgeschlagene Prüfungen können manuell wiederholt werden. Die Analyse verwendet
die bestehende Responses-Anbindung (`OPENAI_API_KEY`, standardmäßig `gpt-4.1`,
überschreibbar mit `PRINTER_BED_VISION_MODEL`), strukturierte Ausgabe und
`store: false`. Siehe [OpenAI-Bildanalyse](https://developers.openai.com/api/docs/guides/images-vision).

Ergebnis und Foto sind durch Prüfsumme **und Aufnahmezeit** verbunden. Wechselt
das Foto während einer Analyse, wird ihr Ergebnis verworfen. Eine Analyse macht
ein altes Foto nicht aktuell: Nach 60 Sekunden steht der aktuelle Bettzustand auf
„Aktuell unklar“, während die Beurteilung des alten Fotos sichtbar bleibt.
„Frei erkannt“ verlangt dieselben Sichtbarkeits- und Konfidenzkriterien wie der
Worker; es ist eine optische Einschätzung, keine Druckstart-Freigabe.
„Neues Foto & prüfen“ fordert bei verbundenem Kameradienst ein frisches Bild an.
Ohne diesen Dienst bleiben gespeicherte Fotos auswertbar, ein aktueller Zustand
ist damit aber nicht bestätigt. Der Cloud-Kameraweg ist inzwischen über den
lokalen macOS-Dienst angebunden. Die UI-Prüfung löst keinen Druck und keine
Bewegung aus und funktioniert auch ohne die Automatik-Datenbank.

Entwürfe, zugeordnete Dateien und letzte Fotos liegen im serverseitigen Verzeichnis
`PRINTER_AUTOMATION_DATA_DIR` (lokal `.data/printer-automation`, von Git ausgeschlossen).
Dateien werden atomar und mit Modus `0600` geschrieben. Der Druck-Worker liest
dieses Verzeichnis nicht. Für ein Deployment muss es als **privates persistentes
Volume** bereitgestellt werden; bei mehreren Web-Instanzen müssen sie denselben
Speicher nutzen. Die Auswahl ist daher serverweit und bleibt bei einem Browser-
Neuladen erhalten, aber ein flüchtiges Container-Dateisystem wäre ungeeignet.
Ersetzte Entwurfsdateien bleiben zunächst im privaten Volume; Speicherbereinigung
und Quoten sind vor größerem Dauerbetrieb noch zu ergänzen.

## Was implementiert ist — und was vor dem Echtbetrieb fehlt

- Private, unveränderliche `.gcode.3mf`-Vorlagen pro Drucker, inklusive
  Modellprüfung, Plattenauswahl, Prüfsumme und AMS-Zuordnung.
- 15 Minuten kontinuierlich beobachteter Leerlauf. Nur aktuelle, nicht retained
  MQTT-Nachrichten **mit `gcode_state`** zählen. HTTP-Fallback, Cache und
  Statuslücken über drei Minuten starten den Zeitraum neu.
- Zwei unterschiedliche, aktuelle Kameraaufnahmen im Abstand von mindestens
  20 Sekunden. OpenAI muss beide als frei erkennen: Platte vorhanden,
  vollständiges Bett sichtbar, keine Teile/Filamentreste/Hände, Konfidenzwert
  mindestens 0,98. Dieser Modellwert ist keine kalibrierte Fehlerwahrscheinlichkeit.
- Testbetrieb, begrenzte Druckserien (1–100), erneute Statusprüfung vor jedem
  Start, Datenbank-Leases, Versionsprüfung gegen zwischenzeitliches Ausschalten,
  dauerhafte Startreservierung und Ausführungsprotokoll.
- Lokaler A1/P1-Kamera-Connector über TLS/6000, inklusive Zertifikat-Pinning,
  Authentifizierung und begrenztem JPEG-Parser.
- Eine authentifizierte Schnittstelle für einen **signierten Druckadapter**.
  Ein solcher Adapter ist **noch nicht mitgeliefert**. Ohne ihn verweigert der
  lokale Dienst Druckstarts; der Echtbetrieb bleibt in der UI gesperrt.

Die vorhandenen Ablauf-Tests verwenden simulierte Drucker und eine isolierte
PostgreSQL-Datenbank. Ein echter Druck wurde nicht gestartet.

**Cloud-Kamera am 24.10.2026 erfolgreich getestet:** Ein separater Prototyp hat
beim A1 Mini und beiden P1S aktuelle JPEG-Bilder sowie beim H2D einen H.264-Stream
empfangen. Dafür war kein Zugang zum Drucker-LAN nötig. Der erfolgreiche Weg
nutzt die originalen Bambu-Bibliotheken für Anmeldung, Kamera-Freigabe und
Bildempfang. Details, Versionsstände und Grenzen stehen in
[Cloud-Kameratest](bambu-cloud-camera-test.md).

Der Cloud-Weg ist als `bambu-cloud`-Kameratyp in den Dienst integriert. Auf diesem
Apple-Silicon-Mac übernimmt ein Docker-Container mit QEMU und der originalen
Linux-Netzwerkbibliothek die Freigabe; die originale native macOS-Bibliothek
empfängt JPEG beziehungsweise H.264. Zwei kleine, versionierte C++-Programme
unter `scripts/printer-bridge/native/` verbinden diese Schritte. Die Firmware
wird nach Möglichkeit aus der aktuellen OTA-Versionsantwort übernommen.
H.264 wird mit FFmpeg zum letzten empfangenen Frame dekodiert. Jede Anfrage
verwendet ein neues privates Arbeitsverzeichnis, tatsächliche Empfangszeiten
und ein Limit von 90 Sekunden. Nach Abschluss oder Timeout werden Container,
SDK-Sitzungsdateien und temporäre Kameraadressen entfernt. Höchstens vier
Cloud-Aufnahmen dürfen gleichzeitig laufen. Native stdout/stderr werden nicht
protokolliert; Diagnoseausgaben bestehen ausschließlich aus numerischen Werten.

Vor **jeder Cloud-Aufnahme**, auch im Worker, wird die Kammerbeleuchtung über
das originale Netzwerk-SDK eingeschaltet. Die Befehle für `chamber_light` und
`chamber_light2` entsprechen [Bambu Studios Lichtsteuerung](https://github.com/bambulab/BambuStudio/blob/master/src/slic3r/GUI/DeviceCore/DevLampCtrl.cpp).
Erst nach einer neuen Statusmeldung mit eingeschaltetem Licht und einer Sekunde
Belichtungswartezeit wird die Kameraverbindung aufgebaut. Ein bloß erfolgreich
gesendeter Befehl reicht nicht. Fehlende Bestätigung bricht die Aufnahme mit
einer verständlichen Meldung ab; es wird kein dunkles Ersatzbild als neue
Aufnahme ausgegeben. Das Licht bleibt anschließend an. Die Helligkeit und die
Sicht auf die gesamte Platte werden trotzdem separat durch OpenAI bewertet.

Beim Test am 24.10.2026 meldeten alle vier Drucker eingeschaltetes Licht.
A1 mini, H2D und P1S mit AMS lieferten danach neue Aufnahmen. Beim A1 mini
blieb die Platte teilweise verdeckt bzw. zu dunkel; H2D und P1S mit AMS wurden
als belegt eingeordnet. Beim P1S ohne AMS trat nach bestätigter Beleuchtung
ein Timeout beim Start des Kamerastreams auf; sein zuvor erfolgreich geladenes
Foto bleibt mit ursprünglicher Zeit sichtbar. Lichtstatus und Kameraverfügbarkeit
werden deshalb nicht gleichgesetzt.

Das ist ein lokal betreibbarer Cloud-Kameradienst, kein validierter 24/7-Betrieb.
Die lokale Testinstallation benötigt einen laufenden Mac mit Docker Desktop und Internet.
Für den späteren Serverbetrieb ist unten die Linux-Docker-Bereitstellung beschrieben. Der
`bambu-jpeg`-Connector bleibt für Rechner im Druckernetz verfügbar. Der signierte
Druckstart ist weiterhin nicht implementiert; `canStart` und Echtbetrieb bleiben
ausgeschaltet. Ein fehlgeschlagener Kameratest blockiert den jeweiligen Start.

### Lokale Einrichtung am 24.10.2026

Die Migration wurde über das Dokploy-Terminal der vorhandenen Supabase-Instanz
als Transaktion mit `ON_ERROR_STOP` angewandt. Anschließend wurden alle drei
Tabellen per Service-API, der private Bucket und die Ablehnung eines anonymen
Tabellenzugriffs geprüft. Es wurden keine Vorlagen, Serien oder Druckstarts
angelegt. Der Worker wurde mit leerer Konfiguration erfolgreich ausgeführt.

Für einen erneuten lokalen Aufbau mit den bereits vorhandenen Original-SDKs:

```sh
node scripts/printer-bridge/build-local.mjs
node scripts/printer-bridge/configure-local.mjs
node scripts/printer-bridge/install-local-services.mjs
```

`build-local` erwartet die vorhandenen Docker-Images
`konglo-bambu-camera-probe:local` / `:qemu` sowie die Originalbibliotheken unter
`.data/bambu-cloud-probe/`; es lädt keine fremden Binärdateien herunter. Der
macOS-Plugin-Code wird vor dem Bauen per `codesign --verify --strict` geprüft.
Der JSON-Parser-Header `nlohmann/json` 3.11.3 wird aus dessen offiziellem Repository
bezogen und anhand einer fest hinterlegten SHA-256-Prüfsumme verifiziert. Beim
Bauen laufen native Tests für Lichtstatus, unbekannte Meldungen und falsche
Bestätigungen. Fertige Hilfsprogramme ersetzen die bisherigen Dateien atomar.
`configure-local` übernimmt ausschließlich an das bestehende Bambu-Konto
gebundene Drucker und setzt in `.env.local` Loopback-URL, zufällige Dienst-Secrets
und `PRINTER_AUTOMATION_LIVE_ENABLED=false`. Vorhandene Secrets werden beibehalten.
Die Kamera liest den privaten Token-Store bei jeder Aufnahme neu; die bestehende
Bambu-Anbindung der App erneuert abgelaufene Kontotokens beim Statusabruf.

`install-local-services` legt die LaunchAgents `org.konglomerat.printer-bridge`
und `org.konglomerat.printer-worker` an. Sie starten bei Benutzeranmeldung und
nach einem Prozessabbruch neu. Konfiguration und Logs liegen privat unter
`.data/printer-bridge-runtime/`; Secrets stehen nicht in den LaunchAgent-Dateien.
Der Worker prüft alle 30 Sekunden nach dem letzten Lauf. Die Next-App unter
`localhost:3000` muss ebenfalls laufen. Schlafzustand, ausgeschalteter Mac oder
fehlendes Docker unterbrechen den Kameraabruf. Die Einrichtung ist kein Deploy
der lokalen App-Änderungen auf `digital.konglomerat.org`.

Es werden keine LAN-only-, Developer- oder Firmware-Einstellungen verändert.
Der Cloud-Betrieb bleibt bestehen. Ob die aktuelle Firmware den lokalen
Kamerazugriff in dieser Konfiguration zulässt, muss vor Ort verifiziert werden.
H2D/RTSPS ist in diesem ersten lokalen Connector noch nicht implementiert.

## Einrichtung

1. Migration `supabase/migrations/20261024150000_printer_automation.sql` auf die
   gewünschte Supabase-Instanz anwenden. Dies geschieht nicht automatisch durch
   einen App-Deploy. Sie legt drei Tabellen, service-only RPCs und den privaten
   Bucket `printer-automation` an. Eine restriktive Storage-Policy schützt den
   Bucket auch bei bereits vorhandenen breit gefassten Policies.
2. Backend-Umgebung konfigurieren:

   ```dotenv
   PRINTER_BRIDGE_URL=https://printer-bridge.example.internal
   PRINTER_BRIDGE_TOKEN=<zufälliges Geheimnis, mindestens 32 Zeichen>
   PRINTER_AUTOMATION_WORKER_SECRET=<anderes zufälliges Geheimnis, mindestens 32 Zeichen>
   PRINTER_AUTOMATION_LIVE_ENABLED=false
   PRINTER_BED_VISION_MODEL=gpt-4.1
   ```

   Die vorhandenen Bambu-, Supabase-Service- und OpenAI-Zugangsdaten werden
   weiterverwendet. Bilder werden an die vorhandene OpenAI-Konfiguration
   übertragen (`store: false`), aber nicht in einem öffentlichen Bildspeicher
   abgelegt. Die manuelle Vorschau bleibt im Admin-Browser; im Protokoll stehen
   nur Befund, Bildhash und Zeitstempel.
3. Auf einem Rechner im Druckernetz eine **private**, nicht versionierte Datei
   anlegen, beispielsweise `.data/printer-bridge.json` (Dateirechte `0600`):

   ```json
   {
     "bind": "127.0.0.1",
     "port": 8787,
     "stateDirectory": "/absolute/private/path/printer-bridge-state",
     "liveEnabled": false,
     "printers": [
       {
         "id": "DRUCKER-SERIENNUMMER",
         "model": "P1S",
         "camera": {
           "type": "bambu-jpeg",
           "host": "192.168.2.214",
           "port": 6000,
           "accessCode": "LAN-ZUGANGSCODE",
           "certificateSha256": "SHA256-DES-VERIFIZIERTEN-DRUCKERZERTIFIKATS"
         }
       }
     ]
   }
   ```

   Die `id` muss exakt der Geräte-ID aus Konglo Digital entsprechen. Für A1 mini
   gilt dasselbe Kameraprotokoll. Das Zertifikat über einen vertrauenswürdigen
   Weg prüfen (Bambu-CA und Seriennummer) und dessen SHA-256-Fingerprint
   hinterlegen. Unbekannte Zertifikate werden nicht automatisch übernommen.
   Der Zugangscode wird erst **nach** erfolgreicher Pin-Prüfung gesendet.

   ```sh
   PRINTER_BRIDGE_CONFIG=/absolute/private/path/printer-bridge.json npm run printers:bridge
   ```

   `PRINTER_BRIDGE_TOKEN` muss dem Backend-Token entsprechen. Der Dienst bindet
   standardmäßig nur an Loopback. Für einen getrennten Webserver einen privaten
   Netzwerkpfad und HTTPS-Reverse-Proxy verwenden. Keine Druckerports im
   Internet freigeben. Die App akzeptiert unverschlüsseltes HTTP ausschließlich
   zu Loopback-Adressen.
4. Als Admin die neue Seite öffnen, eine bereits **geslicte** Druckdatei
   hochladen und „Kamera prüfen“ nutzen. Das Bild samt Entscheidung kontrollieren.
   Material, Farbe und Düse pro Drucker auswählen; die Zuführung wird automatisch ermittelt.
   Die Datei wird nicht neu geslicet; Filament-/Nozzle-/Platteneinstellungen
   müssen mit der tatsächlichen Bestückung übereinstimmen.
5. Den Hintergrunddienst auf einem dauerhaft laufenden Rechner starten:

   ```sh
   PRINTER_AUTOMATION_APP_URL=https://digital.example.org npm run printers:worker
   ```

   Der Prozess benötigt den `PRINTER_AUTOMATION_WORKER_SECRET`, aber keine
   Benutzer-Cookies. Er ruft alle 30 Sekunden nach Abschluss des vorherigen Laufs
   `POST /api/internal/printer-automation/tick` auf. Alternativ denselben
   authentifizierten POST alle 30–60 Sekunden über den vorhandenen Scheduler
   ausführen; `node scripts/printer-automation-worker.mjs` prüft genau einmal.
   Als systemd-/Container-Dienst betreiben, nicht über Browser-Timer.
6. Zunächst „Testbetrieb speichern“ auswählen und mindestens einen vollständigen
   Ablauf beobachten. Die UI meldet einen erfüllten Start, sendet dabei aber
   keinen Druckbefehl. Ein blockiertes oder unsichtbares Bett muss die Freigabe
   zuverlässig verhindern.

## Anschluss des signierten Druckstarts

Der lokale Dienst nutzt **keine** ungesicherten `liveview.prepare`- oder
`project_file`-Kommandos als Ersatz für die Firmware-Autorisierung. Der fehlende
Adapter muss die vom Hersteller unterstützte, authentifizierte Druckanbindung
der verwendeten Firmware übernehmen und zuerst mit ihr verifiziert werden.
Die derzeit vorhandene Cloud-Bibliothek in Konglo Digital liefert Statusdaten,
aber noch keinen geeigneten Drucktransport.

Wenn dieser Adapter vorhanden ist, wird er pro Drucker als `startCommand`
konfiguriert, z. B. `["/opt/konglo/bambu-signed-adapter"]`. Es ist ein absoluter
Programmpfad plus feste Argumente, keine Shell-Zeichenkette. Eingaben werden
ausschließlich als JSON auf stdin übergeben:

```json
{
  "operation": "start",
  "printerId": "DRUCKER-SERIENNUMMER",
  "runId": "UUID",
  "filePath": "/private/path/konglo-UUID.gcode.3mf",
  "sha256": "SHA256",
  "model": "Bambu Lab P1S",
  "plate": 1,
  "useAms": false,
  "amsMapping": [],
  "expectedJobName": "konglo-UUID",
  "imageCapturedAt": "ISO-8601",
  "requireFreshIdle": true,
  "deadlineAt": "ISO-8601"
}
```

Adapter-Vertrag:

- Datei, Modell, Platte, Materialzuordnung und Prüfsumme prüfen; die Datei nur
  übertragen, solange die Deadline noch eingehalten werden kann.
- **Unmittelbar vor** dem eigentlichen Start nach dem Upload nochmals einen
  frischen, fehlerfreien Leerlaufstatus sowie Materialbestand, Filamentprofil und
  Düse des gewählten Extruders prüfen (`requireFreshMaterial`). Bei
  Fremdauftrag, Pause, Fehler, fehlender Platte/Speicher oder verstrichener
  Deadline keinen Start senden.
- Auftragsname muss die `runId` enthalten. Nur so kann Konglo den eigenen
  Folgedruck von einem manuell gestarteten fremden Auftrag unterscheiden.
- Signierung und Geräteautorisierung über den passenden Herstellertransport
  durchführen. Nie den Sicherheitsmodus des Druckers umschalten.
- Genau ein JSON-Ergebnis auf stdout ausgeben:
  `{"runId":"UUID","state":"accepted"}`. `accepted` bedeutet bestätigte
  Annahme durch den Drucker. `rejected` bedeutet sicher keinen Start;
  `unknown` bedeutet unklaren Ausgang. Kein automatisches Wiederholen nach
  Timeout. Der Prozess wird nach 20 Sekunden beendet.
- Keine Secrets ausgeben. stderr wird nicht an die Web-App weitergegeben.

Danach können der Operator `liveEnabled: true` am lokalen Dienst und
`PRINTER_AUTOMATION_LIVE_ENABLED=true` am Backend setzen. Erst dann können
Admins in der UI echte Druckserien aktivieren. Konfiguration allein beweist
keine funktionierende Hardwareanbindung; zunächst einen beaufsichtigten
Durchlauf mit dem tatsächlichen Drucker prüfen.

## Neustarts, Sperren und Ausfälle

Ein Datenbank-Lock gilt pro Drucker für 120 Sekunden. Änderungen durch Admins
erhöhen die Konfigurationsversion und entziehen einem alten Lauf die Freigabe.
Vor einem externen Start werden Lauf-ID, Restanzahl und `awaiting_start` in einer
Transaktion geschrieben. Der lokale Dienst legt außerdem vor dem Adapteraufruf
ein dauerhaftes Journal an. Dieselbe Lauf-ID wird auch nach einem Neustart
niemals erneut ausgeführt. Das private `stateDirectory` muss persistent bleiben.

Nach einer Startreservierung gibt es keinen automatischen Retry. Ein fehlendes
oder unklar bestätigtes Ergebnis sperrt weitere Starts. Ein echter Auftrag muss
mit passendem Namen als laufend beobachtet werden, bevor ein späterer Leerlauf
als dessen Abschluss zählt. Pausen, Fehler oder ein fremder Auftrag sperren die
Serie. Ein Admin kann die Sperre erst nach eigener Prüfung und aktuell
bestätigtem Leerlauf aufheben. Beim Ausschalten werden keine neuen Starts
freigegeben; ein bereits übermittelter Druck wird dadurch nicht abgebrochen.

Eine zwischen Bildaufnahme und Start neu auf die Platte gelegte Sache kann die
Kameraentscheidung überholen. Die Funktion ist keine zertifizierte
Personen-/Kollisionssicherung. Testbetrieb, vollständige Sicht auf die Platte
und Validierung mit realen belegten/leeren Situationen sind Voraussetzungen
für den Einsatz.

## Prüfung

```sh
npm run test:printer-automation
npx tsc --noEmit --incremental false
```

Die Datenbanktests erzeugen einen isolierten lokalen PostgreSQL-Cluster über
Unix-Sockets und löschen ihn anschließend. Sie lesen keine `.env` und verbinden
sich nicht mit Supabase. Ohne `pg_config` werden nur diese Integrationstests
übersprungen. Weitere Tests decken Rollen, CSRF, Worker-Authentifizierung,
Dateien, Leerlauf-/Kameragrenzen, Zertifikatsprüfung, Paketfragmentierung und
Idempotenz nach Neustarts ab.

Protokollreferenzen:

- [Bambu Studio: Kamera-Verbindungsaufbau](https://github.com/bambulab/BambuStudio/blob/v02.07.01.62/src/slic3r/GUI/MediaPlayCtrl.cpp)
- [A1/P1-Kameraprotokoll](https://github.com/Doridian/OpenBambuAPI/blob/main/video.md)
- [Gerätezertifikate](https://github.com/Doridian/OpenBambuAPI/blob/main/tls.md)
- [Cloud-Kamera und Signaturprüfung](https://github.com/ClusterM/open-bamboo-networking/blob/master/research/08.11-camera.md)
- [OpenAI-Bildanalyse](https://developers.openai.com/api/docs/guides/images-vision)


## Materialvorgabe pro Drucker

Migration `20261024190000_printer_material.sql` ergänzt die atomar gespeicherte
Materialvorgabe. Standard: **PETG, Schwarz (#000000), 0,4 mm, automatisch**.
Die Admin-Karte zeigt das passende Fach oder den Grund, warum kein Match vorliegt.
Die Vorgabe lässt sich bei ausgeschalteter Automatik auch ohne Vorlage speichern.
Konfigurationsänderungen erhöhen die Revision und entziehen laufenden Prüfungen
ihre Startfreigabe.

Die Auswahl bevorzugt ein physisch belegtes AMS-Fach, sonst eine vom Drucker als
bereits geladen gemeldete externe Spule. Materialdaten müssen innerhalb der
aktuellen MQTT-Abfrage bestätigt und höchstens 30 Sekunden alt sein. Gespeicherte
Spulenbezeichnungen allein reichen nicht. Schwarz schließt neutrale dunkle
Herstellerfarben bis RGB 32 ein, aber kein Grau. Farbe und Typ stammen aus den
Druckermeldungen; die Kamera identifiziert das Material nicht.

Vor Kamera/Analyse und erneut nach deren Abschluss werden Bestand und die dem
Extruder zugeordnete Düse geprüft. Die `.gcode.3mf` muss genau ein Filament und
eine Düse enthalten; Materialtyp, Filament-Preset-ID (z. B. PETG Basic versus HF)
und Düsengröße müssen passen. Die Automatik slicet nicht um. Fehlende Metadaten,
Mehrmaterialdateien und noch nicht implementierte H2-Werkzeugzuordnungen blockieren
den Start, auch im Testbetrieb. Der H2D-Materialbestand ist trotzdem sichtbar.
Klassische Vierfach-AMS werden unterstützt; unbekannte AMS-Topologien und externe
H2-Zuführungen werden nicht geraten. Bei mehreren passenden Spulen kann noch eine
Profilabweichung der zuerst ausgewählten Spule den Start blockieren.

Ein künftiger signierter Startadapter erhält die konkrete Auswahl samt Vorgabe,
Beobachtungszeit und `requireFreshMaterial: true`. Er muss unmittelbar vor dem
Hardwarebefehl nochmals Material, Düse und Leerlauf prüfen. Ohne diesen Adapter
bleibt `canStart` aus; die Materialauswahl aktiviert keine Drucke.

## Docker auf dem Server

Der Mac-Dienst ist die Testinstallation. Für einen Linux-x86_64-Server liegt eine
separate Bereitstellung in `scripts/printer-bridge/compose.yaml` und `Dockerfile`.
Sie verwendet die originalen Bambu-Linuxbibliotheken für Anmeldung, Lichtsteuerung
und Kamerastream. Vendor-ZIP und JSON-Header werden beim Build mit SHA-256 geprüft.
Es gibt keinen Docker-Socket im Container und keinen Mac-Aufruf. ARM-Server werden
von diesem Bambu-SDK nicht nativ unterstützt.

1. Repository auf den Server bringen. Die `.dockerignore` schließt `.env*`,
   `.data`, Git, Build-Ausgaben und lokale Fotos aus dem Build-Kontext aus.
2. `docker/config.example.json` als private Datei außerhalb des Repositorys
   kopieren und die Drucker-IDs, Modelle und Firmware ergänzen. Ein Objekt pro
   Drucker; `liveEnabled` bleibt `false`. Diese Datei enthält keine Bambu-Tokens. Auf Linux muss sie für Container-UID 1000
   lesbar sein (Eigentümer 1000, Modus 0600). Auf dem Mac passen Test-UID und
   Dateieigentümer entsprechend zusammen.
3. Die absolute Datei als `PRINTER_BRIDGE_CONFIG_FILE` setzen und denselben
   `PRINTER_BRIDGE_TOKEN` (mindestens 32 Zeichen) wie in der Web-App verwenden.
4. Aus dem Repository starten:
   `docker compose -f scripts/printer-bridge/compose.yaml up -d --build camera`.
5. Die Web-App benötigt `PRINTER_BRIDGE_URL` und
   `PRINTER_BRIDGE_FORWARD_CLOUD_LOGIN=true`. Der Serverdienst erhält dann nur
   für die einzelne Aufnahme das aktuelle Access-Token über den authentifizierten
   POST-Aufruf. Die App verwaltet weiterhin Erneuerung und Speicherung; der
   Kameradienst bekommt weder Refresh-Token noch Supabase-Service-Key. Für entfernte
   Verbindungen ist HTTPS erforderlich. Port 8787 ist zunächst nur an Server-Loopback
   gebunden; für einen separaten Web-App-Container ist eine private TLS-Anbindung
   oder ein bestehender authentifizierter HTTPS-Proxy einzurichten.
6. Den optionalen Worker mit `--profile worker` starten; vorher
   `PRINTER_AUTOMATION_APP_URL` (HTTPS-Adresse der App) und denselben
   `PRINTER_AUTOMATION_WORKER_SECRET` wie in der App setzen. Genau eine aktive
   Worker-Installation verwenden. Die Datenbank-Leases schützen zusätzlich vor
   parallelen Starts.

Der Container läuft als UID 1000 mit schreibgeschütztem Root-Dateisystem. Temporäre
SDK-Sitzungen und Bilder liegen im RAM-Dateisystem `/captures` und werden nach jeder
Aufnahme entfernt. Startjournale liegen dauerhaft in `camera-state`. Der Healthcheck
bestätigt den erreichbaren Dienst, **nicht** einen erfolgreichen Kamerastream. Ein
neues Foto pro Druckermodell ist der notwendige Verbindungstest nach der Installation.
Das Licht muss vom Drucker als eingeschaltet bestätigt sein, bevor ein Bild als
aktuell zurückgegeben wird.

Validiert am 24.10.2026: Linux-amd64-Image gebaut, nicht privilegiert mit
schreibgeschütztem Dateisystem gestartet, Healthcheck erfolgreich, ohne Token
HTTP 401 und alle dynamischen SDK-Abhängigkeiten aufgelöst. Der native Linux-
Kamerastream auf `tools.konglomerat.org` und das dortige Deployment sind noch
nicht verifiziert. Für die vier bekannten Drucker ist lokal bereits
`.data/printer-bridge-runtime/server-config.json` vorbereitet (ohne Zugangstokens).
Die Datei bleibt außerhalb von Git und Docker-Build-Kontext.

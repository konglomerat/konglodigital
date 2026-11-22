# Druckbett-Positionierung am 24.10.2026

Kleine, kamerabeobachtete Bettbewegungen wurden am **P1S mit AMS** erfolgreich
getestet: vier relative Schritte mit insgesamt 16 mm Anhebung, ohne vorherige
Referenzfahrt und ohne erkennbaren Kontakt oder gemeldeten Fehler. Das gesamte
Bett ist damit noch nicht sichtbar. Die unten dokumentierte erste Testrunde
wurde durch einen zweiten, ausdrücklich angeforderten Versuch ergänzt.

## Tatsächlich gesendete Bewegungen

In der ersten Testrunde erhielt nur **P1S ohne AMS** Bewegungsbefehle:

- Gegen 17:26 Uhr (Europe/Berlin): `G28`. Der Drucker bestätigte den Befehl;
  die XYZ-Referenzbits wechselten von `0` auf `7`. Anschließend keine HMS- oder
  Druckfehler, beide Heizziele weiterhin `0`.
- Gegen 17:30 Uhr: ein relativer Schritt `Z-10` mit `F600`, entsprechend
  10 mm Bettanhebung beim P1S. Die üblichen Studio-Befehle zum Sichern und
  Wiederherstellen des Referenzmodus und der Software-Endanschläge wurden
  verwendet; die Endanschläge waren während der Bewegung eingeschaltet.
  Der Drucker bestätigte den Befehl und meldete weiterhin keinen Fehler.

Die Bestätigung belegt die Befehlsannahme. Eine gemessene Endposition oder ein
Kamerabild nach dem 10-mm-Schritt liegt nicht vor. Die anschließende interaktive
SDK-Sitzung wurde ohne weitere Bewegungsbefehle geschlossen.

## Kamera und übrige Drucker

- **P1S ohne AMS:** Nach der Referenzfahrt gelang ein frisches Bild um 17:27 Uhr;
  das Bett war weiterhin nur teilweise sichtbar. Nach dem 10-mm-Schritt scheiterte
  der Streamstart mehrfach, auch mit der installierten Kamerabibliothek.
  Bambu Studio meldete ebenfalls „Loading failed … [2:2]“. Deshalb keine weiteren
  Bewegungen.
- **P1S mit AMS:** Ein neuer Cloud-Livestream funktionierte um 17:40–17:41 Uhr
  (1280 × 720, JPEG). Zwei zylindrische Teile stehen im vorderen Bildbereich auf
  dem Bett. XYZ waren nicht referenziert. Wegen der belegten Platte wurde keine
  Referenzfahrt oder andere Bewegung gesendet.
- **A1 Mini:** Aktuelle Filamentfehlermeldung, Druckfehler `07FF8003`, HMS
  `12FF2000 / 00020004`. Keine Bewegung gesendet.
- **H2D mit AMS:** Auftrag abgebrochen, Druckfehler `0300400C`, HMS
  `0C000300 / 0002000E` (mögliche Materialansammlung an der Düse). Keine Bewegung
  gesendet.

Die Meldungstexte wurden mit den deutschen HMS-Ressourcen der installierten
Bambu-Studio-Version abgeglichen. Die letzte Statusabfrage um 17:39 Uhr zeigte
beide P1S in `FINISH` ohne Druck- oder HMS-Fehler; die Fehler von A1 Mini und H2D
bestanden weiter.

Es wurden keine Druckaufträge gestartet und keine Heizbefehle gesendet. Alle
Testverbindungen wurden beendet. Temporäre SDK-Zugangskopien, Kameraadressen
und SDK-Logs wurden entfernt; der bestehende Token-Store wurde nicht verändert.
Die privaten Bilder und bereinigten Diagnoseergebnisse bleiben unter
`.data/bambu-cloud-probe/` von Git ausgeschlossen erhalten.

## Konsequenz für die Automatik

Eine unbekannte oder belegte Platte darf nicht durch eine automatische
Referenzfahrt erst sichtbar gemacht werden. Ohne hinreichende Sicht auf das
gesamte Bett bleibt der automatische Druckstart gesperrt. Erfolgreiche einzelne
Cloud-Bilder ersetzen außerdem keine Prüfung der Wiederverbindungsstabilität.

## Zweiter Versuch: kleine Schritte unter Livebildkontrolle

Auf ausdrückliche Bitte, begrenzte Bettbewegungen weiter zu testen, wurde der
**P1S mit AMS** zwischen 17:45 und 17:48 Uhr in Schritten von **1 + 5 + 5 + 5 mm**
angehoben. Die Bewegung ist in den frischen Bildern nach jedem Schritt sichtbar.
Die Teile blieben mit Abstand zum Druckkopf stehen; der Kopf wurde nicht bewegt.
Eine Referenzfahrt wurde nicht gesendet. Der Drucker bestätigte alle vier Befehle;
auch die anschließende Statusabfrage zeigte `FINISH`, Druckfehler `0`, leere HMS-
Liste und Heizziele `0`. Die Referenzbits blieben dabei unverändert.

Die vorherige Annahme, vor jeder kleinen Z-Bewegung sei zwingend eine
Referenzfahrt erforderlich, war zu streng. Der beobachtete Versuch belegt, dass
dieser P1S die begrenzten relativen Z-Bewegungen auch mit gelöschten XYZ-
Referenzbits ausführt. Das ist keine Freigabe für beliebige Bewegungen oder
für einen automatischen Druckstart mit belegtem Bett.

Der private Testhelfer verwendete den normalen Studio-G-Code für Z-Jogging,
reduziert auf `F300` (5 mm/s), mit eingeschalteten Software-Endanschlägen und
Wiederherstellung des Referenzmodus. Er erlaubte nur einzeln angeforderte Schritte
von 1 oder 5 mm, maximal 20 mm pro Sitzung. Vor jedem Schritt waren ein aktueller,
fehlerfreier Leerlaufstatus und ein höchstens vier Sekunden altes Kamerabild
erforderlich. Nach jedem Schritt wurden das Bild manuell und der Status erneut
geprüft; kein automatischer Wiederholungsversuch bei unklarer Befehlsannahme.

Der Cloud-Livestream lieferte in dieser Sitzung 209 JPEG-Samples mit 1280 × 720
Pixeln. Die Bewegungssitzung wurde nach insgesamt 16 mm geschlossen und der
Stream beendet. Private Vorher-/Nachher-Bilder liegen unter
`.data/bambu-cloud-probe/p1s-mit-ams-bounded-bed-live/`. Die Folge von vier
Befehlen und ihren Bestätigungen liegt im bereinigten Ergebnis der zugehörigen
`motion-bounded-session`.

Die Befehlsfolge wurde gegen den offiziellen
[DevAxisCtrl-Code](https://github.com/bambulab/BambuStudio/blob/master/src/slic3r/GUI/DeviceCore/DevAxisCtrl.cpp)
und die Z-Taster in
[StatusPanel](https://github.com/bambulab/BambuStudio/blob/master/src/slic3r/GUI/StatusPanel.cpp)
abgeglichen. Die Tests haben die produktive Admin-Automatik nicht für Bewegungen
freigeschaltet.

Beim **P1S ohne AMS** scheiterte auch der neue Kameraabruf gegen 17:49 Uhr am
Streamstart. In dieser zweiten Testrunde erhielt er keine weitere Bewegung.
Die Fehler von A1 Mini und H2D bestanden bei der erneuten Statusabfrage weiter;
beide blieben unverändert. Alle Sitzungen des zweiten Tests wurden beendet und
ihre temporären SDK-Zugangskopien, Kameraadressen und Logs entfernt.

Der vorausgehende reine Kameratest ist separat in
[bambu-cloud-camera-test.md](bambu-cloud-camera-test.md) dokumentiert.

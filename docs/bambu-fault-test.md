# Ferndiagnose vom 24.10.2026

Die Fehlermeldungen von A1 Mini und H2D bestehen weiterhin. Die Cloud-Kameras
beider Geräte konnten erneut gelesen werden. Der P1S ohne AMS meldet keinen
Druck- oder HMS-Fehler, liefert aber weiterhin keinen Kamerastream.

## A1 Mini

- HMS `12FF-2000-0002-0004`: Filament vom externen Spulenhalter aus dem Extruder
  herausziehen.
- Druckmeldung `07FF8003`: Bei weiterhin bestehender Meldung den Filamentweg auf
  gebrochenes bzw. festhängendes Filament prüfen.
- Aktuell `hw_switch_state=1`, externe Spule (`tray_now=254`), kein AMS erkannt.
  Bambu Studio interpretiert `hw_switch_state=1` als Filament am Extruder.
- Frisches Kamerabild: 1680 × 1080 JPEG, Streamstart in etwa 1,9 Sekunden.
  Der Filamentweg ist im dunklen Bild nicht ausreichend erkennbar.

Der Ferntest bestätigt keine Reparatur. Das Herausziehen bzw. Prüfen des
Filaments erfordert einen Eingriff am Gerät; niemand ist derzeit vor Ort.

## H2D mit AMS

- HMS `0C00-0300-0002-000E`: mögliche Materialansammlung an der Düse.
- Druckmeldung `0300400C`: der vorherige Auftrag wurde abgebrochen; Status
  `FAILED`.
- Frischer H.264-Stream mit 1680 × 1080 Pixeln, Streamstart in etwa 0,6 Sekunden;
  60 Samples empfangen und ein Bild dekodiert.
- Das Bild zeigt den Druckkopf und mehrere Teile auf der Platte. Aus diesem
  Blickwinkel lässt sich die gemeldete Materialansammlung weder sicher
  bestätigen noch ausschließen.

Die Warnung wurde nicht quittiert. Die Düse muss vor einer Freigabe geprüft und
gegebenenfalls gereinigt werden.

## P1S ohne AMS: Kamera

Cloud-Anmeldung, Kamera-Freigabe und Öffnen des Kamera-Tunnels funktionieren.
`Bambu_StartStream` bleibt bei `Bambu_would_block` (numerischer Wert `2`), bis
der Test abbricht. Dieser Rückgabewert ist ein Wartezustand, keine Diagnose eines
Kameradefekts. Auch Bambu Studio hatte zuvor einen Ladefehler angezeigt.

Der private Testempfänger wurde korrigiert:

- bis zu 45 Sekunden auf den Streamstart warten und einen Timeout ausdrücklich
  als solchen melden;
- auch bei Startfehlern `Bambu_Close` und `Bambu_Destroy` aufrufen;
- nur bereinigte numerische Diagnoseinformationen ausgeben.

Die erfolgreichen A1-/H2D-Abrufe sowie die sauber abgeschlossenen Timeout-Pfade
wurden am Gerät getestet. Ein zweiter P1S-Abruf mit neuer Kameraadresse nach
sauberem Verbindungsabbau scheiterte erneut nach 45 Sekunden. Der P1S-Kamerafehler
ist damit **nicht behoben**. Der Nutzer hat anschließend bestätigt, dass alle anderen Livebilder geschlossen
sind. Bambu Studio zeigte bei der Kontrolle auf diesem Mac seine Startseite.
Auch der abschließende Abruf mit neuer Kameraadresse unter dieser bestätigten
Bedingung scheiterte gegen 18:10 Uhr erneut nach 45 Sekunden beim Streamstart.
Alle drei Versuche wurden anschließend sauber mit `Bambu_Close` und
`Bambu_Destroy` beendet. Eine konkurrierende, vom Nutzer geöffnete
Kamerasitzung erklärt den letzten Fehlschlag damit nicht.

## Umfang und Belege

In dieser Diagnoserunde wurden keine Bewegungs-, Heiz-, Druckstart-, Neustart-
oder Fehlerquittierungsbefehle gesendet. Bestehende Warnungen blieben erhalten.
Temporäre SDK-Zugangskopien, Kameraadressen und Logs wurden nach den Tests
entfernt. Der ursprüngliche Token-Store blieb unverändert.

Bereinigte Ergebnisse stehen unter `output/bambu-fault-test-20261024/summary.json`.
Die privaten Kamerabilder und Testprogramme liegen unter
`.data/bambu-cloud-probe/` und sind von Git ausgeschlossen. Die Änderungen am
Testempfänger sind noch kein produktiver Cloud-Kameradienst.

Die deutschen Meldungstexte wurden aus den HMS-Ressourcen der installierten
Bambu-Studio-Version gelesen. Der Rückgabewert und der Verbindungsabbau wurden
mit [BambuTunnel.h](https://github.com/bambulab/BambuStudio/blob/master/src/slic3r/GUI/Printer/BambuTunnel.h)
und [wxMediaCtrl3.cpp](https://github.com/bambulab/BambuStudio/blob/master/src/slic3r/GUI/wxMediaCtrl3.cpp)
abgeglichen; die Filamentstatus-Auswertung mit
[DeviceManager.cpp](https://github.com/bambulab/BambuStudio/blob/master/src/slic3r/GUI/DeviceManager.cpp).

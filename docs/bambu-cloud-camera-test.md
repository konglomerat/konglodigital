# Cloud-Kameratest vom 24.10.2026

Der automatische Abruf über Bambu Cloud wurde an den Werkstattdruckern erfolgreich
getestet. Die Bilder wurden aus neu aufgebauten Kameraverbindungen empfangen,
ohne einen erreichbaren LAN-Kameraport und ohne Bildschirmaufnahme aus Studio.

| Drucker | Empfang | Auflösung | Zeitpunkt (Europe/Berlin, ungefähr) |
| --- | --- | --- | --- |
| P1S ohne AMS | JPEG, zweites empfangenes Bild gespeichert | 1280 × 720 | 17:09 |
| A1 Mini | JPEG, zweites empfangenes Bild gespeichert | 1680 × 1080 | 17:10 |
| P1S mit AMS | JPEG, zweites empfangenes Bild gespeichert | 1280 × 720 | 17:11 |
| H2D mit AMS | H.264, 60 Samples empfangen und JPEG dekodiert | 1680 × 1080 | 17:12 |

Die genauen Zeiten, Bytezahlen und Prüfsummen stehen in
`output/bambu-cloud-camera-test-20261024/summary.json`. Bilder und Testprogramme
liegen lokal unter `.data/bambu-cloud-probe/` und sind von Git ausgeschlossen.
Es wurden keine Druck-, Bewegungs- oder Heizbefehle gesendet und keine Firmware-
oder Drucker-Modi verändert. Die normale Cloud-Anbindung blieb bestehen.

## Funktionierender Ablauf

1. Vorhandenen Kontozugang aus dem privaten Token-Store nutzen, Benutzerprofil
   laden und einen isolierten SDK-Konfigurationsordner anlegen.
2. Originale Linux-Bibliothek `libbambu_networking.so`, Version **02.08.02.54**,
   mit den üblichen Studio-Headern initialisieren. Im Test wurde der Client-
   Versionsheader `02.08.02.61` verwendet.
3. Gültigen Linux-Zertifikatsspeicher bereitstellen. Im erfolgreichen Container
   wurden `SSL_CERT_FILE` und `CURL_CA_BUNDLE` auf
   `/etc/ssl/certs/ca-certificates.crt` sowie `SSL_CERT_DIR` auf `/etc/ssl/certs`
   gesetzt. TLS-Zertifikatsprüfung blieb aktiv.
4. `change_user`, `update_cert`, Cloud-Verbindung und Drucker-Abonnement aufbauen;
   den aktuellen Status und die Versionsinformationen anfordern. Die normale
   SDK-Gerätezertifikat-Initialisierung ausführen. Danach `get_camera_url` mit
   Drucker-ID, Firmware und TUTK als Verbindungstyp aufrufen.
5. Auf Kamera-Freigabe des Druckers und die temporäre Cloud-Kameraadresse warten.
   Direkte alte `ttcode`-/`liveview.prepare`-Nachbauten waren zuvor gescheitert.
6. Die temporäre Adresse an die originale macOS-Bibliothek `libBambuSource.dylib`
   aus Paket **02.08.01.53** übergeben. `Bambu_Open`, `Bambu_StartStream` und
   `Bambu_ReadSample` lieferten bei allen vier Druckern Daten. Die Adresse wird
   nur privat übergeben und anschließend gelöscht.

Die Bibliotheken wurden von Bambu bezogen; die macOS-Bibliotheken bestanden die
Signaturprüfung. Es wurden keine Hersteller-Schlüssel extrahiert, Bibliotheken
verändert oder Signaturprüfungen umgangen.

## Besonderheiten des Testrechners

Der Testrechner ist ein Apple-Silicon-Mac. Die Linux-Netzwerkbibliothek stürzte
unter der standardmäßigen Docker-x86-Emulation bereits beim Laden ab. Unter
explizitem QEMU-x86_64 in einem ARM64-Container funktionierten Anmeldung und
Kamera-Freigabe. Der Bildempfang in dieser Emulation blieb hängen; der native
macOS-Empfänger funktionierte anschließend bei allen vier Druckern.

Die reine macOS-Netzwerkbibliothek lieferte beim A1 Mini und P1S HTTP 403.
Der erfolgreiche Prototyp kombiniert daher Linux für die Freigabe mit macOS für
den Empfang. Ein durchgehend nativer Linux-x86_64-Dienst ist ein naheliegender
Bereitstellungsweg, wurde auf diesem Rechner aber noch **nicht** verifiziert.
Ein gewöhnlicher HTTP-Snapshot-Endpunkt wurde durch den Test nicht nachgewiesen.

## Folgen für die Druckautomatik

Der fehlende Rechner im Drucker-LAN blockiert die Kameraidee grundsätzlich nicht
mehr. Es wird jedoch weiterhin ein laufender Dienst für Cloud-Anmeldung,
Verbindungsaufbau, Token-Erneuerung und Bildempfang benötigt. Der Prototyp ist
noch kein produktiver Kamera-Adapter für die Admin-Oberfläche.

Die erfolgreichen Einzelabrufe belegen keine Langzeitstabilität. Wiederverbindung,
abgelaufene Tokens, konkurrierende Kamerasitzungen und Firmware-Updates müssen
vor einem dauerhaften Betrieb berücksichtigt werden.

Beim späteren [Positionierungstest](bambu-bed-positioning-test.md) scheiterten
erneute Streamstarts des P1S ohne AMS; der P1S mit AMS lieferte weiterhin ein
frisches Livebild. Der Cloud-Kamera-Prototyp ist daher noch nicht zuverlässig
genug für unbeaufsichtigte Bewegungsentscheidungen.

Auf den aufgenommenen P1S-Bildern ist das Druckbett nicht vollständig sichtbar;
das A1-Mini-Bild ist dunkel und zeigt die Platte ebenfalls nicht vollständig.
Aus diesen Bildern darf keine sichere Leer-Erkennung abgeleitet werden. Die
bestehende Regel „Bett vollständig sichtbar und zweifach frei erkannt“ muss
weiterhin einen Start verhindern, wenn ausreichende Bildbelege fehlen.
Auf dem H2D-Bild sind mehrere gedruckte Teile auf der Platte sichtbar.

Die Beschränkung auf Admins bleibt bestehen. Automatischer Echtbetrieb und
signierter Drucktransport wurden durch diesen Kameratest nicht freigeschaltet.

## Quellen für den Verbindungsaufbau

- [Bambu Studio: MediaPlayCtrl](https://github.com/bambulab/BambuStudio/blob/v02.07.01.62/src/slic3r/GUI/MediaPlayCtrl.cpp)
- [Bambu Studio: NetworkAgent](https://github.com/bambulab/BambuStudio/blob/v02.07.01.62/src/slic3r/Utils/NetworkAgent.cpp)
- [P1S-Kamera-Freigabe und aktuelle Firmware](https://github.com/ClusterM/open-bamboo-networking/issues/112)
- [Erfolgreicher Abruf mit originaler Linux-Bibliothek und update_cert](https://github.com/ClusterM/open-bamboo-networking/issues/119#issuecomment-5979422066)

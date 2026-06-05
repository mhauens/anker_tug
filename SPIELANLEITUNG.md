# Anchor Tug - Spielanleitung

## Spielidee

In **Anchor Tug** tritt der Streamer gegen seinen Twitch-Chat an.

Der Chat versucht, den Anker vom Meeresgrund bis an die Oberflaeche zu ziehen. Der Streamer wehrt sich mit Skillchecks und versucht, den Anker unten zu halten, bis die aktuelle Hype-Train-Stufe endet.

Das Spiel startet automatisch, sobald Twitch einen aktiven Hype Train meldet.

## Ziel des Spiels

### Chat

Der Chat gewinnt eine Runde, wenn der Anker die Oberflaeche erreicht. Danach beginnt sofort eine neue Runde in derselben Hype-Train-Stufe.

### Streamer

Der Streamer gewinnt eine Runde, wenn die aktuelle Hype-Train-Stufe endet oder das Zeitlimit ablaeuft, bevor der Chat den Anker bis zur Oberflaeche gezogen hat.

Nach einem Levelaufstieg beginnt die naechste Runde mit der neuen Hype-Train-Stufe.

## Punkte und Spielende

- Jeder befreite Anker gibt dem Chat einen Punkt.
- Jede erfolgreich gehaltene Hype-Train-Stufe gibt dem Streamer einen Punkt.
- Der Punktestand bleibt waehrend des gesamten Hype Trains erhalten.
- Nach dem Ende des Hype Trains erscheint das abschliessende Scoreboard.

## Aktionen des Chats

### Subs

Ein neuer regulaerer Sub zieht den Anker in Richtung Oberflaeche.

Auch angekuendigte Resubs werden als regulaerer Sub gewertet. Gift-Subs werden ueber das zusammengefasste Gift-Event verarbeitet, damit sie nicht doppelt zaehlen.

### Gift-Subs

Gift-Sub-Pakete erzeugen mehr Zugkraft als ein einzelner Sub. Unterstuetzt werden auch Zwischenwerte und grosse Wellen wie 6, 7, 8, 10, 20, 50, 100, 200 oder 1000 Gift-Subs.

Die Zugkraft steigt mit jeder zusaetzlichen Gift-Anzahl spuerbar weiter und bekommt einen kleinen Bonus fuer groessere Wellen. Eine 1000er-Subbombe ist die groesste unterstuetzte Welle und deutlich staerker als ein 200er Gift, beendet jedoch nicht automatisch unbegrenzt viele Runden.

Ueberschuessige Zugkraft geht beim Erreichen der Oberflaeche nicht verloren, sondern wird auf die folgende Runde uebertragen.

### Community-Voting

Alle 30 Sekunden wird ein Chat-Voting ausgewertet. Jeder Twitch-Account hat pro Abstimmungsfenster eine Stimme. Ein erneuter Befehl desselben Accounts ersetzt dessen vorherige Stimme.

- `!ziehen`: Hilft dem Chat und zieht den Anker nach oben.
- `!senken`: Hilft dem Streamer und senkt den Anker.

Die Seite mit den meisten Stimmen bewegt den Anker je nach Hype-Train-Level staerker. In Level 1 entspricht das einem regulaeren Sub, in hoeheren Leveln entsprechend mehreren Subs. Bei Gleichstand bleibt der Anker unveraendert.

Der Balancebalken zeigt waehrend der Abstimmung, zu welcher Seite das Voting tendiert.

## Aktion des Streamers

In regelmaessigen Abstaenden erscheint ein **Ankermanoever**. Die Zielbereiche sind bewusst knapp gehalten und werden in hoeheren Hype-Train-Leveln schneller und enger.

Der Streamer drueckt die **Leertaste**, waehrend der bewegliche Marker in einem Zielbereich liegt:

- Grosser Zielbereich: gutes Manoever
- Gelber Bereich: sehr gutes Manoever
- Kleiner roter Bereich in der Mitte: perfektes Manoever
- Ausserhalb des Zielbereichs oder nicht rechtzeitig gedrueckt: Fehlversuch; der Anker bleibt stabil

Ein besser getroffener Bereich senkt den Anker staerker. Gruen entspricht 5 Subs, Gelb 10 Subs und Perfekt 20 Subs. In hoeheren Hype-Train-Leveln werden die Skillchecks anspruchsvoller und gleichzeitig wirkungsvoller.

## Level und Balance

Jede Runde beginnt optisch nahe am Meeresgrund. Die intern notwendige Zugkraft ist jedoch vom Hype-Train-Level abhaengig:

- Fruehe Level haben eine kuerzere Spielstrecke und schwaechere Skillchecks.
- Spaetere Level haben eine laengere Spielstrecke und staerkere Skillchecks.
- Dadurch bleiben Subs, Gift-Subs und Streamer-Manoever ueber alle Level hinweg relevant.

## Anzeige

### Obere Leiste

- Aktueller Punktestand von Streamer und Chat
- Laufende Rundennummer
- Aktuelles Hype-Train-Level und dessen Twitch-Fortschritt
- Status der Twitch-Verbindung
- Dezente Liste der letzten fuenf Sub-Ereignisse mit Metern und sofort gewonnenen Chatpunkten

### Linke Tiefenanzeige

Zeigt die aktuelle Position des Ankers zwischen Oberflaeche und Meeresgrund in Metern. Die Skala passt sich an die Laenge der aktuellen Hype-Train-Stufe an.

### Community-Voting

Zeigt den Countdown, beide Chat-Befehle, die Stimmen und den aktuellen Abstimmungstrend.

### Ereignismeldung

Eine kurze Meldung informiert ueber Subs, Gift-Subs, Skillchecks, Rundensiege und Levelwechsel.

### Letzte Subs

Die dezente Liste rechts oben zeigt die letzten fuenf Sub-Ereignisse und wie viele Meter sie den Anker nach oben gezogen haben.

## Twitch-Verbindung

Vor dem Spiel muss der Streamer **Mit Twitch verbinden** auswaehlen und den Zugriff autorisieren. Danach wartet die App auf einen Hype Train.

Bei einer unterbrochenen Twitch-Verbindung pausieren die laufenden Spielkraefte. Das offizielle Ende der Hype-Train-Stufe wird weiterhin anhand der von Twitch gelieferten Ablaufzeit beruecksichtigt.

## Testmodus

Das aufklappbare Menue **Testmodus** dient zum Ausprobieren ohne echten Hype Train. Es bietet unter anderem:

- Runde starten
- Hype-Train-Level erhoehen
- Einzelnen Sub simulieren
- 5 bis 1000 Gift-Subs simulieren, inklusive Zwischenwerten wie 6, 7 und 8
- Stimmen fuer `!ziehen` und `!senken` erzeugen
- Skillcheck ausloesen
- Hype Train beenden
- Spiel zuruecksetzen

Der Testmodus beeinflusst nur den lokalen Spielzustand und sendet keine Aktionen an Twitch.

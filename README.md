![Logo](admin/alarmmanager_README.png)
# ioBroker.alarmmanager

**Tests:** ![Test and Release](https://github.com/t0Puk/ioBroker.alarmmanager/workflows/Test%20and%20Release/badge.svg)

## Übersicht

**ioBroker.alarmmanager** ist ein Adapter zur Alarmierung von Pagern über die **e*Message API**.  
Er unterstützt Eskalationsstufen, Rückmeldungen, zustandsbasierte Trigger sowie jetzt auch **Zeitfenster pro Trigger**.

Damit kann festgelegt werden, dass bestimmte Alarme nur tagsüber gesendet werden, während wichtige Alarme weiterhin rund um die Uhr alarmieren.

## Funktionen

- Alarmierung über **e*Message**
- Unterstützung für:
  - **2wayS**
  - **eCityruf**
  - **eBos**
- Eskalationslogik mit mehreren Pagern
- Rückmeldelogik über Antwortcodes
- zustandsbasierte Auslöser über ioBroker States
- optionaler paralleler Versand über Telegram
- konfigurierbare Folgeaktionen bei Antwortcodes
- **Zeitfenster pro Trigger**
- Testversand aus der Admin-Oberfläche

## Typische Einsatzfälle

Der Adapter kann zum Beispiel für folgende Alarme verwendet werden:

- Unwetterwarnungen
- Meldungen aus Warn-Apps wie DWD oder NINA
- technische Störungen
- Systemfehler
- Gebäude- oder Hausautomationsmeldungen
- eigene ioBroker States
- individuelle Eskalationsszenarien

## Neue Funktion: Zeitfenster pro Trigger

Ab Version **0.0.4** kann für jeden Trigger ein eigenes Zeitfenster definiert werden.

Beispiele:

- **unwichtiger Alarm nur tagsüber:** `06:00` bis `22:00`
- **Nachtalarm:** `22:00` bis `06:00`
- **immer aktiv:** Zeitfenster deaktiviert

Damit lassen sich weniger wichtige Meldungen nachts unterdrücken, ohne dass kritische Alarme verloren gehen.

### Verhalten

- Ein Trigger löst nur aus, wenn das Zeitfenster aktiv ist und die aktuelle Uhrzeit darin liegt.
- Ist kein Zeitfenster aktiv, verhält sich der Trigger wie bisher.
- Nachtfenster wie `22:00` bis `06:00` werden unterstützt.
- Wenn ein Alarm wegen `queueDelaySec` erst später verarbeitet wird, wird vor dem Versand nochmals geprüft, ob das Zeitfenster dann noch gültig ist.

## Admin-Oberfläche

Im Bereich **Auslöser / States** können pro Trigger folgende Felder gesetzt werden:

- **Zeitfenster aktiv**
- **Erlaubt von**
- **Erlaubt bis**

Zeitformat: `HH:mm`

Beispiele:
- `06:00`
- `22:00`

## Trigger / States

Ein Trigger besteht aus:

- State-ID
- aktiv / inaktiv
- Bedingung
- Vergleichswert
- Nachrichtentext
- optionalem Zeitfenster

Unterstützte Bedingungen:

- `true`
- `false`
- `=`
- `>`
- `<`

## Antwortcodes

Antwortcodes können verwendet werden, um auf Pager-Rückmeldungen zu reagieren.

Mögliche Aktionen:

- Sendevorgang beenden
- nächsten Pager auslösen
- Ausgang / Folgeaktion auslösen
- Quittierwert in Datenpunkt schreiben

## Testinstallation

Repository:  
`https://github.com/t0Puk/ioBroker.alarmmanager`

Testinstallation:
```bash
iobroker url https://github.com/t0Puk/ioBroker.alarmmanager/tarball/main --host this

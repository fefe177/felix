/*
  Arduino <-> PC Kommunikation über die serielle Schnittstelle (USB-Kabel)

  Was macht dieses Programm?
  - Der PC schickt Text an den Arduino.
  - Der Arduino empfängt den Text und schickt ihn wieder zurück ("Echo").
  - Zusätzlich blinkt die eingebaute LED kurz, wenn etwas empfangen wurde,
    damit man auch am Gerät sieht, dass Daten angekommen sind.

  Hochladen:
  1. Arduino IDE öffnen (kostenlos von arduino.cc).
  2. Diesen Sketch öffnen.
  3. Oben unter "Werkzeuge" das richtige Board und den richtigen Port (COMx) wählen.
  4. Auf den Pfeil (Hochladen) klicken.

  Testen ohne PC-Programm:
  - In der Arduino IDE oben rechts auf das Lupen-Symbol ("Serieller Monitor").
  - Unten die Baudrate auf 9600 stellen.
  - Oben Text eintippen und auf "Senden" klicken -> der Arduino antwortet.
*/

// Hier speichern wir den empfangenen Text zwischen.
String empfangenerText = "";

void setup() {
  // Serielle Verbindung mit 9600 Baud starten.
  // WICHTIG: Am PC muss die gleiche Baudrate (9600) eingestellt sein!
  Serial.begin(9600);

  // Eingebaute LED als Ausgang festlegen.
  pinMode(LED_BUILTIN, OUTPUT);

  // Kleine Begrüßung an den PC schicken.
  Serial.println("Arduino ist bereit. Schick mir etwas Text!");
}

void loop() {
  // Solange Zeichen vom PC da sind, lesen wir sie ein.
  while (Serial.available() > 0) {
    char zeichen = Serial.read();

    // Ein "\n" (Enter) bedeutet: die Nachricht ist zu Ende.
    if (zeichen == '\n') {
      // LED kurz aufblinken lassen als Signal "empfangen".
      digitalWrite(LED_BUILTIN, HIGH);
      delay(100);
      digitalWrite(LED_BUILTIN, LOW);

      // Den gesammelten Text wieder an den PC zurückschicken.
      Serial.print("Du hast gesendet: ");
      Serial.println(empfangenerText);

      // Speicher fuer die naechste Nachricht leeren.
      empfangenerText = "";
    }
    else if (zeichen != '\r') {
      // Alle anderen Zeichen (ausser dem Wagenruecklauf '\r') anhaengen.
      empfangenerText += zeichen;
    }
  }
}

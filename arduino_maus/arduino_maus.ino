/*
  Arduino als USB-Maus: Mausbewegungen vom PC empfangen und ausfuehren

  Der PC schickt ueber die serielle Schnittstelle Bewegungsbefehle,
  und der Arduino bewegt damit den echten Mauszeiger.

  ================== WICHTIG: PASSENDES BOARD ==================
  Das funktioniert NUR mit Boards, die sich als USB-Maus ausgeben koennen:
    - Arduino Leonardo
    - Arduino Micro
    - Arduino Pro Micro
  (Sie haben den Chip ATmega32u4.)

  Ein Arduino UNO oder NANO kann das NICHT ohne Weiteres!
  =============================================================

  Befehls-Format (jede Zeile ein Befehl, mit Enter '\n' abgeschlossen):
    "x,y"   -> Maus um x nach rechts und y nach unten bewegen
               Beispiel:  "10,-5"  = 10 nach rechts, 5 nach oben
    "L"     -> Linksklick
    "R"     -> Rechtsklick

  Hochladen:
  1. Arduino IDE oeffnen.
  2. Unter "Werkzeuge -> Board" z. B. "Arduino Leonardo" waehlen.
  3. Richtigen Port waehlen, dann Hochladen.

  Achtung: Sobald der Sketch laeuft, kann der Arduino deinen Mauszeiger
  steuern. Zum Neu-Hochladen ggf. den Reset-Knopf druecken, falls die
  Maus "verrueckt" spielt.
*/

#include <Mouse.h>   // Bibliothek, um die Maus zu steuern (ist schon dabei)

String befehl = "";  // hier sammeln wir die empfangene Zeile

void setup() {
  // Schnelle Verbindung fuer fluessige Bewegung (kaum Verzoegerung).
  // Am PC muss die gleiche Baudrate (115200) eingestellt sein!
  Serial.begin(115200);

  // Maus-Funktion starten. Ab jetzt ist der Arduino eine USB-Maus.
  Mouse.begin();
}

void loop() {
  // Alle vorhandenen Zeichen einlesen.
  while (Serial.available() > 0) {
    char zeichen = Serial.read();

    if (zeichen == '\n') {
      befehlAusfuehren(befehl);  // Zeile ist komplett -> ausfuehren
      befehl = "";               // fuer die naechste Zeile leeren
    }
    else if (zeichen != '\r') {
      befehl += zeichen;         // Zeichen anhaengen
    }
  }
}

// Wertet eine komplette Zeile aus und fuehrt die Aktion aus.
void befehlAusfuehren(String zeile) {
  zeile.trim();  // Leerzeichen am Rand entfernen

  if (zeile.length() == 0) {
    return;  // leere Zeile ignorieren
  }

  // Klick-Befehle
  if (zeile == "L") {
    Mouse.click(MOUSE_LEFT);
    return;
  }
  if (zeile == "R") {
    Mouse.click(MOUSE_RIGHT);
    return;
  }

  // Bewegungs-Befehl im Format "x,y"
  int komma = zeile.indexOf(',');
  if (komma > 0) {
    int x = zeile.substring(0, komma).toInt();
    int y = zeile.substring(komma + 1).toInt();

    // Mouse.move nimmt nur Werte von -127 bis 127 pro Schritt.
    // Groessere Bewegungen teilen wir in kleine Schritte auf.
    mausBewegen(x, y);
  }
}

// Bewegt die Maus auch bei grossen Werten sauber (in Schritten <= 127).
void mausBewegen(int x, int y) {
  while (x != 0 || y != 0) {
    int schrittX = constrain(x, -127, 127);
    int schrittY = constrain(y, -127, 127);
    Mouse.move(schrittX, schrittY);
    x -= schrittX;
    y -= schrittY;
  }
}

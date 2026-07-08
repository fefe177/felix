/*
  Arduino als USB-Maus: Mausbewegungen vom PC empfangen und ausfuehren

  Der PC schickt ueber die serielle Schnittstelle Befehle,
  und der Arduino steuert damit den echten Mauszeiger.

  ================== WICHTIG: PASSENDES BOARD ==================
  Das funktioniert NUR mit Boards, die sich als USB-Maus ausgeben koennen:
    - Arduino Leonardo
    - Arduino Micro
    - Arduino Pro Micro
  (Sie haben den Chip ATmega32u4.)

  Ein Arduino UNO oder NANO kann das NICHT ohne Weiteres!
  =============================================================

  Befehls-Format (jede Zeile ein Befehl, mit Enter '\n' abgeschlossen):
    "x,y"   -> Maus bewegen (x nach rechts, y nach unten)
               Beispiel:  "10,-5"  = 10 nach rechts, 5 nach oben
    "S,n"   -> Scrollen um n (positiv = hoch, negativ = runter)
               Beispiel:  "S,-3"   = 3 nach unten scrollen
    "L"     -> kurzer Linksklick
    "R"     -> kurzer Rechtsklick
    "M"     -> kurzer Klick mittlere Taste (Mausrad-Klick)
    "DL"    -> Doppelklick links
    "PL"    -> linke Taste GEDRUECKT halten (Start vom Ziehen/Drag)
    "RL"    -> linke Taste LOSLASSEN        (Ende vom Ziehen/Drag)
    "PR"    -> rechte Taste gedrueckt halten
    "RR"    -> rechte Taste loslassen
    "PM"    -> mittlere Taste gedrueckt halten
    "RM"    -> mittlere Taste loslassen

  Tastatur:
    "KD,c"  -> Taste mit Code c DRUECKEN   (z. B. "KD,97" = Taste 'a')
    "KU,c"  -> Taste mit Code c LOSLASSEN
    "KX"    -> ALLE Tasten und Maustasten loslassen (Sicherheit)

  Die Zahl c ist entweder ein normales Zeichen (ASCII, z. B. 97 = 'a')
  oder ein Sondertasten-Code der Keyboard-Bibliothek (z. B. 176 = Enter).
  Hinweis: Der Arduino nutzt das US-Layout, daher koennen auf einem
  deutschen Ziel-PC z/y vertauscht und Umlaute falsch sein.

  Ziehen (Drag) besteht also aus: PL  ->  mehrere "x,y"  ->  RL

  Hochladen:
  1. Arduino IDE oeffnen.
  2. Unter "Werkzeuge -> Board" z. B. "Arduino Leonardo" waehlen.
  3. Richtigen Port waehlen, dann Hochladen.
*/

#include <Mouse.h>      // um die Maus zu steuern (ist schon dabei)
#include <Keyboard.h>   // um die Tastatur zu steuern (ist schon dabei)

String befehl = "";  // hier sammeln wir die empfangene Zeile

void setup() {
  // Schnelle Verbindung fuer fluessige Bewegung (kaum Verzoegerung).
  // Am PC muss die gleiche Baudrate (115200) eingestellt sein!
  Serial.begin(115200);

  // Maus und Tastatur starten. Ab jetzt ist der Arduino Maus + Tastatur.
  Mouse.begin();
  Keyboard.begin();
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
      // Schutz: bei Stoerungen ohne Zeilenende darf der Text nicht
      // endlos wachsen. Gueltige Befehle sind kurz (unter 40 Zeichen).
      if (befehl.length() < 40) {
        befehl += zeichen;       // Zeichen anhaengen
      }
    }
  }
}

// Wertet eine komplette Zeile aus und fuehrt die Aktion aus.
void befehlAusfuehren(String zeile) {
  zeile.trim();  // Leerzeichen am Rand entfernen

  if (zeile.length() == 0) {
    return;  // leere Zeile ignorieren
  }

  // ----- Klicks (kurz) -----
  if (zeile == "L") { Mouse.click(MOUSE_LEFT);   return; }
  if (zeile == "R") { Mouse.click(MOUSE_RIGHT);  return; }
  if (zeile == "M") { Mouse.click(MOUSE_MIDDLE); return; }

  // ----- Doppelklick links -----
  if (zeile == "DL") {
    Mouse.click(MOUSE_LEFT);
    delay(40);              // kurze Pause, damit es als Doppelklick zaehlt
    Mouse.click(MOUSE_LEFT);
    return;
  }

  // ----- Taste halten / loslassen (fuers Ziehen) -----
  if (zeile == "PL") { Mouse.press(MOUSE_LEFT);     return; }
  if (zeile == "RL") { Mouse.release(MOUSE_LEFT);   return; }
  if (zeile == "PR") { Mouse.press(MOUSE_RIGHT);    return; }
  if (zeile == "RR") { Mouse.release(MOUSE_RIGHT);  return; }
  if (zeile == "PM") { Mouse.press(MOUSE_MIDDLE);   return; }
  if (zeile == "RM") { Mouse.release(MOUSE_MIDDLE); return; }

  // ----- Tastatur -----
  if (zeile == "KX") {                 // Sicherheit: alles loslassen
    Keyboard.releaseAll();
    Mouse.release(MOUSE_LEFT);
    Mouse.release(MOUSE_RIGHT);
    Mouse.release(MOUSE_MIDDLE);
    return;
  }
  if (zeile.startsWith("KD,")) {        // Taste druecken
    Keyboard.press((uint8_t) zeile.substring(3).toInt());
    return;
  }
  if (zeile.startsWith("KU,")) {        // Taste loslassen
    Keyboard.release((uint8_t) zeile.substring(3).toInt());
    return;
  }

  // ----- Scrollen: "S,n" -----
  if (zeile.startsWith("S,")) {
    int n = zeile.substring(2).toInt();
    scrollen(n);
    return;
  }

  // ----- Bewegung: "x,y" -----
  int komma = zeile.indexOf(',');
  if (komma > 0) {
    int x = zeile.substring(0, komma).toInt();
    int y = zeile.substring(komma + 1).toInt();
    mausBewegen(x, y);
  }
}

// Bewegt die Maus auch bei grossen Werten sauber (in Schritten <= 127).
void mausBewegen(int x, int y) {
  while (x != 0 || y != 0) {
    int schrittX = constrain(x, -127, 127);
    int schrittY = constrain(y, -127, 127);
    Mouse.move(schrittX, schrittY, 0);
    x -= schrittX;
    y -= schrittY;
  }
}

// Scrollt um n (auch grosse Werte werden in Schritten <= 127 gemacht).
void scrollen(int n) {
  while (n != 0) {
    int schritt = constrain(n, -127, 127);
    Mouse.move(0, 0, schritt);   // dritter Wert = Mausrad
    n -= schritt;
  }
}

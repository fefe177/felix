#!/usr/bin/env python3
"""pwgen — sichere Passwörter erzeugen.

Beispiele:
    pwgen.py                      # 1 Passwort, 16 Zeichen, alle Klassen
    pwgen.py -l 24 -c 5           # 5 Passwörter à 24 Zeichen
    pwgen.py --no-symbols         # ohne Sonderzeichen
    pwgen.py --words 4            # Passphrase aus 4 Wörtern
"""
import argparse
import secrets
import string
import sys

LOWER = string.ascii_lowercase
UPPER = string.ascii_uppercase
DIGITS = string.digits
SYMBOLS = "!@#$%^&*-_=+?"

# Kleine, einprägsame Wortliste für Passphrasen.
WORDS = (
    "apfel berg blau brot delta echo feder gamma hafen igel insel jaguar "
    "kabel lampe magnet nebel ozean pixel quarz radar segel turm ufer "
    "vogel wolke xenon yacht zebra anker baum stern mond sonne fluss wald"
).split()


def build_charset(use_lower, use_upper, use_digits, use_symbols):
    charset = ""
    if use_lower:
        charset += LOWER
    if use_upper:
        charset += UPPER
    if use_digits:
        charset += DIGITS
    if use_symbols:
        charset += SYMBOLS
    return charset


def generate_password(length, charset):
    """Erzeuge ein Passwort aus charset mit kryptographisch sicherem RNG."""
    if length < 1:
        raise ValueError("Länge muss mindestens 1 sein")
    if not charset:
        raise ValueError("Zeichensatz ist leer")
    return "".join(secrets.choice(charset) for _ in range(length))


def generate_passphrase(num_words, separator="-"):
    """Erzeuge eine Passphrase aus zufälligen Wörtern."""
    if num_words < 1:
        raise ValueError("Wortanzahl muss mindestens 1 sein")
    return separator.join(secrets.choice(WORDS) for _ in range(num_words))


def estimate_bits(length, charset_size):
    """Geschätzte Entropie in Bit."""
    import math

    if charset_size <= 1 or length <= 0:
        return 0.0
    return length * math.log2(charset_size)


def build_parser():
    p = argparse.ArgumentParser(description="Sichere Passwörter und Passphrasen erzeugen.")
    p.add_argument("-l", "--length", type=int, default=16, help="Länge je Passwort (Standard: 16)")
    p.add_argument("-c", "--count", type=int, default=1, help="Anzahl Passwörter (Standard: 1)")
    p.add_argument("--no-lower", action="store_true", help="keine Kleinbuchstaben")
    p.add_argument("--no-upper", action="store_true", help="keine Großbuchstaben")
    p.add_argument("--no-digits", action="store_true", help="keine Ziffern")
    p.add_argument("--no-symbols", action="store_true", help="keine Sonderzeichen")
    p.add_argument("--words", type=int, metavar="N", help="Passphrase aus N Wörtern statt Zeichen-Passwort")
    return p


def main(argv=None):
    args = build_parser().parse_args(argv)

    if args.count < 1:
        print("Fehler: count muss mindestens 1 sein", file=sys.stderr)
        return 1

    if args.words is not None:
        for _ in range(args.count):
            print(generate_passphrase(args.words))
        return 0

    charset = build_charset(
        not args.no_lower, not args.no_upper, not args.no_digits, not args.no_symbols
    )
    if not charset:
        print("Fehler: alle Zeichenklassen deaktiviert", file=sys.stderr)
        return 1

    try:
        for _ in range(args.count):
            print(generate_password(args.length, charset))
    except ValueError as exc:
        print(f"Fehler: {exc}", file=sys.stderr)
        return 1

    bits = estimate_bits(args.length, len(charset))
    print(f"# ~{bits:.0f} Bit Entropie ({len(charset)} mögliche Zeichen)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())

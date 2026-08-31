"""Normalise data/catalog.csv to clean UTF-8.

Excel sometimes saves special characters (micro sign µ, superscript ³, ®, °)
as single Latin-1 bytes that are invalid UTF-8, so browsers show them as .
This rewrites any such stray bytes as proper UTF-8. Safe to run any time:
it only touches invalid bytes and never changes the number of rows.
"""
import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
PATH = os.path.join(HERE, "..", "data", "catalog.csv")

# Stray Latin-1 byte -> correct Unicode character.
LATIN1 = {0xB5: "µ", 0xB3: "³", 0xB2: "²", 0xB0: "°",
          0xAE: "®", 0xB9: "¹", 0xBC: "¼", 0xBD: "½",
          0xBE: "¾", 0xA9: "©", 0xB1: "±"}


def main():
    with open(PATH, "rb") as f:
        data = f.read()

    out = bytearray()
    i, fixed, unknown = 0, 0, []
    while i < len(data):
        b = data[i]
        if b < 0x80:
            out.append(b); i += 1; continue
        if 0xC2 <= b <= 0xDF and i + 1 < len(data) and 0x80 <= data[i + 1] <= 0xBF:
            out += data[i:i + 2]; i += 2; continue
        if 0xE0 <= b <= 0xEF and i + 2 < len(data) and 0x80 <= data[i + 1] <= 0xBF and 0x80 <= data[i + 2] <= 0xBF:
            out += data[i:i + 3]; i += 3; continue
        if 0xF0 <= b <= 0xF4 and i + 3 < len(data) and all(0x80 <= data[i + j] <= 0xBF for j in (1, 2, 3)):
            out += data[i:i + 4]; i += 4; continue
        # Also repair the U+FFFD replacement glyph if it stands in for a known symbol.
        if data[i:i + 3] == b"\xef\xbf\xbd":
            unknown.append((i, "U+FFFD")); out += b"\xef\xbf\xbd"; i += 3; continue
        if b in LATIN1:
            out += LATIN1[b].encode("utf-8"); fixed += 1; i += 1; continue
        unknown.append((i, hex(b))); out.append(b); i += 1

    result = bytes(out)
    try:
        result.decode("utf-8")
    except UnicodeDecodeError as e:
        print("ERROR: still not clean UTF-8:", e); return 1
    if result.count(b"\n") != data.count(b"\n"):
        print("ERROR: row count changed; aborting."); return 1
    if unknown:
        print("WARNING: %d symbol(s) I could not auto-map (left as-is):" % len(unknown))
        for pos, tag in unknown[:10]:
            ln = data.count(b"\n", 0, pos) + 1
            print("  line %d: %s" % (ln, tag))

    if result != data:
        with open(PATH, "wb") as f:
            f.write(result)
        print("Fixed %d stray character(s); catalog.csv is now clean UTF-8." % fixed)
    else:
        print("catalog.csv already clean UTF-8 — nothing to fix.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

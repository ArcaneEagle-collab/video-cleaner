import os
import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RELEASE_DIR = ROOT / "release"

def sha256_file(filepath: Path) -> str:
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def main():
    if not RELEASE_DIR.exists():
        print(f"Release directory {RELEASE_DIR} does not exist.")
        return

    output_file = RELEASE_DIR / "SHA256SUMS.txt"
    entries = []

    print("\n--- Generating SHA-256 Checksums for Release Artifacts ---")
    for f in sorted(RELEASE_DIR.iterdir()):
        if f.is_file() and f.suffix in [".exe", ".zip", ".msi"] and not f.name.endswith(".blockmap"):
            digest = sha256_file(f)
            entry = f"{digest}  {f.name}"
            entries.append(entry)
            print(f"  {f.name} ({f.stat().st_size / (1024*1024):.1f} MB)\n    SHA256: {digest}\n")

    if entries:
        with open(output_file, "w", encoding="utf-8") as out:
            out.write("\n".join(entries) + "\n")
        print(f"Saved SHA256 checksums to: {output_file}")
    else:
        print("No release binaries found to hash.")

if __name__ == "__main__":
    main()

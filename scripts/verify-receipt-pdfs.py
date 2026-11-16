"""Render synthetic export fixtures and verify their content and QR, using local QA tools."""
import json
from pathlib import Path
import sys

workspace = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(workspace / "tmp/pdf-tools"), str(workspace / "tmp/qr-print-check")]
import pymupdf
import zxingcpp
from PIL import Image

output = workspace / "output/claim-receipts"
expected = json.loads((output / "expected.json").read_text())
for name in ["physical-download", "physical-print", "long-unicode-download", "wallet-download"]:
    document = pymupdf.open(output / f"{name}.pdf")
    assert 1 <= len(document) <= 5, (name, len(document))
    contents = "\n".join(page.get_text() for page in document)
    assert expected["receiptNo"] in contents, (name, "missing receipt number")
    assert expected["evidenceHash"] in "".join(contents.split()), (name, "missing original evidence hash")
    assert "Print receipt" not in contents and "Save as PDF" not in contents, (name, "printed action buttons")
    assert "Staff workspace" not in contents, (name, "printed dashboard")
    if name.startswith("physical"):
        assert "FAMILY FOOD PACK" in contents and "SYNTHETIC-LOG-23" in contents, name
    if name == "long-unicode-download":
        assert "END-OF-RELEASE-NOTES" in contents, "Long evidence was truncated"
    if name == "wallet-download":
        assert "SYNTHETIC-LEDGER-001" in contents and "FAMILY FOOD PACK" not in contents, name
    codes = []
    for number, page in enumerate(document, 1):
        pixmap = page.get_pixmap(matrix=pymupdf.Matrix(300 / 72, 300 / 72), alpha=False)
        picture = Image.frombytes("RGB", [pixmap.width, pixmap.height], pixmap.samples)
        histogram = picture.convert("L").histogram()
        assert sum(histogram[:210]) / (picture.width * picture.height) > 0.001, (name, number, "blank page")
        codes.extend(code.text for code in zxingcpp.read_barcodes(picture))
        picture.thumbnail((1000, 1415))
        picture.save(output / f"{name}-{number}.png")
        for block in page.get_text("blocks"):
            assert block[0] >= 10 and block[1] >= 10 and block[2] <= page.rect.width - 10 and block[3] <= page.rect.height - 10, (name, number, "clipped text", block[:4])
    assert expected["qr"] in codes, (name, "receipt QR does not decode to the original record")
    print(f"PASS {name}: {len(document)} A4 pages, nonblank, original reference/evidence, scannable QR and safe margins")

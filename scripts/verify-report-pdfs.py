"""Check and render the synthetic report downloads using the workspace Poppler tools."""
from pathlib import Path
import json
import re
import shutil
import subprocess
import xml.etree.ElementTree as ET

workspace = Path(__file__).resolve().parents[2]
output = workspace / "output/pdf"
temporary = workspace / "tmp/pdfs/report-review"
previews = output / "previews"
temporary.mkdir(parents=True, exist_ok=True)
previews.mkdir(parents=True, exist_ok=True)
bundled = next((workspace / ".tools/poppler").glob("poppler-*/Library/bin"))


def tool(name):
    return shutil.which(name) or str(bundled / f"{name}.exe")


names = ["combined-summary", "claims", "audit-logs", "schedules", "anomalies", "funds", "physical-summary", "empty-claims"]
checks = []
for name in names:
    path = output / f"{name}.pdf"
    information = subprocess.run([tool("pdfinfo"), str(path)], check=True, capture_output=True).stdout.decode("utf-8")
    count = int(re.search(r"Pages:\s+(\d+)", information).group(1))
    text = subprocess.run([tool("pdftotext"), "-layout", "-enc", "UTF-8", str(path), "-"], check=True, capture_output=True).stdout.decode("utf-8")
    assert "GarantiyAid" in text and "COA-certified" in text, (name, "missing identity/disclosure")
    assert "Executive summary" in text, (name, "missing executive summary")
    assert "NaN" not in text and "undefined" not in text and "Invalid Date" not in text, (name, "invalid figure")
    if name == "combined-summary":
        for expected in ["Claim status", "Queue schedules", "Anomaly review", "Simulated fund utilization", "QA Peña 43", "₱75,000.00"]:
            assert expected in text, (name, expected)
    if name == "claims":
        assert "QA Peña 38" in text and "LONG-NAME-END" in text, "Detailed PDF lost later rows or a long name"
        assert "₱1,500.00" in text and "Simulated wallet credit" in text, "Missing money or assistance evidence"
    if name == "audit-logs":
        for expected in ["AUDIT-DETAIL-END", "[REDACTED]", "REPORT_SNAPSHOT_GENERATED", "27"]:
            assert expected in text, (name, expected)
        assert "UNAPPLIED_DRAFT" not in text, "Audit export used unapplied filters"
    if name == "physical-summary":
        assert "packs" in text and "RELEASE-LOG-38" in text, "Physical quantities or release evidence missing"
    if name == "empty-claims":
        assert "No records matched this coverage." in text, "Empty report lacks a meaningful state"
    if name in ["claims", "empty-claims"]:
        assert "Status totals cover all statuses within the date range" in " ".join(text.split()), "Filtered totals lack their status coverage explanation"
    xml_path = temporary / f"{name}.html"
    subprocess.run([tool("pdftotext"), "-bbox", "-enc", "UTF-8", str(path), str(xml_path)], check=True, capture_output=True)
    pages = ET.parse(xml_path).getroot().findall(".//{*}page")
    assert len(pages) == count
    for number, page in enumerate(pages, 1):
        width, height = float(page.attrib["width"]), float(page.attrib["height"])
        assert abs(min(width, height) - 595.28) < 2 and abs(max(width, height) - 841.89) < 2, (name, number, "not A4")
        words = page.findall(".//{*}word")
        assert len(words) > 12, (name, number, "blank page")
        for word in words:
            assert float(word.attrib["xMin"]) >= 30 and float(word.attrib["xMax"]) <= width - 30, (name, number, "horizontal clipping", word.text)
            assert float(word.attrib["yMin"]) >= 20 and float(word.attrib["yMax"]) <= height - 12, (name, number, "vertical clipping", word.text)
        contents = " ".join(word.text or "" for word in words)
        assert f"Page {number} of {count}" in contents, (name, number, "page number missing")
        if number > 1 and name in ["claims", "audit-logs", "schedules", "anomalies", "funds"]:
            assert any(label in contents for label in ["Executive summary", "Report explanations", "Recorded", "Slot / session", "Occurred", "Distribution"]), (name, number, "missing continuation context")
    subprocess.run([tool("pdftoppm"), "-r", "100", "-png", str(path), str(previews / name)], check=True, capture_output=True)
    checks.append({"name": name, "pages": count, "bytes": path.stat().st_size})
    print(f"PASS {name}: {count} A4 pages, selectable text, full records, clear coverage, page numbers and safe margins")

(output / "verification.json").write_text(json.dumps(checks, indent=2), encoding="utf-8")

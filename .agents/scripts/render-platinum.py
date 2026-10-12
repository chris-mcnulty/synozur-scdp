import fitz
from pathlib import Path
out = Path("/tmp/platinum-source")
out.mkdir(exist_ok=True)
doc = fitz.open("attached_assets/20260814SynozurChangeOrderNo1_1791821235593.pdf")
for i, page in enumerate(doc):
    page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5)).save(str(out / f"page-{i+1}.png"))
print(f"Rendered {len(doc)} pages to {out}")

import fitz
doc = fitz.open("attached_assets/20260814SynozurChangeOrderNo1_1786821893109.pdf")
print(f"Pages: {doc.page_count}")
for i, page in enumerate(doc):
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
    out = f".agents/outputs/co_page_{i+1}.png"
    pix.save(out)
    print(f"Saved {out}")
doc.close()

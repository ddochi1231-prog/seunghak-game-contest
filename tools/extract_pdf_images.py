"""'게임 안내' PDF 의 그림 10개를 web/img/gNN.png 로 뽑는다. (pip install pymupdf)
사용: python tools/extract_pdf_images.py
"""
import glob
from pathlib import Path
import pymupdf

ROOT = Path(__file__).resolve().parent.parent
pdf = glob.glob(str(ROOT / "*엔트리 게임 안내*.pdf"))[0]
out = ROOT / "web" / "img"
out.mkdir(parents=True, exist_ok=True)
d = pymupdf.open(pdf)
n = 0
for p in d:
    for inf in sorted(p.get_image_info(xrefs=True), key=lambda x: x["bbox"][1]):  # 위→아래 = 게임 번호 순
        n += 1
        info = d.extract_image(inf["xref"])
        pix = pymupdf.Pixmap(d.extract_image(inf["xref"])["image"])
        if pix.alpha or pix.n > 3:
            pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
        if info.get("smask"):  # 투명 배경 마스크를 합친다
            pix = pymupdf.Pixmap(pix, pymupdf.Pixmap(d, info["smask"]))
        pix.save(str(out / f"g{n:02d}.png"))
print("saved", n)

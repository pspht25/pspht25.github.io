#!/usr/bin/env python3
"""下载 Pyodide v0.29.2 运行时与科学包到 public/vendor/pyodide/v0.29.2/。

- 幂等：已存在且校验通过的文件直接跳过，可安全重跑
- 校验：科学包用官方 lock 的 sha256；核心文件用精确字节数
- 全部来自 jsdelivr 官方 Pyodide 发行版清单（17 个科学包 = numpy/scipy/pandas/
  matplotlib/sympy/pillow 及其依赖闭包）
"""
import hashlib
import json
import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

VERSION = "v0.29.2"
BASE = f"https://cdn.jsdelivr.net/pyodide/{VERSION}/full/"
DEST = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    "public", "vendor", "pyodide", VERSION)

# 核心运行时（size 精确校验）
CORE = [
    {"file": "pyodide.js", "size": 18597},
    {"file": "pyodide.asm.js", "size": 1074322},
    {"file": "pyodide.asm.wasm", "size": 8647684},
    {"file": "python_stdlib.zip", "size": 2423988},
    {"file": "pyodide-lock.json", "size": 120010},
]

# 科学包闭包（sha256 校验，来自 pyodide-lock.json 官方值）
PACKAGES = [
    ("numpy", "numpy-2.2.5-cp313-cp313-pyodide_2025_0_wasm32.whl", "6eaab6a7bb658d71ebe702911a3deab715323642462eb41b65565ca6a7cc23f1"),
    ("scipy", "scipy-1.14.1-cp313-cp313-pyodide_2025_0_wasm32.whl", "96fbc718e81cf54ac7df7d8a2c24e370fa3c45086e917c3d58752207d85d21af"),
    ("libopenblas", "libopenblas-0.3.26.zip", "f8f5db65c9367ed7f057d0ee853d94ddb3c007968aa8138253461dad42537fa2"),
    ("pandas", "pandas-2.3.3-cp313-cp313-pyodide_2025_0_wasm32.whl", "5b1c0acfc8555be16057e8609e9eb7f279037c2469032bcc23e2a691380a50ae"),
    ("python-dateutil", "python_dateutil-2.9.0.post0-py2.py3-none-any.whl", "ddca13fc1046572701872b9517622b57f847c77eea4bf9fdc995256e6c82beaf"),
    ("six", "six-1.17.0-py2.py3-none-any.whl", "1f715fc699e802b31e53290ead6c16a4d6a8da462a225d2e06097fce45ab70b9"),
    ("pytz", "pytz-2025.2-py2.py3-none-any.whl", "5a9c9286f6c03a4d16ee4ced15d511097568e1e41329d3499b597ecd7f1d317e"),
    ("matplotlib", "matplotlib-3.8.4-cp313-cp313-pyodide_2025_0_wasm32.whl", "65f657efbb717a6aa7ccd10c0729a0e6993c1da757bd68601d97a2905362e8d4"),
    ("contourpy", "contourpy-1.3.1-cp313-cp313-pyodide_2025_0_wasm32.whl", "bfb8aebbd6fe129eb04b9339eacc593f3ff31c9f3fe6067d48c59bf579269a94"),
    ("cycler", "cycler-0.12.1-py3-none-any.whl", "a140384709bfc674001fbd3b1e32a3bf8b531c0413d02f98badbd2d8ecc924c1"),
    ("fonttools", "fonttools-4.56.0-py3-none-any.whl", "9d6518c8ad4d88019bc72045108eca154301014215222408aa047cf4955c726d"),
    ("kiwisolver", "kiwisolver-1.4.8-cp313-cp313-pyodide_2025_0_wasm32.whl", "74fef16f229c3280f386ace367f36ac5ad8597ebabef45c6cf8bc2fa8aa3be70"),
    ("packaging", "packaging-24.2-py3-none-any.whl", "c18cde5592cc3d1823e9cc3a9a4fb436b02c15e3f8d7f5f69962f77b1b109da1"),
    ("pillow", "pillow-11.3.0-cp313-cp313-pyodide_2025_0_wasm32.whl", "7e1168616481f685f277d7fad1d197f3a625540542a2cd292cdc8958ab083d6e"),
    ("pyparsing", "pyparsing-3.2.1-py3-none-any.whl", "8f314b856e7e87cb3a426ce4db341308199157f6a757256e215e4d418e216d86"),
    ("sympy", "sympy-1.13.3-py3-none-any.whl", "56d438f823c08b2a08231400dcf1f640374192d7b1df0f55c4171bd708227b5f"),
    ("mpmath", "mpmath-1.3.0-py3-none-any.whl", "75c33edefd4b92311926ddbfa7aac6731a61b3b5ac0562bc8f8d420e23328d46"),
]


def fetch(url, tries=5):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "xinyu-blog-vendor/1.0"})
            return urllib.request.urlopen(req, timeout=180).read()
        except Exception as e:  # noqa: BLE001
            last = e
            import time
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"download failed after {tries} tries: {url} ({last})")


def check(path, data, sha256=None, size=None):
    if size is not None and len(data) != size:
        return f"size mismatch: got {len(data)}, want {size}"
    if sha256:
        h = hashlib.sha256(data).hexdigest()
        if h != sha256:
            return f"sha256 mismatch: got {h[:16]}..., want {sha256[:16]}..."
    return None


def do_one(item):
    """item = (dest_dir, filename, sha256, size) -> (filename, status, note)"""
    dest_dir, fn, sha256, size = item
    path = os.path.join(dest_dir, fn)
    if os.path.exists(path):
        data = open(path, "rb").read()
        err = check(path, data, sha256, size)
        if err is None:
            return (fn, "skip", "already ok")
        os.remove(path)
    data = fetch(BASE + fn)
    err = check(path, data, sha256, size)
    if err is not None:
        return (fn, "FAIL", err)
    tmp = path + ".tmp"
    open(tmp, "wb").write(data)
    os.replace(tmp, path)
    return (fn, "ok", f"{len(data)/1e6:.2f} MB")


def main():
    os.makedirs(DEST, exist_ok=True)
    jobs = [(DEST, c["file"], None, c["size"]) for c in CORE]
    jobs += [(DEST, fn, sha, None) for _, fn, sha in PACKAGES]
    print(f"Pyodide {VERSION} -> {DEST}")
    print(f"{len(jobs)} files, fetching with 8 threads ...")
    fails = []
    with ThreadPoolExecutor(max_workers=8) as ex:
        for fn, status, note in ex.map(do_one, jobs):
            mark = {"ok": "+", "skip": "=", "FAIL": "!"}[status]
            print(f"  [{mark}] {fn:<62} {note}")
            if status == "FAIL":
                fails.append((fn, note))
    if fails:
        print(f"\nFAILED {len(fails)} files:")
        for fn, note in fails:
            print(f"  - {fn}: {note}")
        sys.exit(1)
    total = sum(os.path.getsize(os.path.join(DEST, f)) for f in os.listdir(DEST))
    print(f"\nAll {len(jobs)} files verified. Total {total/1e6:.1f} MB in {DEST}")


if __name__ == "__main__":
    main()

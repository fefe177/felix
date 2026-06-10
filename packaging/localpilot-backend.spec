# PyInstaller spec for the bundled LocalPilot backend.
#
# Builds a self-contained `localpilot-backend` (onedir) that runs the control
# server without a separate Python install. Used by the Windows CI to ship the
# backend inside the desktop installer.
#
# Build:  pyinstaller --noconfirm packaging/localpilot-backend.spec \
#                      --distpath packaging/dist --workpath packaging/build
#
# `SPECPATH` is provided by PyInstaller (the directory of this spec file).

import os

from PyInstaller.utils.hooks import collect_all, collect_submodules

repo_root = os.path.abspath(os.path.join(SPECPATH, os.pardir))

# Data files the package reads at runtime (not auto-collected by PyInstaller).
datas = [
    (
        os.path.join(repo_root, "src", "localpilot", "memory", "schema.sql"),
        os.path.join("localpilot", "memory"),
    ),
    (os.path.join(repo_root, "config", "default.yaml"), "config"),
]
binaries = []
hiddenimports = collect_submodules("uvicorn") + collect_submodules("localpilot")

# Heavy packages whose data/binaries must be collected explicitly. Wrapped so a
# missing optional package does not break the build.
for package in ("playwright", "mss", "rapidocr_onnxruntime", "onnxruntime", "numpy"):
    try:
        pkg_datas, pkg_binaries, pkg_hidden = collect_all(package)
    except Exception:
        continue
    datas += pkg_datas
    binaries += pkg_binaries
    hiddenimports += pkg_hidden

analysis = Analysis(
    [os.path.join(SPECPATH, "backend_entry.py")],
    pathex=[os.path.join(repo_root, "src")],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(analysis.pure)

exe = EXE(
    pyz,
    analysis.scripts,
    [],
    exclude_binaries=True,
    name="localpilot-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
)

collect = COLLECT(
    exe,
    analysis.binaries,
    analysis.datas,
    strip=False,
    upx=False,
    name="localpilot-backend",
)

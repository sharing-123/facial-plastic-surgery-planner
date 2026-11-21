# Facial Plastic Surgery Planner

A Python toolkit for calibrated wound geometry, numbered suture guides and
reconstructive marking research. Use it from notebooks, web services or other
Python projects. The default installation needs only NumPy and works offline.

This is research software, not a validated medical device. Geometric consistency
does not establish clinical accuracy or the suitability of a closure technique.
A photograph cannot establish wound depth, vascularity, contamination or nerve injury.

## Installation

```bash
python -m pip install facial-plastic-surgery-planner
```

Optional image processing and bioinformatics dependencies are separate:

```bash
python -m pip install "facial-plastic-surgery-planner[vision,bioinformatics]"
```

Python 3.10 or newer is required. Model weights, photographs, external gene
libraries and the browser application are not included in the distribution.

## Calibrated measurements

```python
from facial_plastic_surgery_planner import measure_wound

report = measure_wound(
    points_px=[[100, 400], [180, 400]],
    pixels_per_mm=8.0,
    rstl_degrees=90.0,
    region="cheek",
)
assert report["length_mm"] == 10.0
assert report["mean_angle_to_rstl_deg"] == 90.0
```

Image points use x right and y down. The supplied skin tension line direction
uses x right and y up, measured in degrees modulo 180. Calibration must be
measured independently. This API does not infer an absolute scale from an image.
The returned dictionary includes length, chord, tortuosity, alignment and
elliptical excision geometry. Invalid or degenerate inputs raise `ValueError`.

## Drawing coordinates for other applications

```python
import json
from facial_plastic_surgery_planner import create_markings, to_jsonable

marks = create_markings([[0, 0], [28, 0]], spacing_mm=4, bite_mm=3)
assert len(marks["sutures"]) == 7
payload = json.dumps(to_jsonable(marks), allow_nan=False)
```

Marking points are millimetres with y up. Each suture has an index, placement
order, centre and two bite coordinates. W-plasty and serial Z-plasty candidates
are returned as arrays. Transform these coordinates into your own canvas or
image frame before drawing. The default dimensions are configurable research
parameters, not treatment instructions. Algorithms do not model tissue mechanics.

## Command line

Create `wound.json`:

```json
{"points_px": [[100, 400], [180, 400]], "pixels_per_mm": 8, "rstl_degrees": 90}
```

```bash
facial-planner wound.json --output measurements.json
```

The CLI reads and writes local JSON only. Missing fields and invalid input
produce an error message and exit code 2.

## Advanced research modules

The original implementations are available under the package namespace:

* `markings` provides W-plasty, serial Z-plasty and broken-line geometry.
* `surgical_planner.plan(report, context)` exposes the existing clinical rule
  engine. Its context codes and narrative output retain the original Indonesian
  schema for compatibility. The stable measurement and drawing APIs above use
  English keys. Do not assume that the rule engine outputs are clinically validated.
* `wound_planner`, `face_zones`, `quality_gate`, `sam_segment` and `wound_segment`
  provide optional image workflows. Install the `vision` extra and supply model
  paths explicitly. Image workflows require appropriate calibration and quality checks.
* `bioinfo.enrichment.ora(genes, library, background=...)` accepts a caller-supplied
  mapping of pathway names to gene sets. Install the `bioinformatics` extra.
  `load_library(path)` needs an explicit GMT file because third-party datasets
  are not bundled. Clinical coding snapshots likewise must be supplied separately.
* `surgeon_compare` provides research agreement metrics.

The standalone local application and model download helpers remain in the
[GitHub repository](https://github.com/sharing-123/facial-plastic-surgery-planner).

## Development and verification

```bash
python -m pip install build twine
python -m build
python -m pip install --force-reinstall dist/facial_plastic_surgery_planner-0.1.0-py3-none-any.whl
python -m pip install pytest
python -m pytest tests
python -m twine check dist/*
```

Build and install a wheel when developing. The build converts the original
standalone modules to relative imports and extracts unchanged analytic geometry
into a lightweight module. Editable installation is not supported by this build.
The source distribution includes these original modules and the build recipe.
No image models, photographs, credentials or external datasets are packaged.

The package tests cover known analytic lengths, calibration, marking coordinates,
invalid inputs, JSON conversion and the existing clinical rule regressions.
They assess implementation behaviour, not agreement with surgeons or patient outcomes.

## License and citation

Original project code is available under the MIT License. Third-party software,
models and data retain their own terms, described in `NOTICE.md`.

Muhammad Allam Rafi and Cindy Rizky Afrilia. Quantitative Marking and Suture
Planning for Facial Wounds and Scars from Single Photographs: A Bioinformatic
and Deep Learning Study (2026).

* [OSF registration](https://doi.org/10.17605/OSF.IO/ESW47)
* [Zenodo archive](https://doi.org/10.5281/zenodo.24412867)

The identifiers document the research record. They do not certify clinical
performance, regulatory approval or the correctness of package outputs.

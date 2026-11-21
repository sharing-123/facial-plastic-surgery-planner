"""Validated, model-free public APIs for research integrations."""
import math
import numpy as np


def _positive(value, name):
    value = float(value)
    if not math.isfinite(value) or value <= 0:
        raise ValueError(f'{name} must be finite and greater than zero')
    return value


def _points(points):
    q = np.asarray(points, dtype=float)
    if q.ndim != 2 or q.shape[1] != 2 or len(q) < 2 or not np.isfinite(q).all():
        raise ValueError('points must be a finite (N, 2) array with N >= 2')
    if np.any(np.linalg.norm(np.diff(q, axis=0), axis=1) <= 1e-9):
        raise ValueError('consecutive points must be distinct')
    if np.linalg.norm(q[-1] - q[0]) <= 1e-9:
        raise ValueError('endpoints must be distinct for an open wound centre line')
    return q


def measure_wound(points_px, pixels_per_mm, rstl_degrees, region='cheek'):
    """Measure an open polyline in image coordinates (x right, y down).

    Calibration is supplied by the caller. RSTL is in degrees in Cartesian
    coordinates (x right, y up), modulo 180. Returns a JSON-compatible dict.
    No face detector, remote request, model weights or patient upload is used.
    """
    from .surgical_planner import geometry_noface
    points = _points(points_px)
    scale = _positive(pixels_per_mm, 'pixels_per_mm')
    angle = float(rstl_degrees)
    if not math.isfinite(angle):
        raise ValueError('rstl_degrees must be finite')
    if not isinstance(region, str) or not region.strip():
        raise ValueError('region must be a nonempty string')
    return geometry_noface(points, scale, angle % 180, region)


def create_markings(points_mm, spacing_mm=4.0, bite_mm=3.0, z_angle=60):
    """Return suture, W-plasty and serial Z-plasty drawing coordinates.

    Points are millimetres in Cartesian coordinates (x right, y up).
    Coordinates are NumPy arrays. Use ``to_jsonable`` for web/API storage.
    These geometric candidates do not determine clinical suitability.
    """
    from . import markings
    points = _points(points_mm)
    spacing = _positive(spacing_mm, 'spacing_mm')
    bite = _positive(bite_mm, 'bite_mm')
    if z_angle not in (30, 45, 60):
        raise ValueError('z_angle must be 30, 45 or 60 degrees')
    if np.linalg.norm(np.diff(points, axis=0), axis=1).sum() / spacing > 10000:
        raise ValueError('spacing would create more than 10000 sutures')
    return {'sutures': markings.suture_guide(points, spacing, bite),
            'w_plasty': markings.w_plasty(points),
            'z_plasty': markings.z_plasty_series(points, z_angle)}


def to_jsonable(value):
    """Convert nested NumPy outputs to JSON-compatible Python containers."""
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, dict):
        return {key: to_jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [to_jsonable(item) for item in value]
    return value

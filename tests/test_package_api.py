import json
import numpy as np
import pytest
from facial_plastic_surgery_planner import measure_wound, create_markings, to_jsonable


def test_known_geometry():
    result = measure_wound([[100, 400], [180, 400]], 8, 90)
    assert result['length_mm'] == 10
    assert result['mean_angle_to_rstl_deg'] == 90
    assert result['elliptical_excision']['length_to_width'] == 3.5


def test_scale_and_direction():
    a = measure_wound([[0, 0], [30, 40]], 5, 0)
    b = measure_wound([[0, 0], [60, 80]], 10, 180)
    assert a == b
    assert a['length_mm'] == 10


def test_marks_and_json():
    marks = create_markings([[0, 0], [28, 0]])
    assert len(marks['sutures']) == 7
    assert sorted(s['order'] for s in marks['sutures']) == list(range(1, 8))
    for s in marks['sutures']:
        assert np.linalg.norm(s['a'] - s['b']) == pytest.approx(6)
    assert len(json.loads(json.dumps(to_jsonable(marks)))['sutures']) == 7


@pytest.mark.parametrize('points', [[], [[0, 0]], [[0, 0], [0, 0]], [[0, 0], [float('nan'), 1]], [[0, 0, 0], [1, 1, 1]]])
def test_invalid_points(points):
    with pytest.raises(ValueError):
        measure_wound(points, 1, 0)
    with pytest.raises(ValueError):
        create_markings(points)


@pytest.mark.parametrize('scale', [0, -1, float('inf'), float('nan')])
def test_invalid_calibration(scale):
    with pytest.raises(ValueError):
        measure_wound([[0, 0], [10, 0]], scale, 0)


def test_invalid_parameters():
    with pytest.raises(ValueError):
        create_markings([[0, 0], [10, 0]], spacing_mm=0)
    with pytest.raises(ValueError):
        create_markings([[0, 0], [10, 0]], z_angle=0)
    with pytest.raises(ValueError):
        measure_wound([[0, 0], [10, 0]], 1, float('inf'))

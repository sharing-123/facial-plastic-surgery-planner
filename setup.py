"""Build namespaced copies of the original, tested research modules.

The standalone application keeps its existing imports. The distribution uses
relative imports, without modifying sys.path or claiming generic module names.
"""
import ast
import re
from pathlib import Path
from setuptools import setup
from setuptools.command.build_py import build_py

MODULES = ['markings', 'surgical_planner', 'wound_planner', 'face_proportions',
           'smile_symmetry', 'face_zones', 'quality_gate', 'sam_segment',
           'wound_segment', 'surgeon_compare']

class BuildPackage(build_py):
    def run(self):
        super().run()
        target = Path(self.build_lib) / 'facial_plastic_surgery_planner'
        for name in MODULES:
            source = Path(name + '.py').read_text(encoding='utf-8')
            for dependency in MODULES:
                replacement = 'geometry' if dependency == 'wound_planner' and name in ('markings', 'surgical_planner') else dependency
                source = re.sub(r'(?m)^(\s*)import ' + dependency + r'( as \w+)?\s*$',
                                lambda m: m[1] + 'from . import ' + replacement + (m[2] or (' as ' + dependency if replacement != dependency else '')), source)
                source = re.sub(r'(?m)^(\s*)from ' + dependency + r' import ', r'\1from .' + dependency + ' import ', source)
            (target / (name + '.py')).write_text(source, encoding='utf-8')
        original = Path('wound_planner.py').read_text(encoding='utf-8')
        tree = ast.parse(original)
        names = {'_diff', 'ellipse_for', 'ellipse_points', 'z_plasty'}
        functions = [ast.get_source_segment(original, n) for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names]
        geometry = '"""Original analytic geometry, independent of image/model libraries."""\nimport math\nimport numpy as np\nELLIPSE_LW_RATIO = 3.5\nZ_GAIN = {30: 25, 45: 50, 60: 75}\nFAV, UNFAV = 30.0, 60.0\n\n' + '\n\n'.join(functions)
        (target / 'geometry.py').write_text(geometry, encoding='utf-8')
        bio = target / 'bioinfo'; bio.mkdir(exist_ok=True)
        for file in Path('bioinfo').glob('*.py'):
            (bio / file.name).write_bytes(file.read_bytes())
        # Data are deliberately not bundled. Callers provide an explicit library.

setup(cmdclass={'build_py': BuildPackage})

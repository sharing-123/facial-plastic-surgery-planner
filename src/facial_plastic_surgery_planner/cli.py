"""JSON command-line interface for calibrated wound geometry."""
import argparse
import json
from pathlib import Path
from .api import measure_wound


def main():
    parser = argparse.ArgumentParser(description='Measure a wound polyline for research. No clinical validation is implied.')
    parser.add_argument('input', type=Path, help='JSON file containing points_px, pixels_per_mm and rstl_degrees')
    parser.add_argument('--output', type=Path, help='Write JSON here instead of standard output')
    args = parser.parse_args()
    try:
        data = json.loads(args.input.read_text(encoding='utf-8'))
        result = measure_wound(data['points_px'], data['pixels_per_mm'], data['rstl_degrees'], data.get('region', 'cheek'))
        text = json.dumps(result, indent=2, allow_nan=False)
        if args.output:
            args.output.write_text(text + '\n', encoding='utf-8')
        else:
            print(text)
    except (OSError, ValueError, KeyError, TypeError) as exc:
        parser.exit(2, f'Error: {exc}\n')


if __name__ == '__main__':
    main()

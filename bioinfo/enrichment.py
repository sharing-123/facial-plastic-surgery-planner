"""Over-representation analysis (ORA) of a gene list against pathway gene sets, with Benjamini-Hochberg FDR.

Typical use in this project: a research user pastes the differentially expressed genes of scar tissue (for example keloid
versus normal skin) and asks which Reactome pathways are enriched.

Method: one-sided hypergeometric test (Fisher's exact, greater) per gene set; universe = all genes present in the library (or a
user-supplied background); sets smaller than min_size or larger than max_size are skipped; p-values are adjusted by
Benjamini-Hochberg across the tested sets. Symbols not found in the universe are reported, not silently dropped.

Empirical null behaviour on random gene lists drawn from this library (measured 2026-11-20, 300 draws each, FDR <= 0.05): lists with at least
one 'significant' set: 0.7% for 25 genes, 0.3% for 100 genes (the procedure is conservative). Positive control: a keloid/fibrosis signature
recovers extracellular matrix organization and collagen pathways (FDR < 1e-6). See test_bioinfo.py.
Every eligible set (by size) enters the Benjamini-Hochberg family, including sets with no overlap. The min_overlap argument only filters
the DISPLAYED table after correction. (Filtering sets by observed overlap BEFORE correction was tried and inflated the false-positive
rate to 53% on random lists: do not do that.)

LIMITS: ORA ignores effect sizes and gene dependence, is sensitive to the background, and says nothing about causation or about an
individual patient. It is a hypothesis generator for research, not a clinical test."""
from pathlib import Path

import numpy as np
from scipy.stats import hypergeom

DATA = Path(__file__).parent / "data"
ALIASES = {"CTGF": "CCN2", "CYR61": "CCN1", "NOV": "CCN3"}          # symbols renamed by HGNC; extend as needed


def load_library(path=None):
    """Enrichr gene set text format: term, blank, then gene symbols, tab separated. Returns {term: set(genes)}."""
    p = Path(path) if path else DATA / "Reactome_2022.gmt.tsv"
    lib = {}
    for line in p.read_text(encoding="utf-8").splitlines():
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        genes = {g.strip().upper() for g in parts[2:] if g.strip()}
        if genes:
            lib[parts[0]] = genes
    return lib


def bh_fdr(p):
    """Benjamini-Hochberg adjusted p-values (monotone, capped at 1)."""
    p = np.asarray(p, float)
    n = len(p)
    order = np.argsort(p)
    ranked = p[order] * n / (np.arange(n) + 1)
    adj = np.minimum.accumulate(ranked[::-1])[::-1]
    out = np.empty(n)
    out[order] = np.minimum(adj, 1.0)
    return out


def ora(genes, library, background=None, min_size=5, max_size=500, fdr_alpha=0.05, min_overlap=3):
    """genes: iterable of symbols. Returns dict with a ranked table and bookkeeping."""
    query = {ALIASES.get(g.strip().upper(), g.strip().upper()) for g in genes if g and g.strip()}
    universe = {g.upper() for g in background} if background is not None else set().union(*library.values())
    known = query & universe
    unknown = sorted(query - universe)
    N, n = len(universe), len(known)
    rows = []
    if n == 0:
        return {"table": [], "n_query": len(query), "n_in_universe": 0, "unknown_symbols": unknown, "universe_size": N}
    for term, members in library.items():                      # EVERY eligible set is tested; the BH family is all of them
        m = members & universe
        if not (min_size <= len(m) <= max_size):
            continue
        k = len(known & m)
        p = float(hypergeom.sf(k - 1, N, len(m), n)) if k > 0 else 1.0                  # P(X >= k)
        odds = (k / max(n - k, 1)) / (max(len(m) - k, 1) / max(N - len(m) - (n - k), 1))
        rows.append({"term": term, "overlap": k, "set_size": len(m), "p_value": p, "odds_ratio": round(odds, 2), "genes": sorted(known & m)})
    if rows:
        q = bh_fdr([r["p_value"] for r in rows])
        for r, qq in zip(rows, q):
            r["fdr"] = float(qq)
        # display filter AFTER correction: filtering before it on observed overlap would inflate false positives
        rows = [r for r in rows if r["overlap"] >= min_overlap]
        rows.sort(key=lambda r: (r["fdr"], r["p_value"]))
    return {"table": rows, "n_query": len(query), "n_in_universe": n, "unknown_symbols": unknown, "universe_size": N,
            "significant": [r["term"] for r in rows if r["fdr"] <= fdr_alpha], "caveat": "hypothesis generator for research; not a clinical test"}

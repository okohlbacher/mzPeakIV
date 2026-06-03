# Test Data Fixtures

These fixtures are vendored from the upstream `mzpeakts` demo data and used by
unit tests.  They are committed to the repository so tests run offline and
reproducibly without network access.

## Fixture Inventory

| File | Source | Layout | DATA Requirement | Coverage |
|------|--------|--------|-----------------|----------|
| `small.mzpeak` | `HUPO-PSI/mzpeakts` demo (vendored in 01-01) | Point | DATA-01 (point layout) | Point reconstruction: m/z Float64Array, intensity Float32Array, ascending m/z, nonzero signal |
| `small.chunked.mzpeak` | `HUPO-PSI/mzpeakts` demo (vendored in 01-01) | Chunked + delta (MS:1003089) | DATA-01 (chunked/delta layout) | Chunked reconstruction: same invariants as point; cross-compared against point to prove delta-decode correctness |

## DATA-01 Coverage

`src/reader/arrays.test.ts` tests both fixtures:
- Point layout: `small.mzpeak` — verifies `getSpectrumArrays` returns the
  correct types, ascending m/z, and nonzero signal.
- Chunked/delta layout: `small.chunked.mzpeak` — same invariants, plus a
  cross-check against the point file to prove the delta-decode is correct
  (seed excluded from chunk values, null=0 handled by `nullToZero` in the
  vendored reader).

## DATA-02 Coverage

No binary Numpress fixtures exist in this directory.  The capability tests in
`src/reader/capability.test.ts` use synthetic mock readers that simulate
Numpress (`MS:1002312`), auxiliary arrays, and directory storage manifests —
this avoids shipping a Numpress-encoded binary fixture and still exercises the
detection + fail-loud path with precise control.

## Adding New Fixtures

When adding a new fixture:
1. Record its source (URL or converter command) here.
2. State which DATA/LOAD requirement it covers.
3. Keep file sizes small (< 1 MB if possible) to keep CI fast.

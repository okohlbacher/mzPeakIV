import { useStore } from "../state/store";

function MetaGroup({ title, value }: { title: string; value: unknown }) {
  const isEmpty =
    value === null ||
    value === undefined ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === "object" && Object.keys(value as object).length === 0);
  return (
    <details open={!isEmpty}>
      <summary>
        <strong>{title}</strong>
        {isEmpty ? " (none)" : ""}
      </summary>
      {!isEmpty && (
        <pre
          style={{
            maxHeight: 200,
            overflow: "auto",
            background: "#f6f6f6",
            padding: "0.5rem",
            fontSize: "0.75rem",
          }}
        >
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </details>
  );
}

/**
 * Left-hand panel: the parsed manifest entity list (FMT-01) and all five
 * file-level metadata groups (FMT-02).
 */
export function MetadataPanel() {
  const fileMeta = useStore((s) => s.fileMeta);
  const manifest = useStore((s) => s.manifest);
  const stats = useStore((s) => s.stats);

  return (
    <section
      aria-label="metadata-panel"
      style={{
        padding: "0.5rem",
      }}
    >
      <h2>File</h2>
      {stats && (
        <p data-testid="file-stats">
          {stats.numSpectra} spectra · {stats.numEntities} entities
        </p>
      )}

      <h3>Manifest</h3>
      <table
        data-testid="manifest-table"
        style={{ width: "100%", fontSize: "0.8rem", borderCollapse: "collapse" }}
      >
        <thead>
          <tr style={{ textAlign: "left" }}>
            <th>name</th>
            <th>entity</th>
            <th>kind</th>
          </tr>
        </thead>
        <tbody>
          {manifest.map((e) => (
            <tr key={e.name} data-testid="manifest-row">
              <td>{e.name}</td>
              <td>{e.entityType}</td>
              <td>{e.dataKind}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Metadata</h3>
      {fileMeta && (
        <div data-testid="file-metadata">
          <MetaGroup title="File description" value={fileMeta.fileDescription} />
          <MetaGroup
            title="Instrument configurations"
            value={fileMeta.instrumentConfigurations}
          />
          <MetaGroup title="Software" value={fileMeta.software} />
          <MetaGroup title="Run" value={fileMeta.run} />
          <MetaGroup title="Samples" value={fileMeta.samples} />
        </div>
      )}
    </section>
  );
}

import { useStore } from "../state/store";

/**
 * Capabilities/layout readout: storage layout, encodings present, and the
 * imaging-detected boolean (isImaging — probe only, no reconstruction here).
 */
export function CapabilitiesPanel() {
  const capabilities = useStore((s) => s.capabilities);

  if (!capabilities) return null;

  const { layout, encodings, isImaging, unsupported } = capabilities;

  return (
    <section
      aria-label="capabilities-panel"
      data-testid="capabilities-panel"
      style={{
        padding: "0.5rem",
        borderTop: "1px solid #eee",
      }}
    >
      <h3 style={{ margin: "0 0 0.4rem" }}>Capabilities</h3>

      <table
        data-testid="capabilities-table"
        style={{ fontSize: "0.8rem", borderCollapse: "collapse", width: "100%" }}
      >
        <tbody>
          <tr>
            <th
              style={{ textAlign: "left", paddingRight: "0.75rem", fontWeight: 600 }}
            >
              Layout
            </th>
            <td data-testid="cap-layout">{layout}</td>
          </tr>
          <tr>
            <th style={{ textAlign: "left", paddingRight: "0.75rem", fontWeight: 600 }}>
              Encodings
            </th>
            <td data-testid="cap-encodings">
              {encodings.length > 0 ? (
                <ul
                  style={{ margin: 0, padding: "0 0 0 1rem" }}
                >
                  {encodings.map((enc) => (
                    <li key={enc}>{enc}</li>
                  ))}
                </ul>
              ) : (
                <span style={{ color: "#888", fontStyle: "italic" }}>none detected</span>
              )}
            </td>
          </tr>
          <tr>
            <th style={{ textAlign: "left", paddingRight: "0.75rem", fontWeight: 600 }}>
              Imaging data
            </th>
            <td data-testid="cap-is-imaging">
              {isImaging ? (
                <span
                  data-testid="imaging-detected-yes"
                  style={{ color: "#1b5e20", fontWeight: 600 }}
                >
                  Imaging data detected: yes
                </span>
              ) : (
                <span
                  data-testid="imaging-detected-no"
                  style={{ color: "#888" }}
                >
                  Imaging data detected: no
                </span>
              )}
            </td>
          </tr>
          {unsupported.length > 0 && (
            <tr>
              <th
                style={{
                  textAlign: "left",
                  paddingRight: "0.75rem",
                  fontWeight: 600,
                  color: "#b71c1c",
                }}
              >
                Unsupported
              </th>
              <td data-testid="cap-unsupported">
                <ul style={{ margin: 0, padding: "0 0 0 1rem", color: "#b71c1c" }}>
                  {unsupported.map((u) => (
                    <li key={u.code} title={u.code}>
                      {u.label}
                    </li>
                  ))}
                </ul>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

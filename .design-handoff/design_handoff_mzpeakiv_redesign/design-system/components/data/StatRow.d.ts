import { ReactNode } from "react";

/**
 * Key/value row for the inspector. Value renders in mono tabular numerals.
 *
 * @startingPoint section="Data" subtitle="Key / value inspector row" viewport="700x180"
 */
export interface StatRowProps {
  label: ReactNode;
  /** Value; falls back to an em-dash when null/undefined. */
  value?: ReactNode;
  className?: string;
}

export function StatRow(props: StatRowProps): JSX.Element;

import { ReactNode } from "react";

/**
 * Collapsible titled section for the inspector rail.
 *
 * @startingPoint section="Data" subtitle="Collapsible inspector section" viewport="700x240"
 */
export interface PanelProps {
  title: ReactNode;
  /** Optional trailing count chip. */
  count?: ReactNode;
  /** @default true */
  defaultOpen?: boolean;
  /** Controlled open state (pair with onToggle). */
  open?: boolean;
  onToggle?: (open: boolean) => void;
  className?: string;
  children?: ReactNode;
}

export function Panel(props: PanelProps): JSX.Element;

import { ReactNode } from "react";

/**
 * Compact status / metadata pill.
 *
 * @startingPoint section="Data" subtitle="Status & metadata pills" viewport="700x150"
 */
export interface BadgeProps {
  /** @default "neutral" */
  tone?: "neutral" | "accent" | "info" | "success" | "warning" | "danger";
  /** Show a leading status dot. */
  dot?: boolean;
  /** Render the label in monospace (for counts / values). */
  mono?: boolean;
  className?: string;
  children?: ReactNode;
}

export function Badge(props: BadgeProps): JSX.Element;

import { ReactNode } from "react";

/**
 * Connected tab/toggle group for view, colormap and scale switching.
 *
 * @startingPoint section="Controls" subtitle="Connected tab / toggle group" viewport="700x160"
 */
export interface SegmentedControlProps {
  options: SegmentOption[];
  /** Currently selected option value. */
  value: string;
  onChange?: (value: string) => void;
  /** @default "md" */
  size?: "sm" | "md";
  ariaLabel?: string;
  className?: string;
}

export interface SegmentOption {
  value: string;
  label?: string;
  icon?: ReactNode;
}

export function SegmentedControl(props: SegmentedControlProps): JSX.Element;

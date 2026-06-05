/**
 * Styled native dropdown for compact option sets.
 *
 * @startingPoint section="Forms" subtitle="Styled native dropdown" viewport="700x140"
 */
export interface SelectProps {
  value: string;
  onChange?: (value: string, e?: unknown) => void;
  options: SelectOption[];
  /** @default "md" */
  size?: "sm" | "md";
  ariaLabel?: string;
  className?: string;
}

export interface SelectOption {
  value: string;
  label: string;
}

export function Select(props: SelectProps): JSX.Element;

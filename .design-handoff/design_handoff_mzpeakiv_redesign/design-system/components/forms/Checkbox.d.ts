/**
 * Compact labelled checkbox toggle.
 *
 * @startingPoint section="Forms" subtitle="Labelled checkbox toggle" viewport="700x120"
 */
export interface CheckboxProps {
  checked: boolean;
  onChange?: (checked: boolean, e?: unknown) => void;
  label?: string;
  className?: string;
  disabled?: boolean;
}

export function Checkbox(props: CheckboxProps): JSX.Element;

import { InputHTMLAttributes } from "react";

/**
 * Monospace numeric input with optional unit suffix (Da, µm, ppm).
 *
 * @startingPoint section="Forms" subtitle="Numeric input with unit suffix" viewport="700x140"
 */
export interface NumberFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "size"> {
  value: string | number;
  onChange?: (value: string, e?: unknown) => void;
  /** Unit chip rendered on the trailing edge, e.g. "Da". */
  unit?: string | null;
  /** @default "md" */
  size?: "sm" | "md";
  placeholder?: string;
  /** Explicit CSS width (e.g. "92px"). */
  width?: string | number;
  ariaLabel?: string;
}

export function NumberField(props: NumberFieldProps): JSX.Element;

import { ReactNode, ButtonHTMLAttributes } from "react";

/**
 * The primary action control for mzPeak interfaces.
 *
 * @startingPoint section="Controls" subtitle="Primary / secondary / ghost / danger button" viewport="700x220"
 */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual emphasis. @default "primary" */
  variant?: "primary" | "secondary" | "ghost" | "danger";
  /** @default "md" */
  size?: "sm" | "md";
  /** Icon node rendered before the label. */
  iconLeft?: ReactNode;
  /** Icon node rendered after the label. */
  iconRight?: ReactNode;
  /** Stretch to fill the container width. */
  block?: boolean;
  children?: ReactNode;
}

export function Button(props: ButtonProps): JSX.Element;

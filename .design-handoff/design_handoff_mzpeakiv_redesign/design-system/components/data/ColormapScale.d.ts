/**
 * The signature ion-image legend / scale bar. Renders a perceptually-uniform
 * colormap gradient with low/high ticks.
 *
 * @startingPoint section="Data" subtitle="Colormap legend / scale bar" viewport="700x150"
 */
export interface ColormapScaleProps {
  /** @default "viridis" */
  colormap?: "viridis" | "inferno" | "gray" | "basepeak";
  /** Low-end tick label. @default "0" */
  low?: string;
  /** High-end tick label. @default "max" */
  high?: string;
  /** @default "horizontal" */
  orientation?: "horizontal" | "vertical";
  /** Tune tick colour for placement on the dark data stage. */
  onStage?: boolean;
  className?: string;
}

export function ColormapScale(props: ColormapScaleProps): JSX.Element;

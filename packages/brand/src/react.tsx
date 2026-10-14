import type { SVGProps } from "react";
import { LOGO_PATHS, LOGO_VIEWBOX, MARK_PATH, MARK_VIEWBOX } from "./logo.js";

type LogoProps = Omit<SVGProps<SVGSVGElement>, "viewBox" | "children"> & {
  /** Accessible name. null hides it from screen readers (when a link or heading already says Startica). */
  title?: string | null;
};

function Svg({ viewBox, paths, title = "Startica", ...props }: LogoProps & { viewBox: string; paths: readonly string[] }) {
  const a11y = title ? { role: "img", "aria-label": title } : { "aria-hidden": true, focusable: false };
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={viewBox} fill="currentColor" {...a11y} {...props}>
      {title ? <title>{title}</title> : null}
      {paths.map((d) => (
        <path key={d.slice(0, 24)} d={d} />
      ))}
    </svg>
  );
}

/** The Startica wordmark in currentColor. Size it by height, e.g. className="h-5 w-auto". */
export function StarticaLogo(props: LogoProps) {
  return <Svg viewBox={LOGO_VIEWBOX} paths={LOGO_PATHS} {...props} />;
}

/** The "S" mark in currentColor, square. For icons and collapsed navigation. */
export function StarticaMark(props: LogoProps) {
  return <Svg viewBox={MARK_VIEWBOX} paths={[MARK_PATH]} {...props} />;
}

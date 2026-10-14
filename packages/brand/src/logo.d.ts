export declare const LOGO_PATHS: readonly string[];
export declare const LOGO_VIEWBOX: string;
export declare const LOGO_WIDTH: number;
export declare const LOGO_HEIGHT: number;
export declare const MARK_PATH: string;
export declare const MARK_VIEWBOX: string;

export interface LogoSvgOptions {
  /** Class for the <svg>; size it with a height and let the width follow. */
  className?: string;
  /** Accessible name. null hides the SVG from screen readers (use when a link or heading already names Startica). Default "Startica". */
  title?: string | null;
}

export declare function logoSvg(options?: LogoSvgOptions): string;
export declare function markSvg(options?: LogoSvgOptions): string;

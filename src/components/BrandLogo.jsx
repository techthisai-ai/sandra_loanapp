const sizeClass = {
  sm: "h-7 max-h-7",
  md: "h-9 max-h-9",
  lg: "h-11 max-h-11",
  /** Taller mark for dark sidebars — strong read on white backing */
  sidebar: "h-[52px] max-h-[52px] min-h-[52px]",
};

export default function BrandLogo({ variant = "md", className = "" }) {
  return (
    <img
      src="/branding/ruthra-logo.png"
      alt="Ruthra Financial Solutions"
      className={`block w-auto max-w-[min(240px,58vw)] object-contain object-left ${sizeClass[variant] ?? sizeClass.md} ${className}`}
      loading="lazy"
      decoding="async"
    />
  );
}

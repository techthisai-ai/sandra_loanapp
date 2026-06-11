const sizeClass = {
  sm: "h-7 max-h-7",
  md: "h-9 max-h-9",
  lg: "h-11 max-h-11",
  /** Taller mark for dark sidebars — strong read on white backing */
  sidebar: "h-[52px] max-h-[52px] min-h-[52px]",
  /** Full-screen app loading splash */
  splash: "h-20 max-h-20 min-h-20 sm:h-24 sm:max-h-24 sm:min-h-24",
};

export default function BrandLogo({ variant = "md", className = "", priority = false }) {
  return (
    <img
      src="/branding/ruthra-logo.png"
      alt="Ruthra Financial Solutions"
      className={`block w-auto max-w-[min(280px,72vw)] object-contain object-left ${sizeClass[variant] ?? sizeClass.md} ${className}`}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : undefined}
    />
  );
}

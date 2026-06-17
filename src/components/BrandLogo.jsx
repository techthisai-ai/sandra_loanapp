import { BRAND_LOGO_ALT, BRAND_LOGO_PATH } from "../constants/brand";

const sizeClass = {
  sm: "brand-logo--sm",
  md: "brand-logo--md",
  lg: "brand-logo--lg",
  auth: "brand-logo--auth",
  sidebar: "brand-logo--sidebar",
  splash: "brand-logo--splash",
};

/**
 * @param {"none" | "plaque"} frame
 *   plaque — white inset card for dark surfaces (sidebar); logo white background blends in.
 */
export default function BrandLogo({ variant = "md", frame = "none", className = "", priority = false }) {
  const image = (
    <img
      src={BRAND_LOGO_PATH}
      alt={BRAND_LOGO_ALT}
      className={`brand-logo ${sizeClass[variant] ?? sizeClass.md} ${className}`.trim()}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : undefined}
    />
  );

  if (frame === "plaque") {
    return <div className="brand-logo-plaque">{image}</div>;
  }

  return image;
}

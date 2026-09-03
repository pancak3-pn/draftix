import { useState } from "react";

const variants = {
  landing: { element: "nav", shell: "dr-nav", brand: "dr-brand", links: "dr-nav-links", menu: "dr-menu" },
  support: { element: "header", shell: "sp-header", brand: "sp-logo", links: "sp-nav-links", menu: "sp-menu" },
  entry: { element: "header", shell: "dx-entry-nav", brand: "dx-logo" },
  app: { element: "header", shell: "dx-appbar", brand: "dx-logo" },
};

export function AppBrand({ className = "", href = "/", onClick }) {
  return <a className={`site-brand ${className}`} href={href} onClick={onClick} aria-label="Draftix home">
    <img src="/images/draftix.png" alt="Draftix" />
  </a>;
}

export default function AppNav({ variant = "support", homeHref = "/", links = [], center = null, aside = null, actions = null }) {
  const [open, setOpen] = useState(false);
  const config = variants[variant] || variants.support;
  const Shell = config.element;
  const menuId = `site-nav-${variant}`;
  const close = () => setOpen(false);

  return <Shell className={`site-nav site-nav-${variant} ${config.shell}`} aria-label={variant === "landing" ? "Primary navigation" : undefined}>
    <AppBrand className={config.brand} href={homeHref} onClick={close} />
    {aside}
    {center && <div className="site-nav-center">{center}</div>}
    {links.length > 0 && <>
      <button className={`site-nav-menu ${config.menu || ""}`} type="button" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls={menuId} onClick={() => setOpen((value) => !value)}>
        <span /><span /><span /><b className="sr-only">Toggle navigation</b>
      </button>
      <div id={menuId} className={`site-nav-links ${config.links || ""} ${open ? "is-open" : ""}`} role={variant === "support" ? "navigation" : undefined} aria-label={variant === "support" ? "Page navigation" : undefined}>
        {links.map(({ label, ...link }) => <a {...link} key={`${link.href}-${label}`} onClick={close}>{label}</a>)}
      </div>
    </>}
    {actions && <div className={`site-nav-actions ${variant === "app" ? "dx-app-actions" : ""}`}>{actions}</div>}
  </Shell>;
}

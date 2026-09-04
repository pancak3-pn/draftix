import { useState } from "react";
import { ArrowRight, CaretDown } from "@phosphor-icons/react";

const variants = {
  landing: { element: "nav", shell: "dr-nav", brand: "dr-brand", links: "dr-nav-links", menu: "dr-menu" },
  public: { element: "header", shell: "public-nav", brand: "dr-brand", links: "dr-nav-links", menu: "dr-menu" },
  support: { element: "header", shell: "sp-header", brand: "sp-logo", links: "sp-nav-links", menu: "sp-menu" },
  entry: { element: "header", shell: "dx-entry-nav", brand: "dx-logo" },
  app: { element: "header", shell: "dx-appbar", brand: "dx-logo" },
};

export function AppBrand({ className = "", href = "/", onClick, horizontal = false }) {
  return <a className={`site-brand ${className}`} href={href} onClick={onClick} aria-label="Draftix home">
    <img
      src={horizontal ? "/images/web-app-manifest-512x512.png" : "/images/draftix.webp"}
      alt={horizontal ? "" : "Draftix"}
      width={horizontal ? 512 : 512}
      height={horizontal ? 512 : 341}
    />
    {horizontal && <strong aria-hidden="true">DRAFT<span>IX</span></strong>}
  </a>;
}

export default function AppNav({ variant = "support", homeHref = "/", links = [], center = null, aside = null, actions = null }) {
  const [open, setOpen] = useState(false);
  const config = variants[variant] || variants.support;
  const Shell = config.element;
  const menuId = `site-nav-${variant}`;
  const close = () => setOpen(false);

  const commandBar = variant === "landing" || variant === "public";

  return <Shell className={`site-nav site-nav-${variant} ${config.shell}`} aria-label={commandBar ? "Primary navigation" : undefined}>
    <AppBrand className={config.brand} href={homeHref} onClick={close} horizontal={commandBar} />
    {commandBar ? <span className="dr-nav-motto" aria-hidden="true">Play better<br />together</span> : null}
    {aside}
    {center && <div className="site-nav-center">{center}</div>}
    {links.length > 0 && <>
      <button className={`site-nav-menu ${config.menu || ""}`} type="button" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls={menuId} onClick={() => setOpen((value) => !value)}>
        <span /><span /><span /><b className="sr-only">Toggle navigation</b>
      </button>
      <div id={menuId} className={`site-nav-links ${config.links || ""} ${open ? "is-open" : ""}`} role={variant === "support" ? "navigation" : undefined} aria-label={variant === "support" ? "Page navigation" : undefined}>
        {links.map(({ label, children, ...link }) => children?.length
          ? <details className="nav-tools" key={`menu-${label}`}>
              <summary><span>{label}</span><CaretDown aria-hidden="true" weight="bold" /></summary>
              <div className="nav-tools-menu">
                {children.map((item) => <a href={item.href} key={item.href} onClick={close}>{item.label}</a>)}
              </div>
            </details>
          : <a {...link} key={`${link.href}-${label}`} onClick={close}>
              <span>{label}</span>
              {link.className?.includes("dr-nav-cta") && <ArrowRight aria-hidden="true" weight="bold" />}
            </a>)}
      </div>
    </>}
    {actions && <div className={`site-nav-actions ${variant === "app" ? "dx-app-actions" : ""}`}>{actions}</div>}
  </Shell>;
}

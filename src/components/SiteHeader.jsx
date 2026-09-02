import AppNav from "./AppNav.jsx";

const links = [
  { href: "/#product", label: "Product" },
  { href: "/#process", label: "How it works" },
  { href: "/team-balance", label: "Team balancer" },
  { href: "/app", label: "Open Draftix", className: "sp-open" },
];

export default function SiteHeader() {
  return <AppNav variant="support" links={links} />;
}

import AppNav from "./AppNav.jsx";

const primaryLinks = [
  { href: "/#process", label: "How it works" },
  { href: "/tournaments", label: "Tournaments" },
  { href: "/team-balance", label: "Team balancer" },
];

export default function SiteHeader({ draftEntry = false }) {
  const links = [
    ...primaryLinks,
    draftEntry
      ? { href: "/", label: "Back to home", className: "dr-nav-cta" }
      : { href: "/draft", label: "Open Draftix", className: "dr-nav-cta" },
  ];

  return <AppNav variant="public" links={links} />;
}

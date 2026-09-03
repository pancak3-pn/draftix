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
      ? { href: "/", label: "Back to home", className: "sp-open" }
      : { href: "/draft", label: "Open Draftix", className: "sp-open" },
  ];

  return <AppNav variant="support" links={links} />;
}

import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { BrainCircuit, Menu, X } from "lucide-react";

const NAV_LINKS = [
  { to: "/", label: "Home", end: true },
  { to: "/about", label: "About Project" },
  { to: "/help", label: "Help" },
];

function navLinkClasses({ isActive }) {
  return `rounded-lg px-3 py-2 text-sm font-medium transition ${
    isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
  }`;
}

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link
          to="/"
          onClick={() => setMobileOpen(false)}
          className="flex items-center gap-2 font-semibold text-slate-900"
        >
          <BrainCircuit className="h-6 w-6 text-brand-600" aria-hidden="true" />
          <span>ResearchMind</span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1 sm:flex">
          {NAV_LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end} className={navLinkClasses}>
              {link.label}
            </NavLink>
          ))}
        </nav>

        <button
          type="button"
          onClick={() => setMobileOpen((open) => !open)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 sm:hidden"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <nav aria-label="Primary" className="border-t border-slate-200 px-4 py-2 sm:hidden">
          <ul className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  end={link.end}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `block rounded-lg px-3 py-2.5 text-sm font-medium ${
                      isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}

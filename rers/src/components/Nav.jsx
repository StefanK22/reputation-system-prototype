import { NavLink } from 'react-router-dom';

const USER_LINKS = [
  { to: '/rankings',     label: 'Rankings'     },
  { to: '/interactions', label: 'Interactions' },
  { to: '/feedback',     label: 'Feedback'     },
  { to: '/observations', label: 'Observations' },
];

const DEBUG_LINKS = [
  { to: '/ledger',   label: 'Ledger'   },
  { to: '/database', label: 'Database' },
  { to: '/api',      label: 'API'      },
];

function NavGroup({ links }) {
  return links.map(({ to, label }) => (
    <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'active' : ''}>
      {label}
    </NavLink>
  ));
}

export default function Nav() {
  return (
    <nav>
      <div className="nav-title">Real Estate<br />Reputation System</div>
      <NavGroup links={USER_LINKS} />
      <div className="nav-section-label">Debug</div>
      <NavGroup links={DEBUG_LINKS} />
    </nav>
  );
}

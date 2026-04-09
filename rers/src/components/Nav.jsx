import { NavLink } from 'react-router-dom';

const USER_LINKS = [
  { to: '/rankings',  label: 'Rankings'  },
  { to: '/config',    label: 'Config'    },
  { to: '/api',       label: 'API'       },
  { to: '/contracts', label: 'Contracts' },
];

const DEBUG_LINKS = [
  { to: '/ledger',   label: 'Ledger'   },
  { to: '/database', label: 'Database' },
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
      <div className="nav-title">Real Estate Reputation Simulator</div>
      <NavGroup links={USER_LINKS} />
      <div className="nav-section-label">Debug</div>
      <NavGroup links={DEBUG_LINKS} />
    </nav>
  );
}

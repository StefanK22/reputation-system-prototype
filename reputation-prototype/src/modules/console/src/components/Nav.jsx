import { NavLink } from 'react-router-dom';

const LINKS = [
  { to: '/rankings',    label: 'Rankings'    },
  { to: '/config',      label: 'Config'      },
  { to: '/contracts',   label: 'Contracts'   },
  { to: '/ledger',      label: 'Ledger'      },
  { to: '/database',    label: 'Database'    },
  { to: '/credentials', label: 'Credentials' },
];

export default function Nav() {
  return (
    <nav>
      <div className="nav-title">Reputation</div>
      {LINKS.map(({ to, label }) => (
        <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'active' : ''}>
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

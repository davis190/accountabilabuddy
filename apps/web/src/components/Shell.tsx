import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth';

export function Shell({ children }: { children: ReactNode }) {
  const { memberships, activeGroupId, setActiveGroupId } = useAuth();
  const active = memberships.find((m) => m.groupId === activeGroupId) ?? memberships[0];

  return (
    <div className="app-shell">
      <header className="topbar">
        <h1 className="brand">Accountabilabuddy</h1>
        {memberships.length > 0 && (
          <label className="sr-only" htmlFor="group-switch">
            Active group
          </label>
        )}
        {memberships.length > 0 && (
          <select
            id="group-switch"
            className="group-switcher"
            value={active?.groupId}
            onChange={(e) => setActiveGroupId(e.target.value)}
            aria-label="Switch group"
          >
            {memberships.map((m) => (
              <option key={m.groupId} value={m.groupId}>
                {m.name}
              </option>
            ))}
          </select>
        )}
      </header>
      <main>{children}</main>
      <nav className="bottom-nav" aria-label="Primary">
        <NavLink to="/app/today" className={({ isActive }) => (isActive ? 'active' : undefined)}>
          <span className="nav-icon" aria-hidden>
            ✓
          </span>
          Today
        </NavLink>
        <NavLink to="/app/week" className={({ isActive }) => (isActive ? 'active' : undefined)}>
          <span className="nav-icon" aria-hidden>
            ▦
          </span>
          Week
        </NavLink>
        <NavLink to="/app/history" className={({ isActive }) => (isActive ? 'active' : undefined)}>
          <span className="nav-icon" aria-hidden>
            ☰
          </span>
          History
        </NavLink>
        <NavLink to="/app/settings" className={({ isActive }) => (isActive ? 'active' : undefined)}>
          <span className="nav-icon" aria-hidden>
            ⚙
          </span>
          Settings
        </NavLink>
      </nav>
      <style>{`.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0}`}</style>
    </div>
  );
}

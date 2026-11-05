import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { useTheme } from './ui';

const NAV = [
  { to: '/', label: 'Inicio', icon: '⌂', end: true },
  { to: '/temario', label: 'Temario', icon: '▤' },
  { to: '/repaso', label: 'Repaso', icon: '↻' },
  { to: '/drills', label: 'Drills de código', icon: '⏱' },
  { to: '/practica', label: 'Práctica', icon: '◎' },
  { to: '/examen', label: 'Examen', icon: '✎' },
  { to: '/snippets', label: 'Snippets y atajos', icon: '⌘' },
  { to: '/progreso', label: 'Progreso', icon: '▲' },
  { to: '/mis-tarjetas', label: 'Mis tarjetas', icon: '▢' },
  { to: '/ajustes', label: 'Ajustes', icon: '⚙' },
];

export function Layout() {
  const { user } = useAuth();
  const { theme, toggle } = useTheme();
  const [menu, setMenu] = useState(false);
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => { setMenu(false); window.scrollTo(0, 0); }, [location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !t.closest('input, textarea, select, .cm-editor')) {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('#top-search')?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={menu ? 'menu-open' : ''}>
      <aside className="sidebar" aria-label="Navegación principal">
        <NavLink className="brand" to="/"><span className="logo" aria-hidden="true">SD</span><span>SharpDrill</span></NavLink>
        <nav className="nav">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}><span className="ni" aria-hidden="true">{n.icon}</span> {n.label}</NavLink>
          ))}
        </nav>
        <div className="sidebar-foot small muted">{user?.name}</div>
      </aside>
      <div className="scrim" aria-hidden="true" onClick={() => setMenu(false)} />
      <div className="shell">
        <header className="topbar">
          <button className="icon-btn only-mobile" type="button" aria-label="Abrir menú" onClick={() => setMenu((m) => !m)}>☰</button>
          <form className="top-search" role="search" onSubmit={(e) => { e.preventDefault(); navigate(`/buscar?q=${encodeURIComponent(q)}`); }}>
            <input id="top-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar teoría, snippets, atajos…  ( / )" aria-label="Buscar" />
          </form>
          <button className="icon-btn" type="button" onClick={toggle} aria-label={`Cambiar a tema ${theme === 'dark' ? 'claro' : 'oscuro'}`}>
            {theme === 'dark' ? '☀' : '☾'}
          </button>
        </header>
        <main id="main"><Outlet /></main>
      </div>
    </div>
  );
}

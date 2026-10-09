'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import {
  LayoutDashboard, FileText, AlertTriangle, Search,
  Bell, Brain, FileBarChart, Users, ClipboardList,
  Settings, Shield, LogOut, ChevronRight, Activity,
} from 'lucide-react';

const NAV_MAIN = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/logs', label: 'Logs', icon: FileText },
  { href: '/anomalies', label: 'Anomalies', icon: AlertTriangle },
  { href: '/investigations', label: 'Investigations', icon: Search },
  { href: '/alerts', label: 'Alerts', icon: Bell },
  { href: '/models', label: 'Models', icon: Brain },
  { href: '/reports', label: 'Reports', icon: FileBarChart },
];

const NAV_ADMIN = [
  { href: '/admin/users', label: 'Users', icon: Users, role: 'ADMIN' },
  { href: '/admin/audit-logs', label: 'Audit Logs', icon: ClipboardList, role: 'ADMIN' },
  { href: '/settings', label: 'Settings', icon: Settings },
];

const ROLE_COLORS: Record<string, string> = {
  ADMIN: 'bg-purple-500/20 text-purple-400',
  ANALYST: 'bg-blue-500/20 text-blue-400',
  VIEWER: 'bg-gray-500/20 text-gray-400',
};

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');
  const canAccess = (role?: string) => {
    if (!role) return true;
    if (role === 'ADMIN') return user?.role === 'ADMIN';
    return true;
  };

  return (
    <aside className="w-64 h-screen flex flex-col fixed left-0 top-0 z-40 border-r border-gray-800"
      style={{ background: '#0a0f1a' }}>
      {/* Logo */}
      <div className="p-5 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #06b6d4)' }}>
            <Shield size={18} className="text-white" />
          </div>
          <div>
            <div className="font-bold text-white text-sm leading-none">AEGISLOG</div>
            <div className="text-xs text-gray-500 mt-0.5">AI Anomaly Detection</div>
          </div>
        </div>
      </div>

      {/* User info */}
      <div className="px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-linear-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
            {user?.username?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-white truncate">{user?.full_name || user?.username}</div>
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${ROLE_COLORS[user?.role || 'VIEWER']}`}>
              {user?.role}
            </span>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {NAV_MAIN.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`nav-item ${isActive(href) ? 'active' : ''}`}
          >
            <Icon size={17} />
            <span className="flex-1">{label}</span>
            {isActive(href) && <ChevronRight size={14} className="opacity-50" />}
          </Link>
        ))}

        <div className="pt-4 pb-1">
          <div className="text-xs font-semibold text-gray-600 px-3 uppercase tracking-widest">
            Administration
          </div>
        </div>

        {NAV_ADMIN.filter(n => canAccess(n.role)).map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`nav-item ${isActive(href) ? 'active' : ''}`}
          >
            <Icon size={17} />
            <span className="flex-1">{label}</span>
          </Link>
        ))}
      </nav>

      {/* Bottom - activity & logout */}
      <div className="p-3 border-t border-gray-800 space-y-0.5">
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-500">
          <Activity size={14} className="text-green-500" />
          <span>System Online</span>
        </div>
        <button
          onClick={logout}
          className="nav-item w-full text-red-400 hover:text-red-300 hover:bg-red-500/10"
        >
          <LogOut size={17} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}

import { Outlet } from 'react-router';
import { VaultTree } from './explorer/VaultTree';

export function Layout() {
  return (
    <div className="app-layout h-screen flex">
      <aside className="sidebar w-64 border-r flex flex-col">
        <div className="sidebar-header p-2 border-b">
          <h1 className="text-sm font-semibold">AIMO Note</h1>
        </div>
        <div className="sidebar-content flex-1 overflow-auto">
          <VaultTree />
        </div>
      </aside>
      <main className="main-content flex-1 flex flex-col overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
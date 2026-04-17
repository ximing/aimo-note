import { BrowserRouter, Routes, Route } from 'react-router';
import { HomePage } from './pages/home';
import { EditorPage } from './pages/editor';
import { SettingsPage } from './pages/settings';
import { GraphPage } from './pages/graph';
import { SearchPage } from './pages/search';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/editor/:path*" element={<EditorPage />} />
        <Route path="/graph" element={<GraphPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </BrowserRouter>
  );
}

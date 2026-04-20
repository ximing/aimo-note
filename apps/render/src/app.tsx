import { BrowserRouter, HashRouter, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { HomePage } from './pages/home';
import { EditorPage } from './pages/editor';
import { SettingsPage } from './pages/settings';
import { GraphPage } from './pages/graph';
import { SearchPage } from './pages/search';

const Router = window.location.protocol === 'file:' ? HashRouter : BrowserRouter;

export function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route element={<Layout />}>
          <Route path="/editor" element={<EditorPage />} />
          <Route path="/editor/:path/*" element={<EditorPage />} />
          <Route path="/graph" element={<GraphPage />} />
          <Route path="/search" element={<SearchPage />} />
        </Route>
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </Router>
  );
}

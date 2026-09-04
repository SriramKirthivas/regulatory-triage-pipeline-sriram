import { Navigate, Route, Routes } from "react-router-dom";

import { TopNav } from "./components/TopNav";
import { ActionItemsPage } from "./pages/ActionItemsPage";
import { ApiHealthPage } from "./pages/ApiHealthPage";
import { AuthoritiesPage } from "./pages/AuthoritiesPage";
import { DataQualityPage } from "./pages/DataQualityPage";
import { DirectivesPage } from "./pages/DirectivesPage";
import { SavedViewsPage } from "./pages/SavedViewsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { UpdateDetailPage } from "./pages/UpdateDetailPage";
import { UpdatesPage } from "./pages/UpdatesPage";

export default function App() {
  return (
    <div className="shell">
      <TopNav />
      <div className="main">
        <Routes>
          <Route path="/" element={<Navigate to="/updates" replace />} />
          <Route path="/updates" element={<UpdatesPage />} />
          <Route path="/updates/:id" element={<UpdateDetailPage />} />
          <Route path="/authorities" element={<AuthoritiesPage />} />
          <Route path="/directives" element={<DirectivesPage />} />
          <Route path="/action-items" element={<ActionItemsPage />} />
          <Route path="/data-quality" element={<DataQualityPage />} />
          <Route path="/saved-views" element={<SavedViewsPage />} />
          <Route path="/api-health" element={<ApiHealthPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/updates" replace />} />
        </Routes>
      </div>
    </div>
  );
}

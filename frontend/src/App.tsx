import { AnimatePresence } from "framer-motion";
import { Route, Routes, useLocation } from "react-router-dom";
import { Nav } from "./components/Site";
import AnomaliesPage from "./pages/AnomaliesPage";
import DirectiveDetail from "./pages/DirectiveDetail";
import DirectivesPage from "./pages/DirectivesPage";
import Overview from "./pages/Overview";
import TriagePage from "./pages/TriagePage";

export default function App() {
  const loc = useLocation();
  return (
    <>
      <Nav />
      <AnimatePresence mode="wait" initial={false}>
        <Routes location={loc} key={loc.pathname}>
          <Route path="/" element={<div className="page"><Overview /></div>} />
          <Route path="/triage" element={<div className="page-app"><TriagePage /></div>} />
          <Route path="/directives" element={<div className="page"><DirectivesPage /></div>} />
          <Route path="/directives/:id" element={<div className="page"><DirectiveDetail /></div>} />
          <Route path="/anomalies" element={<div className="page"><AnomaliesPage /></div>} />
        </Routes>
      </AnimatePresence>
    </>
  );
}

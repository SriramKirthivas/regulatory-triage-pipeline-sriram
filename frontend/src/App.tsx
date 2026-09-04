import { Route, Routes } from "react-router-dom";
import { Nav } from "./components/Site";
import { ToastProvider } from "./components/Toast";
import AnomaliesPage from "./pages/AnomaliesPage";
import DirectiveDetail from "./pages/DirectiveDetail";
import DirectivesPage from "./pages/DirectivesPage";
import Overview from "./pages/Overview";
import TriagePage from "./pages/TriagePage";

// The routes deliberately do not sit inside <AnimatePresence mode="wait">.
//
// That wrapper holds the incoming route unmounted until every motion descendant
// of the outgoing one has finished exiting. Navigation then depends on
// animation bookkeeping completing, and a single stranded presence child strands
// the whole app: the URL and the nav highlight update, but the old page stays on
// screen and no further click can change it.
//
// It stranded reproducibly. ToastProvider drops each toast on a setTimeout, so
// navigating while one was still on screen raced the timer against the exit —
// the toast was unmounted from the list mid-exit, its completion callback never
// fired, and the route swap never resumed. Changing an item's status and then
// clicking any nav link was enough to wedge the app permanently.
//
// Pages animate in on mount via PageFade, which needs no AnimatePresence. Only
// the outgoing fade is lost, and correctness of navigation is worth more than it.
//
// ToastProvider is mounted here, above the routes, rather than inside TriagePage:
// toasts are app-level UI, and a "status saved" confirmation should outlive the
// page that triggered it instead of being torn down with it.
export default function App() {
  return (
    <ToastProvider>
      <Nav />
      <Routes>
        <Route path="/" element={<div className="page"><Overview /></div>} />
        <Route path="/triage" element={<div className="page-app"><TriagePage /></div>} />
        <Route path="/directives" element={<div className="page"><DirectivesPage /></div>} />
        <Route path="/directives/:id" element={<div className="page"><DirectiveDetail /></div>} />
        <Route path="/anomalies" element={<div className="page"><AnomaliesPage /></div>} />
      </Routes>
    </ToastProvider>
  );
}

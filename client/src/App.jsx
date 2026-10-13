import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";
import HomePage from "./pages/HomePage.jsx";
import SessionPage from "./pages/SessionPage.jsx";
import AboutPage from "./pages/AboutPage.jsx";
import HelpPage from "./pages/HelpPage.jsx";
import ResultsGuidePage from "./pages/ResultsGuidePage.jsx";
import DraftPage from "./pages/DraftPage.jsx";

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50 print:bg-white">
      <Navbar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/session/:id" element={<SessionPage />} />
        <Route path="/session/:id/draft/:draftId" element={<DraftPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/guide" element={<ResultsGuidePage />} />
        <Route path="/help" element={<HelpPage />} />
      </Routes>
    </div>
  );
}

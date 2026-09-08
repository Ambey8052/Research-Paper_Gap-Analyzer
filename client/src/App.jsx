import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";
import HomePage from "./pages/HomePage.jsx";
import SessionPage from "./pages/SessionPage.jsx";
import AboutPage from "./pages/AboutPage.jsx";
import HelpPage from "./pages/HelpPage.jsx";

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/session/:id" element={<SessionPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/help" element={<HelpPage />} />
      </Routes>
    </div>
  );
}

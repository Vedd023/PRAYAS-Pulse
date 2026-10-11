import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import LandingPage from './pages/LandingPage';
import StudentPage from './pages/StudentPage';
import StaffPage from './pages/StaffPage';
import DisplayPage from './pages/DisplayPage';
import AdminPage from './pages/AdminPage';

function AppLayout() {
  const location = useLocation();

  // Display page has its own full-screen dark layout — no navbar
  const isDisplayPage = location.pathname === '/display';

  return (
    <>
      {!isDisplayPage && <Navbar />}
      <main className={isDisplayPage ? '' : 'flex-1'}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/student" element={<StudentPage />} />
          <Route path="/staff" element={<StaffPage />} />
          <Route path="/display" element={<DisplayPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </main>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}

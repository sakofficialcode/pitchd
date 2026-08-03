import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Create from './pages/Create';
import GroupPage from './pages/GroupPage';
import SchedulePage from './pages/SchedulePage';
import AdminPage from './pages/AdminPage';

const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-100">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Create />} />
          <Route path="/:uuid" element={<GroupPage />} />
          <Route path="/:uuid/schedule" element={<SchedulePage />} />
          <Route path="/:uuid/admin" element={<AdminPage />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
};

export default App;

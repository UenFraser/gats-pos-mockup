import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './index.css';
import { AuthProvider } from './auth/AuthContext';
import RequireRole from './auth/RequireRole';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './pages/Login';
import Waiter from './pages/Waiter';
import DesktopOrder from './pages/DesktopOrder';
import Kitchen from './pages/Kitchen';
import KitchenHistory from './pages/KitchenHistory';
import Desktop from './pages/Desktop';
import Settings from './pages/Settings';

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/desktop/order" element={<RequireRole roles={['CASHIER', 'MANAGER']}><DesktopOrder /></RequireRole>} />
          <Route path="/desktop/settings" element={<RequireRole roles={['MANAGER']}><Settings /></RequireRole>} />
          <Route path="/desktop/*" element={<RequireRole roles={['CASHIER', 'MANAGER']}><Desktop /></RequireRole>} />
          <Route path="/waiter/*" element={<RequireRole roles={['WAITER', 'MANAGER']}><Waiter /></RequireRole>} />
          <Route path="/kitchen/history" element={<RequireRole roles={['KDS', 'MANAGER']}><KitchenHistory /></RequireRole>} />
          <Route path="/kitchen/*" element={<RequireRole roles={['KDS', 'MANAGER']}><Kitchen /></RequireRole>} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </ErrorBoundary>
);

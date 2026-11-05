import { Navigate } from 'react-router-dom';
import { useAuth, homeFor } from './AuthContext';

// Hides a page from the wrong role. (The server still checks the role on every request.)
export default function RequireRole({ roles, children }) {
  const { user, ready } = useAuth();
  if (!ready) return <div className="p-8 text-center"><span className="loading loading-spinner" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return children;
}

import { Navigate } from 'react-router-dom';
import { getSession } from '../utils/session';

const homeFor = (role) => (role === 'admin' ? '/admin' : '/dashboard');

// Pages that need a logged-in user. Pass `role` to also restrict by role.
// This is a usability guard (no flash of a broken page, sensible redirects);
// the real enforcement is always the server's authMiddleware.
export function ProtectedRoute({ role, children }) {
  const { authenticated, role: myRole } = getSession();
  if (!authenticated) return <Navigate to="/login" replace />;
  if (role && myRole !== role) return <Navigate to={homeFor(myRole)} replace />;
  return children;
}

// Login / register / forgot-password make no sense for someone already in.
export function GuestRoute({ children }) {
  const { authenticated, role } = getSession();
  if (authenticated) return <Navigate to={homeFor(role)} replace />;
  return children;
}

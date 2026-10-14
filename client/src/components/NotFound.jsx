import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="text-center mt-5">
      <h1 className="display-4 fw-bold">404</h1>
      <h2 className="h4">We could not find that page</h2>
      <p className="text-muted">The address may have changed, or the page may no longer exist.</p>
      <Link to="/" className="btn btn-primary">Back to home</Link>
    </div>
  );
}

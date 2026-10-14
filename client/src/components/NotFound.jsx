import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="text-center mt-5">
      <h1 className="display-4 fw-bold">404</h1>
      <p className="lead text-muted">That page does not exist.</p>
      <Link to="/" className="btn btn-primary">Back to home</Link>
    </div>
  );
}

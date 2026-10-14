import { useEffect, useState } from 'react';
import { clearFlash, peekFlash } from '../utils/session';

// Shows (once) the message left behind by endSession()/setFlash(), e.g.
// "Your session has expired" after being redirected to the login page.
export default function FlashMessage() {
  const [flash, setFlash] = useState(peekFlash);

  useEffect(() => {
    clearFlash();
  }, []);

  if (!flash) return null;
  return (
    <div className={`alert alert-${flash.type || 'info'} alert-dismissible fade show`} role="alert">
      {flash.text}
      <button type="button" className="btn-close" aria-label="Close" onClick={() => setFlash(null)}></button>
    </div>
  );
}

import { useEffect, useState } from "react";
import api, { errorMessage } from "../api/axiosClient";
import ConfirmModal from "../components/ConfirmModal";
import { endSession, getSession, updateSessionName } from "../utils/session";
import {
  PASSWORD_MESSAGE,
  PASSWORD_REGEX,
  PHONE_MESSAGE,
  PHONE_REGEX,
} from "../utils/validation";

export default function Profile() {
  const { role } = getSession();
  const [stats, setStats] = useState({
    total: 0,
    confirmed: 0,
    pending: 0,
    cancelled: 0,
  });

  const [profile, setProfile] = useState({
    username: "",
    name: "",
    contactNumber: "",
    address: "",
  });
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    contactNumber: "",
    address: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  // Change password
  const [pwForm, setPwForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [pwError, setPwError] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  // Delete account
  const [showDelete, setShowDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    const fetchProfileData = async () => {
      try {
        const res = await api.get("/users/profile");
        setProfile(res.data);
        setFormData({
          name: res.data.name || "",
          contactNumber: res.data.contactNumber || "",
          address: res.data.address || "",
        });
        updateSessionName(res.data.name);
      } catch (err) {
        setError(errorMessage(err, "Failed to load your profile."));
      }
    };

    const fetchStats = async () => {
      try {
        const res = await api.get("/appointments");
        const appts = res.data;

        setStats({
          total: appts.length,
          confirmed: appts.filter((a) => a.status === "Confirmed").length,
          pending: appts.filter((a) =>
            [
              "Pending_Admin_Approval",
              "Admin_Counter_Offer",
              "Patient_Counter_Offer",
            ].includes(a.status),
          ).length,
          cancelled: appts.filter((a) =>
            ["Cancelled", "Rejected", "Cancellation_Requested"].includes(
              a.status,
            ),
          ).length,
        });
      } catch (err) {
        setError(errorMessage(err, "Failed to load appointment statistics."));
      }
    };

    fetchProfileData();
    if (role === "patient") {
      fetchStats();
    }
  }, [role]);

  const validateForm = () => {
    if (!formData.name.trim()) return "Full Name is required.";

    if (formData.contactNumber.trim()) {
      // Validates either an 11-digit mobile starting with 09 OR a 7-digit landline
      if (!PHONE_REGEX.test(formData.contactNumber.trim()))
        return PHONE_MESSAGE;
    }
    return null;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    try {
      const res = await api.put("/users/profile", formData);
      updateSessionName(res.data.name);
      setSuccess("Profile updated successfully!");
    } catch (err) {
      setError(errorMessage(err, "Failed to update profile"));
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setError("");
    setSuccess("");
    setFormData({
      name: profile.name || "",
      contactNumber: profile.contactNumber || "",
      address: profile.address || "",
    });
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError("");

    if (!PASSWORD_REGEX.test(pwForm.newPassword))
      return setPwError(PASSWORD_MESSAGE);
    if (pwForm.newPassword !== pwForm.confirmPassword)
      return setPwError("New passwords do not match.");
    if (pwForm.newPassword === pwForm.currentPassword)
      return setPwError("New password must be different from the current one.");

    setPwBusy(true);
    try {
      await api.put("/users/change-password", {
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
      });
      // The server invalidated every token (including this one): sign in again
      endSession({
        message: "Password changed successfully. Please log in again.",
        type: "success",
      });
    } catch (err) {
      setPwError(errorMessage(err, "Failed to change password"));
      setPwBusy(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteBusy(true);
    setDeleteError("");
    try {
      // axios sends a DELETE body through the `data` option
      await api.delete("/users/me", {
        data: { password: deletePassword, confirmUsername: profile.username },
      });
      endSession({
        message: "Your account has been deleted.",
        type: "success",
        to: "/",
      });
    } catch (err) {
      setDeleteError(errorMessage(err, "Failed to delete your account"));
      setDeleteBusy(false);
    }
  };

  return (
    <div className="row justify-content-center mt-5">
      <div className="col-md-6 col-lg-5">
        <div className="card shadow-sm border-0">
          <div className="card-header bg-primary text-white p-3">
            <h1 className="h4 mb-0">User Profile</h1>
          </div>
          <div className="card-body p-4 bg-light">
            <div className="mb-4">
              <div className="d-flex justify-content-between align-items-center border-bottom pb-2 mb-3">
                <h5 className="text-secondary mb-0">Account Details</h5>
                {!isEditing && (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="btn btn-sm btn-outline-primary"
                  >
                    Edit Profile
                  </button>
                )}
              </div>

              {error && <div className="alert alert-danger py-2" role="alert" aria-live="assertive">{error}</div>}
              {success && (
                <div className="alert alert-success py-2" role="status" aria-live="polite">{success}</div>
              )}

              {!isEditing ? (
                <div>
                  <p className="mb-2">
                    <strong>Username:</strong> {profile.username}
                  </p>
                  <p className="mb-2">
                    <strong>Full Name:</strong> {profile.name}
                  </p>
                  <p className="mb-2">
                    <strong>Email:</strong> {profile.email}
                  </p>
                  <p className="mb-2">
                    <strong>Contact Number:</strong>{" "}
                    {profile.contactNumber || (
                      <span className="text-muted fst-italic">
                        Not provided
                      </span>
                    )}
                  </p>
                  <p className="mb-2">
                    <strong>Home Address:</strong>{" "}
                    {profile.address || (
                      <span className="text-muted fst-italic">
                        Not provided
                      </span>
                    )}
                  </p>
                  <p className="mb-1 mt-3">
                    <strong>Account Type:</strong>{" "}
                    <span className="badge bg-dark">
                      {role === "admin" ? "Administrator" : "Patient"}
                    </span>
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSave}>
                  <div className="mb-3">
                    <label className="form-label small fw-bold" htmlFor="profile-username">
                      Username{" "}
                      <span className="text-muted fw-normal">
                        (Cannot be changed)
                      </span>
                    </label>
                    <input
                      type="text"
                      id="profile-username"
                      className="form-control bg-light"
                      value={profile.username}
                      disabled
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label small fw-bold" htmlFor="profile-name">
                      Full Name <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      id="profile-name"
                      name="name"
                      className="form-control"
                      required
                      maxLength={100}
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label small fw-bold" htmlFor="profile-contact">
                      Contact Number{" "}
                      <span className="text-muted fw-normal">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      id="profile-contact"
                      name="contactNumber"
                      className="form-control"
                      placeholder="e.g. 09770493211 or 8709768"
                      value={formData.contactNumber}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          contactNumber: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label small fw-bold" htmlFor="profile-address">
                      Home Address{" "}
                      <span className="text-muted fw-normal">(Optional)</span>
                    </label>
                    <textarea
                      id="profile-address"
                      name="address"
                      className="form-control"
                      rows="2"
                      maxLength={300}
                      placeholder="Enter your full home address"
                      value={formData.address}
                      onChange={(e) =>
                        setFormData({ ...formData, address: e.target.value })
                      }
                    ></textarea>
                  </div>
                  <div className="d-flex gap-2 mt-4">
                    <button
                      type="submit"
                      className="btn btn-success w-50"
                      disabled={saving}
                    >
                      {saving ? "Saving…" : "Save Changes"}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="btn btn-secondary w-50"
                      disabled={saving}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>

            {role === "patient" && (
              <div className="mb-4">
                <h5 className="text-secondary border-bottom pb-2 mb-3">
                  My Appointment Stats
                </h5>
                <ul className="list-group shadow-sm">
                  <li className="list-group-item d-flex justify-content-between align-items-center">
                    Total Requests Made
                    <span className="badge bg-primary rounded-pill">
                      {stats.total}
                    </span>
                  </li>
                  <li className="list-group-item d-flex justify-content-between align-items-center">
                    Successfully Confirmed
                    <span className="badge bg-success rounded-pill">
                      {stats.confirmed}
                    </span>
                  </li>
                  <li className="list-group-item d-flex justify-content-between align-items-center">
                    Pending or Negotiating
                    <span className="badge bg-warning text-dark rounded-pill">
                      {stats.pending}
                    </span>
                  </li>
                  <li className="list-group-item d-flex justify-content-between align-items-center">
                    Cancelled or Rejected
                    <span className="badge bg-danger rounded-pill">
                      {stats.cancelled}
                    </span>
                  </li>
                </ul>
              </div>
            )}

            <div className="mb-4">
              <h5 className="text-secondary border-bottom pb-2 mb-3">
                Change Password
              </h5>
              {pwError && (
                <div className="alert alert-danger py-2">{pwError}</div>
              )}
              <form onSubmit={handleChangePassword}>
                <div className="mb-3">
                  <label className="form-label small fw-bold" htmlFor="current-password">
                    Current Password
                  </label>
                  <input
                    type="password"
                    id="current-password"
                    name="currentPassword"
                    className="form-control"
                    required
                    autoComplete="current-password"
                    value={pwForm.currentPassword}
                    onChange={(e) =>
                      setPwForm({ ...pwForm, currentPassword: e.target.value })
                    }
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label small fw-bold" htmlFor="new-password">
                    New Password
                  </label>
                  <input
                    type="password"
                    id="new-password"
                    name="newPassword"
                    className="form-control"
                    required
                    autoComplete="new-password"
                    value={pwForm.newPassword}
                    onChange={(e) =>
                      setPwForm({ ...pwForm, newPassword: e.target.value })
                    }
                  />
                  <small className="text-muted">{PASSWORD_MESSAGE}</small>
                </div>
                <div className="mb-3">
                  <label className="form-label small fw-bold" htmlFor="confirm-new-password">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    id="confirm-new-password"
                    name="confirmPassword"
                    className="form-control"
                    required
                    autoComplete="new-password"
                    value={pwForm.confirmPassword}
                    onChange={(e) =>
                      setPwForm({ ...pwForm, confirmPassword: e.target.value })
                    }
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-outline-primary w-100"
                  disabled={pwBusy}
                >
                  {pwBusy ? "Updating…" : "Update Password"}
                </button>
                <small className="text-muted d-block mt-2">
                  You will be signed out everywhere after changing your
                  password.
                </small>
              </form>
            </div>

            <div className="border border-danger rounded p-3 bg-white">
              <h5 className="text-danger mb-2">Danger Zone</h5>
              <p className="small text-muted mb-3">
                Deleting your account permanently removes your profile
                {role === "patient" && " and all of your appointments"}. This
                cannot be undone.
              </p>
              <button
                type="button"
                className="btn btn-outline-danger w-100"
                onClick={() => {
                  setDeletePassword("");
                  setDeleteError("");
                  setShowDelete(true);
                }}
                disabled={!profile.username}
              >
                Delete my account
              </button>
            </div>
          </div>
        </div>
      </div>

      {showDelete && (
        <ConfirmModal
          title="Delete your account?"
          variant="danger"
          confirmLabel="Delete my account"
          requireText={profile.username}
          requireTextLabel="Type your username"
          busy={deleteBusy}
          error={deleteError}
          onConfirm={handleDeleteAccount}
          onCancel={() => setShowDelete(false)}
        >
          <p className="mb-3">
            This permanently deletes your account
            {role === "patient" && " and every appointment you have made"}.
            There is no way to recover it.
          </p>
          <label className="form-label small fw-bold" htmlFor="delete-account-password">Your password</label>
          <input
            type="password"
            id="delete-account-password"
            name="deletePassword"
            className="form-control"
            autoComplete="current-password"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            required
          />
        </ConfirmModal>
      )}
    </div>
  );
}

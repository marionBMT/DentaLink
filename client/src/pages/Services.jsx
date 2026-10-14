import { useEffect, useState } from "react";
import api, { errorMessage } from "../api/axiosClient";
import { CONTACT_MESSAGE, isEmailOrPhone } from "../utils/validation";

export default function Services() {
  const [services, setServices] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");

  const [newServiceName, setNewServiceName] = useState("");
  const [editService, setEditService] = useState({ id: null, name: "" });

  const [dentistForms, setDentistForms] = useState({});
  const [errorMsg, setErrorMsg] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [modalAction, setModalAction] = useState({
    action: "",
    serviceId: "",
    serviceName: "",
    dentistId: null,
    payload: null,
  });

  const [currentPage, setCurrentPage] = useState(1);
  const servicesPerPage = 3;

  const loadServices = async () => {
    try {
      const res = await api.get("/services");
      setServices(res.data);
    } catch (err) {
      setErrorMsg(errorMessage(err, "Failed to load services."));
    }
  };

  useEffect(() => {
    loadServices();
  }, []);
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const handleAddService = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    try {
      await api.post("/services", { name: newServiceName });
      setNewServiceName("");
      loadServices();
    } catch (err) {
      setErrorMsg(errorMessage(err, "Failed to add service."));
    }
  };

  const handleDentistChange = (serviceId, field, value) => {
    setDentistForms((prev) => ({
      ...prev,
      [serviceId]: { ...prev[serviceId], [field]: value },
    }));
  };

  const executeModalAction = async () => {
    setErrorMsg("");
    try {
      if (modalAction.action === "delete_service") {
        await api.delete(`/services/${modalAction.serviceId}`);
      } else if (modalAction.action === "update_service") {
        await api.put(`/services/${modalAction.serviceId}`, {
          name: modalAction.payload,
        });
        setEditService({ id: null, name: "" });
      } else if (modalAction.action === "remove_dentist") {
        const targetService = services.find(
          (s) => s._id === modalAction.serviceId,
        );
        const updatedDentists = targetService.dentists.filter(
          (d) => d._id !== modalAction.dentistId,
        );
        await api.put(`/services/${modalAction.serviceId}`, {
          dentists: updatedDentists,
        });
      }
      loadServices();
      setShowModal(false);
    } catch (err) {
      setErrorMsg(errorMessage(err, "Action failed."));
      setShowModal(false);
    }
  };

  const promptAddDentist = async (serviceId) => {
    setErrorMsg("");
    const form = dentistForms[serviceId];
    if (!form || !form.name.trim() || !form.contact.trim()) {
      setErrorMsg("Dentist name and contact are required.");
      return;
    }
    if (!isEmailOrPhone(form.contact)) {
      setErrorMsg(CONTACT_MESSAGE);
      return;
    }

    try {
      const targetService = services.find((s) => s._id === serviceId);
      const updatedDentists = [
        ...targetService.dentists,
        { name: form.name.trim(), contact: form.contact.trim() },
      ];
      await api.put(`/services/${serviceId}`, { dentists: updatedDentists });

      setDentistForms((prev) => ({
        ...prev,
        [serviceId]: { name: "", contact: "" },
      }));
      loadServices();
    } catch (err) {
      setErrorMsg(errorMessage(err, "Failed to add dentist."));
    }
  };

  const filteredServices = services.filter((service) => {
    const term = searchTerm.toLowerCase();
    const matchService = service.name.toLowerCase().includes(term);
    const matchDentist = service.dentists.some(
      (d) =>
        d.name.toLowerCase().includes(term) ||
        d.contact.toLowerCase().includes(term),
    );
    return matchService || matchDentist;
  });

  const indexOfLastService = currentPage * servicesPerPage;
  const indexOfFirstService = indexOfLastService - servicesPerPage;
  const currentServices = filteredServices.slice(
    indexOfFirstService,
    indexOfLastService,
  );
  const totalPages = Math.ceil(filteredServices.length / servicesPerPage);

  return (
    <div className="mt-4 position-relative">
      <h3 className="mb-4">Services & Dentists Management</h3>

      {errorMsg && <div className="alert alert-danger py-2">{errorMsg}</div>}

      <div className="row">
        <div className="col-md-4 mb-4">
          <div className="card shadow-sm p-4 h-100">
            <h5 className="mb-3 border-bottom pb-2">Add New Service</h5>
            <form onSubmit={handleAddService}>
              <div className="mb-3">
                <label className="form-label small">Service Name</label>
                <input
                  type="text"
                  className="form-control"
                  required
                  value={newServiceName}
                  onChange={(e) => setNewServiceName(e.target.value)}
                  placeholder="e.g. Teeth Whitening"
                />
              </div>
              <button type="submit" className="btn btn-primary w-100">
                Add Service
              </button>
            </form>
          </div>
        </div>

        <div className="col-md-8">
          <div className="card shadow-sm mb-4">
            <div className="card-header bg-white border-bottom pb-0">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h5 className="mb-0">DentaLink Services</h5>
                <input
                  type="text"
                  className="form-control form-control-sm w-50"
                  placeholder="Search service or dentist name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="card-body bg-light p-3">
              {filteredServices.length === 0 ? (
                <p className="text-muted text-center m-0">No services found.</p>
              ) : (
                <div className="row">
                  {currentServices.map((service) => (
                    <div key={service._id} className="col-12 mb-3">
                      <div className="card border-0 shadow-sm border-start border-4 border-primary">
                        <div className="card-header bg-white d-flex justify-content-between align-items-center">
                          {editService.id === service._id ? (
                            <div className="d-flex gap-2 w-75">
                              <input
                                type="text"
                                className="form-control form-control-sm"
                                value={editService.name}
                                onChange={(e) =>
                                  setEditService({
                                    ...editService,
                                    name: e.target.value,
                                  })
                                }
                              />
                              <button
                                onClick={() => {
                                  setModalAction({
                                    action: "update_service",
                                    serviceId: service._id,
                                    payload: editService.name,
                                  });
                                  setShowModal(true);
                                }}
                                className="btn btn-sm btn-success"
                              >
                                Save
                              </button>
                              <button
                                onClick={() =>
                                  setEditService({ id: null, name: "" })
                                }
                                className="btn btn-sm btn-secondary"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <h5 className="mb-0 text-primary fw-bold">
                              {service.name}
                            </h5>
                          )}

                          {editService.id !== service._id && (
                            <div className="d-flex gap-2">
                              <button
                                onClick={() =>
                                  setEditService({
                                    id: service._id,
                                    name: service.name,
                                  })
                                }
                                className="btn btn-sm btn-outline-secondary px-2 py-0"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => {
                                  setModalAction({
                                    action: "delete_service",
                                    serviceId: service._id,
                                    serviceName: service.name,
                                  });
                                  setShowModal(true);
                                }}
                                className="btn btn-sm btn-outline-danger px-2 py-0"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="card-body py-2">
                          <h6 className="small text-muted fw-bold mb-2">
                            Assigned Dentists:
                          </h6>
                          {service.dentists.length === 0 ? (
                            <p className="small text-muted fst-italic">
                              No dentists assigned to this service yet.
                            </p>
                          ) : (
                            <ul className="list-group list-group-flush mb-3 border rounded">
                              {service.dentists.map((dentist) => (
                                <li
                                  key={dentist._id}
                                  className="list-group-item d-flex justify-content-between align-items-center py-1 px-2 bg-light"
                                >
                                  <div>
                                    <span className="fw-bold small">
                                      {dentist.name}
                                    </span>{" "}
                                    <br />
                                    <span
                                      className="text-muted"
                                      style={{ fontSize: "0.75rem" }}
                                    >
                                      {dentist.contact}
                                    </span>
                                  </div>
                                  <button
                                    onClick={() => {
                                      setModalAction({
                                        action: "remove_dentist",
                                        serviceId: service._id,
                                        dentistId: dentist._id,
                                        payload: dentist.name,
                                      });
                                      setShowModal(true);
                                    }}
                                    className="btn btn-sm btn-link text-danger p-0 text-decoration-none small"
                                  >
                                    ✕ Remove
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}

                          <div className="d-flex gap-2 mt-2">
                            <input
                              type="text"
                              className="form-control form-control-sm"
                              placeholder="Dr. Full Name"
                              value={dentistForms[service._id]?.name || ""}
                              onChange={(e) =>
                                handleDentistChange(
                                  service._id,
                                  "name",
                                  e.target.value,
                                )
                              }
                            />
                            <input
                              type="text"
                              className="form-control form-control-sm"
                              placeholder="Contact (Email/Num)"
                              value={dentistForms[service._id]?.contact || ""}
                              onChange={(e) =>
                                handleDentistChange(
                                  service._id,
                                  "contact",
                                  e.target.value,
                                )
                              }
                            />
                            <button
                              onClick={() => promptAddDentist(service._id)}
                              className="btn btn-sm btn-primary px-3"
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {totalPages > 1 && (
                    <nav className="mt-4">
                      <ul className="pagination justify-content-center">
                        <li
                          className={`page-item ${currentPage === 1 ? "disabled" : ""}`}
                        >
                          <button
                            onClick={() => setCurrentPage(currentPage - 1)}
                            className="page-link"
                          >
                            Previous
                          </button>
                        </li>
                        {[...Array(totalPages)].map((_, i) => (
                          <li
                            key={i + 1}
                            className={`page-item ${currentPage === i + 1 ? "active" : ""}`}
                          >
                            <button
                              onClick={() => setCurrentPage(i + 1)}
                              className="page-link"
                            >
                              {i + 1}
                            </button>
                          </li>
                        ))}
                        <li
                          className={`page-item ${currentPage === totalPages ? "disabled" : ""}`}
                        >
                          <button
                            onClick={() => setCurrentPage(currentPage + 1)}
                            className="page-link"
                          >
                            Next
                          </button>
                        </li>
                      </ul>
                    </nav>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showModal && (
        <>
          <div
            className="modal-backdrop fade show"
            style={{ zIndex: 1040 }}
          ></div>
          <div
            className="modal fade show d-block"
            tabIndex="-1"
            style={{ zIndex: 1050 }}
          >
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content shadow">
                <div
                  className={`modal-header text-white ${modalAction.action.includes("delete") || modalAction.action.includes("remove") ? "bg-danger" : "bg-warning text-dark"}`}
                >
                  <h5 className="modal-title">Confirm Action</h5>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => setShowModal(false)}
                  ></button>
                </div>
                <div className="modal-body">
                  <p className="mb-0">
                    {modalAction.action === "delete_service" &&
                      `Are you sure you want to completely delete "${modalAction.serviceName}"? All assigned dentists will also be removed.`}
                    {modalAction.action === "update_service" &&
                      "Are you sure you want to rename this service? It will update for all patients."}
                    {modalAction.action === "remove_dentist" &&
                      `Are you sure you want to unassign ${modalAction.payload} from this service?`}
                  </p>
                </div>
                <div className="modal-footer bg-light">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={`btn px-4 ${modalAction.action.includes("delete") || modalAction.action.includes("remove") ? "btn-danger" : "btn-warning"}`}
                    onClick={executeModalAction}
                  >
                    Confirm
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import api, { errorMessage } from "../api/axiosClient";
import ConfirmModal from "../components/ConfirmModal";
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
      <h2 className="h3 mb-4">Services & Dentists Management</h2>

      {errorMsg && <div className="alert alert-danger py-2" role="alert" aria-live="assertive">{errorMsg}</div>}

      <div className="row">
        <div className="col-md-4 mb-4">
          <div className="card shadow-sm p-4 h-100">
            <h5 className="mb-3 border-bottom pb-2">Add New Service</h5>
            <form onSubmit={handleAddService}>
              <div className="mb-3">
                <label className="form-label small" htmlFor="new-service-name">Service name</label>
                <input
                  type="search"
                  id="new-service-name"
                  name="serviceName"
                  className="form-control"
                  required
                  value={newServiceName}
                  onChange={(e) => setNewServiceName(e.target.value)}
                  placeholder="e.g. Teeth Whitening"
                  autoComplete="off"
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
              <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-2 mb-3">
                <h5 className="mb-0">DentaLink Services</h5>
                <label className="visually-hidden" htmlFor="service-search">Search services or dentists</label>
                <input
                  type="text"
                  id="service-search"
                  name="serviceSearch"
                  className="form-control form-control-sm"
                  placeholder="Search service or dentist name…"
                  autoComplete="off"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
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
                            <div className="d-flex flex-column flex-sm-row gap-2 flex-grow-1">
                              <label className="visually-hidden" htmlFor={`edit-service-${service._id}`}>Service name</label>
                              <input
                                id={`edit-service-${service._id}`}
                                name="editedServiceName"
                                type="text"
                                className="form-control form-control-sm"
                                autoComplete="off"
                                value={editService.name}
                                onChange={(e) =>
                                  setEditService({
                                    ...editService,
                                    name: e.target.value,
                                  })
                                }
                              />
                              <button
                                type="button"
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
                                type="button"
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
                                type="button"
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
                                type="button"
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
                                    type="button"
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

                          <div className="row g-2 mt-1">
                            <div className="col-12 col-lg-5">
                              <label className="visually-hidden" htmlFor={`dentist-name-${service._id}`}>Dentist name</label>
                            <input
                              id={`dentist-name-${service._id}`}
                              name="dentistName"
                              type="text"
                              className="form-control form-control-sm"
                              placeholder="Dr. Full Name"
                              autoComplete="off"
                              value={dentistForms[service._id]?.name || ""}
                              onChange={(e) =>
                                handleDentistChange(
                                  service._id,
                                  "name",
                                  e.target.value,
                                )
                              }
                            />
                            </div>
                            <div className="col-12 col-lg-5">
                              <label className="visually-hidden" htmlFor={`dentist-contact-${service._id}`}>Dentist contact</label>
                            <input
                              id={`dentist-contact-${service._id}`}
                              name="dentistContact"
                              type="text"
                              className="form-control form-control-sm"
                              placeholder="Email or phone number"
                              autoComplete="off"
                              value={dentistForms[service._id]?.contact || ""}
                              onChange={(e) =>
                                handleDentistChange(
                                  service._id,
                                  "contact",
                                  e.target.value,
                                )
                              }
                            />
                            </div>
                            <div className="col-12 col-lg-2 d-grid">
                            <button
                              type="button"
                              onClick={() => promptAddDentist(service._id)}
                              className="btn btn-sm btn-primary px-3"
                            >
                              Add
                            </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {totalPages > 1 && (
                    <nav className="mt-4" aria-label="Service pages">
                      <ul className="pagination justify-content-center">
                        <li
                          className={`page-item ${currentPage === 1 ? "disabled" : ""}`}
                        >
                          <button
                            type="button"
                            onClick={() => setCurrentPage(currentPage - 1)}
                            className="page-link"
                            disabled={currentPage === 1}
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
                              type="button"
                              onClick={() => setCurrentPage(i + 1)}
                              className="page-link"
                              aria-current={currentPage === i + 1 ? "page" : undefined}
                              aria-label={`Go to page ${i + 1}`}
                            >
                              {i + 1}
                            </button>
                          </li>
                        ))}
                        <li
                          className={`page-item ${currentPage === totalPages ? "disabled" : ""}`}
                        >
                          <button
                            type="button"
                            onClick={() => setCurrentPage(currentPage + 1)}
                            className="page-link"
                            disabled={currentPage === totalPages}
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
        <ConfirmModal
          title="Confirm Action"
          variant={modalAction.action.includes("delete") || modalAction.action.includes("remove") ? "danger" : "warning"}
          onConfirm={executeModalAction}
          onCancel={() => setShowModal(false)}
        >
          <p className="mb-0">
            {modalAction.action === "delete_service" &&
              `Are you sure you want to completely delete “${modalAction.serviceName}”? All assigned dentists will also be removed.`}
            {modalAction.action === "update_service" &&
              "Are you sure you want to rename this service? It will update for all patients."}
            {modalAction.action === "remove_dentist" &&
              `Are you sure you want to unassign ${modalAction.payload} from this service?`}
          </p>
        </ConfirmModal>
      )}
    </div>
  );
}

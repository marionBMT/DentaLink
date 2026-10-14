import api, { errorMessage } from "../api/axiosClient";

export async function openCancellationProof(appointmentId, onError) {
  const popup = window.open("", "_blank", "noopener,noreferrer");
  try {
    const res = await api.get(`/appointments/${appointmentId}/proof`);
    if (popup) popup.location.href = res.data.url;
    else window.location.assign(res.data.url);
  } catch (err) {
    if (popup) popup.close();
    onError(errorMessage(err, "Could not open the cancellation proof."));
  }
}
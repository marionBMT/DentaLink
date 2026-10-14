export const APPOINTMENT_STATUS = Object.freeze({
  CONFIRMED: 'Confirmed',
  CANCELLED: 'Cancelled',
  REJECTED: 'Rejected',
  CANCELLATION_REQUESTED: 'Cancellation_Requested',
});

export const APPOINTMENT_TIME_SLOTS = Object.freeze(
  Array.from({ length: 21 }, (_, index) => {
    const totalMinutes = (8 * 60) + (index * 30);
    const hour24 = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    const hour12 = hour24 % 12 || 12;
    const suffix = hour24 >= 12 ? 'PM' : 'AM';
    return {
      value: `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      label: `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`,
    };
  }),
);

export function formatAppointmentTime(timeString) {
  if (!timeString) return '';
  const [hour, minute] = timeString.split(':');
  const hour24 = Number.parseInt(hour, 10);
  if (!Number.isInteger(hour24) || minute === undefined) return timeString;
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  return `${timeString} (${hour24 % 12 || 12}:${minute} ${suffix})`;
}

export function formatAppointmentStatus(status = '') {
  return status.replaceAll('_', ' ');
}

export function appointmentStatusClass(status) {
  if (status === APPOINTMENT_STATUS.CONFIRMED) return 'bg-success';
  if (status.includes('Counter')) return 'bg-warning text-dark';
  if (status === APPOINTMENT_STATUS.CANCELLATION_REQUESTED) return 'bg-warning text-dark';
  if ([APPOINTMENT_STATUS.CANCELLED, APPOINTMENT_STATUS.REJECTED].includes(status)) return 'bg-danger';
  return 'bg-secondary';
}
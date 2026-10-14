import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APPOINTMENT_TIME_SLOTS,
  appointmentStatusClass,
  formatAppointmentStatus,
  formatAppointmentTime,
} from '../src/utils/appointments.js';

test('appointment times are formatted consistently', () => {
  assert.equal(formatAppointmentTime('08:30'), '08:30 (8:30 AM)');
  assert.equal(formatAppointmentTime('12:00'), '12:00 (12:00 PM)');
  assert.equal(formatAppointmentTime('18:00'), '18:00 (6:00 PM)');
  assert.equal(formatAppointmentTime(''), '');
});

test('appointment time slots cover 8:00 AM through 6:00 PM', () => {
  assert.equal(APPOINTMENT_TIME_SLOTS.length, 21);
  assert.deepEqual(APPOINTMENT_TIME_SLOTS[0], { value: '08:00', label: '8:00 AM' });
  assert.deepEqual(APPOINTMENT_TIME_SLOTS.at(-1), { value: '18:00', label: '6:00 PM' });
});

test('appointment statuses have shared labels and semantic colors', () => {
  assert.equal(formatAppointmentStatus('Cancellation_Requested'), 'Cancellation Requested');
  assert.equal(appointmentStatusClass('Confirmed'), 'bg-success');
  assert.equal(appointmentStatusClass('Admin_Counter_Offer'), 'bg-warning text-dark');
  assert.equal(appointmentStatusClass('Cancellation_Requested'), 'bg-warning text-dark');
  assert.equal(appointmentStatusClass('Rejected'), 'bg-danger');
  assert.equal(appointmentStatusClass('Pending_Admin_Approval'), 'bg-secondary');
});
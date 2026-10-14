# DentaLink: Manual Fixes

## Remaining manual/external verification

The code-addressable hardening work was completed on October 14, 2026. The following items cannot be completed reliably from the code-only workspace:

1. Complete the browser click-through in `server/NEXT_STEPS.md`, including OTP login/reset, profile actions, patient workflows, admin workflows, pagination, protected proof opening, and responsive layouts.
2. Capture real screenshots only after those browser flows pass.
3. Configure the production platform to ingest the server's structured JSON logs and alert on repeated 5xx responses or `/ready` failures.
4. Perform and record a database backup/restore drill using the actual production provider.
5. Obtain an independent review of the authentication middleware and appointment authorization/state-machine routes.
6. If stronger client regression coverage is required, intentionally adopt and configure a React component/browser E2E framework; the repository currently has shared-validation unit tests but no browser runner.

### Legacy proof migration note

Nine proof records were migrated or backfilled to authenticated Cloudinary delivery on October 14, 2026. The migration backup is outside the repository at:

```text
C:\Users\Martyn\AppData\Local\Temp\DentaLink-legacy-proof-backup-2026-10-14T00-40-05-948Z.json
```

The earlier October 13 backup contains eight records. One additional public PNG proof (`6ace753a67951d333089d1f2`) existed by the resumed October 14 run, so the fresh pre-execution backup correctly contains nine records and is the authoritative rollback snapshot for the completed migration.

Cloudinary's management API confirms that all seven old public origins are deleted and invalidation was requested. Previously cached public URLs can remain available at CDN edges briefly while invalidation propagates.

## Resolved: orphaned live appointment service

**Resolved October 13, 2026.** Because this was a development database, appointment `6acb75f8a5be03c1961c93c4` was exported and deleted. It had no uploaded cancellation proof. The backup is stored outside the repository at:

```text
C:\Users\Martyn\AppData\Local\Temp\DentaLink-deleted-appointment-6acb75f8a5be03c1961c93c4.json
```

After deletion, `npm run check-data` reported **All checks passed**. The instructions below are retained as a recovery/reference procedure if the issue recurs in another environment.

### Original issue

As verified on October 13, 2026, the read-only database health check reports:

```text
FAIL  Every live appointment refers to an existing service  ->  1 unknown service name(s)
```

One non-archived appointment in a live status references a `serviceType` for which no matching service currently exists. This may have happened because a service was removed before the current service-integrity safeguards were added.

Do not delete or directly rewrite the appointment until someone has confirmed whether it is still a valid booking.

### 1. Identify the affected appointment

Run the health check first:

```powershell
cd C:\Users\Martyn\Desktop\DentaLink\server
npm run check-data
```

Then use MongoDB Compass against the configured development database. Run this read-only aggregation on the `appointments` collection:

```javascript
[
  {
    $match: {
      isArchived: false,
      status: {
        $in: [
          "Pending",
          "Admin_Counter_Offer",
          "Patient_Counter_Offer",
          "Confirmed",
          "Cancellation_Requested"
        ]
      }
    }
  },
  {
    $lookup: {
      from: "services",
      localField: "serviceType",
      foreignField: "name",
      as: "matchingService"
    }
  },
  { $match: { matchingService: { $size: 0 } } },
  {
    $project: {
      _id: 1,
      patient: 1,
      serviceType: 1,
      dentistName: 1,
      requestedDate: 1,
      requestedTime: 1,
      status: 1,
      isArchived: 1
    }
  }
]
```

Record the appointment ID, service name, dentist, patient, date, time, and current status. Confirm the intended outcome with the clinic or project owner before making a change.

### 2. Choose one resolution

#### Option A: Recreate the missing service

Use this option when the appointment is legitimate and the clinic still offers the referenced service.

1. Sign in as an administrator.
2. Open service management.
3. Create a service whose name exactly matches the appointment's `serviceType`, including capitalization and spacing.
4. Add the appointment's `dentistName` to that service with a valid contact value.
5. Confirm that the service and dentist are correct for the booking.
6. Re-run `npm run check-data`.

The dentist must be assigned to the recreated service because new bookings validate both the service name and dentist assignment.

#### Option B: Resolve and archive the appointment

Use this option when the service is no longer offered or the appointment should not remain active.

1. Sign in as an administrator.
2. Locate the affected appointment using its ID, patient details, service, dentist, date, and time.
3. Resolve its workflow appropriately:
   - Reject a pending or patient-counter request with a clear reason.
   - Approve a cancellation request if cancellation is intended.
   - If a confirmed appointment must be cancelled but the normal workflow requires a patient cancellation request, coordinate with the patient rather than editing MongoDB directly.
4. Archive the resolved appointment through the admin UI, supplying the required reason and administrator contact.
5. Re-run `npm run check-data`.

Archiving removes the appointment from the health check's live-appointment set while preserving its history. Do not permanently delete it unless the clinic's retention policy explicitly requires deletion.

### 3. Verify the repair

From the server directory, run:

```powershell
cd C:\Users\Martyn\Desktop\DentaLink\server
npm run check-data
```

The relevant result must become:

```text
PASS  Every live appointment refers to an existing service
```

Review the other health checks as well. Do not consider the repair complete if this check passes by introducing a new schema, duplicate-slot, missing-patient, or administrator-account failure.

### Safety notes

- Back up the database before any direct database operation.
- Prefer the DentaLink admin UI and API because they enforce validation, workflow transitions, notifications, and archive rules.
- Do not commit, paste, or screenshot `MONGO_URI` or other `.env` secrets.
- Do not rename an unrelated service merely to satisfy this check.
- Do not create a placeholder service without verifying the real service and dentist details.
- Do not mark this item resolved until `npm run check-data` passes.
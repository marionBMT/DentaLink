// Migrates legacy public cancellation proofs to Cloudinary authenticated
// delivery. Dry-run by default; pass --execute to write.
//
// Before any upload/update, affected appointment records are exported outside
// the repository to the OS temp directory.
require("dotenv").config();
const fs = require("fs");
const os = require("os");
const path = require("path");
const mongoose = require("mongoose");
const Appointment = require("../models/Appointment");
const {
  cloudinary,
  uploadProof,
  uploadLegacyDocx,
  destroyFile,
  signedProofUrl,
  sniffFileType,
  isDocx,
} = require("../config/cloudinary");

const execute = process.argv.includes("--execute");

const legacyFilter = {
  $or: [
    { cancellationProofUrl: { $nin: ["", null] } },
    {
      cancellationProofPublicId: { $nin: ["", null] },
      $or: [
        { cancellationProofDeliveryType: { $ne: "authenticated" } },
        { cancellationProofResourceType: { $nin: ["image", "raw"] } },
      ],
    },
  ],
};

function legacyAssetFromUrl(url) {
  const match = /\/(image|raw)\/upload\/(?:v\d+\/)?(.+)$/.exec(url);
  if (!match) return null;
  let publicId = decodeURIComponent(match[2]);
  if (match[1] === "image") publicId = publicId.replace(/\.[A-Za-z0-9]+$/, "");
  return { resourceType: match[1], publicId };
}

async function destroyLegacyUrl(url) {
  const asset = legacyAssetFromUrl(url);
  if (!asset) throw new Error(`Could not parse legacy Cloudinary URL: ${url}`);
  const result = await cloudinary.uploader.destroy(asset.publicId, {
    resource_type: asset.resourceType,
    type: "upload",
    invalidate: true,
  });
  if (!["ok", "not found"].includes(result?.result)) {
    throw new Error(`Unexpected cleanup result for ${asset.publicId}: ${result?.result}`);
  }
}

async function detectAuthenticatedResource(record) {
  for (const resourceType of ["image", "raw"]) {
    try {
      await cloudinary.api.resource(record.cancellationProofPublicId, {
        resource_type: resourceType,
        type: "authenticated",
      });
      const response = await fetch(
        signedProofUrl(
          record.cancellationProofPublicId,
          record.cancellationProofFormat,
          resourceType,
        ),
      );
      if (response.ok) return resourceType;
    } catch (err) {
      const status = err?.error?.http_code || err?.http_code;
      if (status !== 404) throw err;
    }
  }
  throw new Error(
    `Could not verify protected asset for appointment ${record._id}.`,
  );
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set");
  await mongoose.connect(process.env.MONGO_URI);
  const records = await Appointment.find(legacyFilter).lean();
  console.log(`Found ${records.length} legacy public proof record(s).`);
  if (!records.length) return;

  if (!execute) {
    console.log("Dry run only. Re-run with --execute to migrate them.");
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(
    os.tmpdir(),
    `DentaLink-legacy-proof-backup-${stamp}.json`,
  );
  fs.writeFileSync(backupPath, JSON.stringify(records, null, 2), {
    flag: "wx",
  });
  console.log(`Backup written: ${backupPath}`);

  let migrated = 0;
  for (const record of records) {
    if (!record.cancellationProofUrl) {
      if (
        record.cancellationProofDeliveryType !== "authenticated" ||
        !record.cancellationProofPublicId ||
        !record.cancellationProofFormat
      ) {
        throw new Error(
          `Appointment ${record._id} has incomplete proof metadata and no retrievable legacy URL.`,
        );
      }
      const resourceType = await detectAuthenticatedResource(record);
      const result = await Appointment.updateOne(
        {
          _id: record._id,
          cancellationProofPublicId: record.cancellationProofPublicId,
          cancellationProofDeliveryType: "authenticated",
        },
        { $set: { cancellationProofResourceType: resourceType } },
      );
      if (result.modifiedCount !== 1) {
        throw new Error(
          `Appointment ${record._id} changed during metadata backfill.`,
        );
      }
      migrated += 1;
      console.log(
        `Backfilled ${record._id} as authenticated ${resourceType} (${migrated}/${records.length}).`,
      );
      continue;
    }

    // Resume safely if a previous run already installed and verified the
    // protected replacement but stopped before deleting/clearing the old URL.
    if (
      record.cancellationProofDeliveryType === "authenticated" &&
      ["image", "raw"].includes(record.cancellationProofResourceType) &&
      record.cancellationProofPublicId &&
      record.cancellationProofFormat
    ) {
      const protectedResponse = await fetch(
        signedProofUrl(
          record.cancellationProofPublicId,
          record.cancellationProofFormat,
          record.cancellationProofResourceType,
        ),
      );
      if (!protectedResponse.ok) {
        throw new Error(
          `Existing protected replacement for appointment ${record._id} was not reachable (HTTP ${protectedResponse.status}).`,
        );
      }
      await destroyLegacyUrl(record.cancellationProofUrl);
      const result = await Appointment.updateOne(
        {
          _id: record._id,
          cancellationProofUrl: record.cancellationProofUrl,
          cancellationProofPublicId: record.cancellationProofPublicId,
        },
        { $set: { cancellationProofUrl: "" } },
      );
      if (result.modifiedCount !== 1) {
        throw new Error(
          `Appointment ${record._id} changed during legacy cleanup.`,
        );
      }
      migrated += 1;
      console.log(
        `Finished legacy cleanup for ${record._id} (${migrated}/${records.length}).`,
      );
      continue;
    }

    const response = await fetch(record.cancellationProofUrl);
    if (!response.ok) {
      throw new Error(
        `Could not download proof for appointment ${record._id} (HTTP ${response.status}).`,
      );
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const replacement = sniffFileType(buffer)
      ? await uploadProof({ buffer })
      : isDocx(buffer)
        ? await uploadLegacyDocx(buffer)
        : (() => {
            throw new Error(
              `Proof for appointment ${record._id} is not a supported JPG, PNG, PDF or historical DOCX.`,
            );
          })();

    // Never repoint the database or delete the public copy until the protected
    // replacement has been proven downloadable.
    const protectedResponse = await fetch(
      signedProofUrl(
        replacement.publicId,
        replacement.format,
        replacement.resourceType,
      ),
    );
    if (!protectedResponse.ok) {
      await destroyFile(replacement.publicId, replacement.resourceType);
      throw new Error(
        `Protected replacement for appointment ${record._id} was not reachable (HTTP ${protectedResponse.status}).`,
      );
    }

    try {
      const result = await Appointment.updateOne(
        {
          _id: record._id,
          cancellationProofUrl: record.cancellationProofUrl,
        },
        {
          $set: {
            cancellationProofPublicId: replacement.publicId,
            cancellationProofFormat: replacement.format,
            cancellationProofDeliveryType: replacement.deliveryType,
            cancellationProofResourceType: replacement.resourceType,
          },
        },
      );
      if (result.modifiedCount !== 1) {
        throw new Error(
          `Appointment ${record._id} changed during migration; no database update was made.`,
        );
      }
    } catch (err) {
      await destroyFile(replacement.publicId, replacement.resourceType);
      throw err;
    }

    await destroyLegacyUrl(record.cancellationProofUrl);
    const clearResult = await Appointment.updateOne(
      {
        _id: record._id,
        cancellationProofUrl: record.cancellationProofUrl,
        cancellationProofPublicId: replacement.publicId,
      },
      { $set: { cancellationProofUrl: "" } },
    );
    if (clearResult.modifiedCount !== 1) {
      throw new Error(
        `Appointment ${record._id} changed before the legacy URL could be cleared.`,
      );
    }
    migrated += 1;
    console.log(`Migrated ${record._id} (${migrated}/${records.length}).`);
  }

  console.log(`Migrated ${migrated} proof record(s) to authenticated delivery.`);
}

main()
  .catch((err) => {
    console.error("Migration failed:", err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
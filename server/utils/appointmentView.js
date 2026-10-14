function appointmentView(value) {
  if (!value) return value;
  const item = value.toObject ? value.toObject() : { ...value };
  item.hasCancellationProof = Boolean(
    item.cancellationProofPublicId || item.cancellationProofUrl,
  );
  delete item.cancellationProofUrl;
  delete item.cancellationProofPublicId;
  delete item.cancellationProofFormat;
  delete item.cancellationProofDeliveryType;
  delete item.cancellationProofResourceType;
  return item;
}

const appointmentViews = (items) => items.map(appointmentView);

module.exports = { appointmentView, appointmentViews };
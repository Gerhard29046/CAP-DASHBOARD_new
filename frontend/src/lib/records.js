export function sameRecordId(left, right) {
  if (left == null || right == null) return false;
  return String(left) === String(right);
}

export function relatedRecords(records, foreignKey, parentId) {
  return records.filter((record) => sameRecordId(record[foreignKey], parentId));
}

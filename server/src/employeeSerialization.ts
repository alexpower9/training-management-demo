export function publicEmployeeRecord<T extends { cognitoSubject: string }>(
  employee: T,
) {
  const { cognitoSubject: _cognitoSubject, ...publicRecord } = employee;
  return publicRecord;
}

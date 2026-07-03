export const ATTENDANCE_ALERT_EQUIVALENT_ABSENCES = 2;
export const ATTENDANCE_ALERT_LATE_ARRIVALS = 6;
export const ATTENDANCE_WITHDRAWAL_ABSENCES = 3;
export const ATTENDANCE_WITHDRAWAL_LATE_ARRIVALS = 9;
export const LATE_ARRIVALS_PER_ABSENCE = 3;

export function calculateAttendanceRisk(absences: number, lateArrivals: number) {
  const equivalentAbsences = absences + Math.floor(lateArrivals / LATE_ARRIVALS_PER_ABSENCE);
  const withdrawn = absences >= ATTENDANCE_WITHDRAWAL_ABSENCES
    || lateArrivals >= ATTENDANCE_WITHDRAWAL_LATE_ARRIVALS
    || equivalentAbsences >= ATTENDANCE_WITHDRAWAL_ABSENCES;
  return {
    absences,
    lateArrivals,
    equivalentAbsences,
    alert: !withdrawn && (
      equivalentAbsences >= ATTENDANCE_ALERT_EQUIVALENT_ABSENCES
      || lateArrivals >= ATTENDANCE_ALERT_LATE_ARRIVALS
    ),
    withdrawn,
  };
}

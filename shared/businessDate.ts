/** Calendar dates shared by the shop's browser and server, independent of device timezone. */
export const BUSINESS_TIMEZONE = 'Africa/Cairo';

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export const businessCalendarDate = (value: Date = new Date()): string => formatter.format(value);

// Patient names are also their login, so they are unique. Same rules as the database
// (norm_name in 0007_patient_login.sql) and the create-user function.
export const normName = (s) => String(s || '').toLowerCase()
  .replace(/[ً-ْـ]/g, '')
  .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/\s+/g, ' ').trim();

export const cleanName = (s) => String(s || '').trim().replace(/\s+/g, ' ');
export const validName = (s) => /^[\p{L}\p{N}][\p{L}\p{M}\p{N} ._-]{1,39}$/u.test(s) && /\p{L}/u.test(s);
